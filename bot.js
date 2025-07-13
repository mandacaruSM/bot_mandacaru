require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Configurações
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DB_PATH = process.env.DB_PATH || 'D:\\projeto\\mandacaru_erp\\db.sqlite3';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10485760;
const SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT) || 7200000;

if (!BOT_TOKEN || BOT_TOKEN === 'SEU_TOKEN_AQUI') {
    console.error('❌ Configure o token do bot no arquivo .env!');
    process.exit(1);
}

console.log('🏭 Bot Telegram Mandacaru ERP - Versão Integrada');
console.log('📁 Banco de dados:', DB_PATH);

const bot = new TelegramBot(BOT_TOKEN, { 
    polling: true,
    request: {
        agentOptions: {
            keepAlive: true,
            family: 4
        }
    }
});

// Conectar ao banco SQLite3
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('❌ Erro ao conectar com banco:', err.message);
        process.exit(1);
    }
    console.log('✅ Conectado ao banco SQLite3 do ERP Mandacaru');
});

// Armazenamento de sessões ativas
const activeChecklists = new Map();
const userPermissions = new Map();

// Classe de sessão do checklist
class ChecklistSession {
    constructor(chatId, equipmentData, userId, userInfo) {
        this.chatId = chatId;
        this.userId = userId;
        this.userInfo = userInfo;
        this.equipmentData = equipmentData;
        this.currentItemIndex = 0;
        this.responses = [];
        this.photos = [];
        this.observations = [];
        this.startTime = new Date();
        this.lastActivity = new Date();
        this.status = 'active';
        this.isPaused = false;
        this.sessionId = `${chatId}_${Date.now()}`;
    }
    
    updateActivity() {
        this.lastActivity = new Date();
    }
    
    addObservation(text) {
        this.observations.push({
            timestamp: new Date().toISOString(),
            text: text,
            item_index: this.currentItemIndex
        });
    }
    
    getProgress() {
        return {
            current: this.currentItemIndex,
            total: this.equipmentData.checklist.items.length,
            percentage: Math.round((this.currentItemIndex / this.equipmentData.checklist.items.length) * 100)
        };
    }
}

// Sistema de logs
class MandacaruLogger {
    static log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
        
        if (data) {
            console.log('Data:', JSON.stringify(data, null, 2));
        }
    }
    
    static info(message, data) { this.log('info', message, data); }
    static warn(message, data) { this.log('warn', message, data); }
    static error(message, data) { this.log('error', message, data); }
}

// Verificar permissões do usuário usando tabela existente
async function checkUserPermissions(telegramId, username) {
    return new Promise((resolve, reject) => {
        // Buscar usuário na tabela auth_cliente_usuariocliente
        const sql = `
            SELECT 
                id, username, first_name, last_name, email, 
                is_active, telegram_chat_id, cargo, ativo
            FROM auth_cliente_usuariocliente 
            WHERE telegram_chat_id = ? OR username = ?
        `;
        
        db.get(sql, [telegramId, username], (err, user) => {
            if (err) {
                MandacaruLogger.error('Erro ao verificar permissões', { telegramId, error: err.message });
                resolve({ canUseBot: false, reason: 'Erro na verificação' });
                return;
            }
            
            if (!user) {
                MandacaruLogger.warn('Usuário não encontrado', { telegramId, username });
                resolve({ canUseBot: false, reason: 'Usuário não cadastrado no ERP' });
                return;
            }
            
            if (!user.is_active || !user.ativo) {
                resolve({ canUseBot: false, reason: 'Usuário inativo' });
                return;
            }
            
            MandacaruLogger.info('Usuário autorizado', { 
                telegramId, 
                username, 
                userId: user.id,
                cargo: user.cargo 
            });
            
            resolve({ 
                canUseBot: true, 
                userInfo: user,
                permissions: {
                    canCreateChecklist: true,
                    canViewReports: true,
                    isAdmin: user.cargo && user.cargo.toLowerCase().includes('admin')
                }
            });
        });
    });
}

// Buscar dados do equipamento usando tabelas existentes
async function getEquipmentData(equipmentId) {
    return new Promise((resolve, reject) => {
        // Buscar equipamento na tabela equipamentos_equipamento
        const equipmentSql = `
            SELECT 
                e.id, e.nome, e.descricao, e.marca, e.modelo, 
                e.n_serie, e.ativo_nr12, e.frequencia_checklist,
                c.nome as categoria_nome
            FROM equipamentos_equipamento e
            LEFT JOIN equipamentos_categoriaequipamento c ON e.categoria_id = c.id
            WHERE e.id = ? AND e.ativo_nr12 = 1
        `;
        
        db.get(equipmentSql, [equipmentId], (err, equipment) => {
            if (err) {
                MandacaruLogger.error('Erro ao buscar equipamento', { equipmentId, error: err.message });
                reject(err);
                return;
            }
            
            if (!equipment) {
                reject(new Error('Equipamento não encontrado ou não ativo para NR12'));
                return;
            }
            
            // Buscar checklist NR12 associado
            const checklistSql = `
                SELECT 
                    c.id, c.nome, c.descricao,
                    t.nome as tipo_nome
                FROM nr12_checklist_checklistnr12 c
                LEFT JOIN nr12_checklist_tipoequipamentonr12 t ON c.tipo_equipamento_id = t.id
                WHERE c.tipo_equipamento_id = (
                    SELECT tipo_nr12_id FROM equipamentos_equipamento WHERE id = ?
                )
                LIMIT 1
            `;
            
            db.get(checklistSql, [equipmentId], (err, checklist) => {
                if (err) {
                    MandacaruLogger.error('Erro ao buscar checklist', { equipmentId, error: err.message });
                    reject(err);
                    return;
                }
                
                if (!checklist) {
                    reject(new Error('Nenhum checklist NR12 encontrado para este equipamento'));
                    return;
                }
                
                // Buscar itens do checklist
                const itemsSql = `
                    SELECT 
                        id, item_descricao, ordem, obrigatorio, observacoes
                    FROM nr12_checklist_itemchecklistpadrao
                    WHERE checklist_id = ?
                    ORDER BY ordem
                `;
                
                db.all(itemsSql, [checklist.id], (err, items) => {
                    if (err) {
                        MandacaruLogger.error('Erro ao buscar itens do checklist', { 
                            checklistId: checklist.id, 
                            error: err.message 
                        });
                        reject(err);
                        return;
                    }
                    
                    if (!items || items.length === 0) {
                        reject(new Error('Checklist não possui itens cadastrados'));
                        return;
                    }
                    
                    // Montar estrutura de resposta
                    const equipmentData = {
                        equipment: {
                            id: equipment.id,
                            name: equipment.nome,
                            code: `EQ-${equipment.id}`,
                            location: 'Não informado', // Adicionar campo se necessário
                            description: equipment.descricao,
                            brand: equipment.marca,
                            model: equipment.modelo,
                            serial: equipment.n_serie,
                            category: equipment.categoria_nome
                        },
                        checklist: {
                            id: checklist.id,
                            name: checklist.nome || `Checklist NR12 - ${equipment.nome}`,
                            description: checklist.descricao,
                            type: checklist.tipo_nome,
                            items: items.map((item, index) => ({
                                id: item.id,
                                description: item.item_descricao,
                                instructions: item.observacoes,
                                priority: item.obrigatorio ? 'high' : 'medium',
                                order: item.ordem || index,
                                is_mandatory: item.obrigatorio
                            }))
                        }
                    };
                    
                    MandacaruLogger.info('Dados do equipamento obtidos', {
                        equipmentId: equipment.id,
                        equipmentName: equipment.nome,
                        checklistId: checklist.id,
                        itemsCount: items.length
                    });
                    
                    resolve(equipmentData);
                });
            });
        });
    });
}

// Salvar execução do checklist
async function saveChecklistExecution(session) {
    return new Promise((resolve, reject) => {
        const endTime = new Date();
        const duration = Math.round((endTime - session.startTime) / 1000 / 60);
        
        // Calcular estatísticas
        const totalItems = session.responses.length;
        const okItems = session.responses.filter(r => r.status === 'ok').length;
        const nokItems = session.responses.filter(r => r.status === 'nok').length;
        const skippedItems = session.responses.filter(r => r.status === 'skip').length;
        const completionRate = totalItems > 0 ? Math.round((okItems / totalItems) * 100) : 0;
        
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            
            // Inserir na tabela checklist_executions (nossa tabela)
            const executionSql = `
                INSERT INTO checklist_executions (
                    equipment_id, checklist_id, user_telegram_id, session_id,
                    start_time, end_time, duration_minutes, total_items,
                    ok_items, nok_items, skipped_items, completion_rate,
                    status, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            db.run(executionSql, [
                session.equipmentData.equipment.id,
                session.equipmentData.checklist.id,
                session.userId,
                session.sessionId,
                session.startTime.toISOString(),
                endTime.toISOString(),
                duration,
                totalItems,
                okItems,
                nokItems,
                skippedItems,
                completionRate,
                'completed',
                session.observations.map(obs => obs.text).join('; ')
            ], function(err) {
                if (err) {
                    db.run('ROLLBACK');
                    MandacaruLogger.error('Erro ao salvar execução', { 
                        sessionId: session.sessionId, 
                        error: err.message 
                    });
                    reject(err);
                    return;
                }
                
                const executionId = this.lastID;
                
                // Inserir respostas
                const responsePromises = session.responses.map(response => {
                    return new Promise((resolveResponse, rejectResponse) => {
                        const responseSql = `
                            INSERT INTO checklist_responses (
                                checklist_execution_id, item_index, item_description,
                                status, response_time, observations
                            ) VALUES (?, ?, ?, ?, ?, ?)
                        `;
                        
                        db.run(responseSql, [
                            executionId,
                            response.item_index,
                            response.item_description,
                            response.status,
                            response.timestamp,
                            response.observations || ''
                        ], (err) => {
                            if (err) rejectResponse(err);
                            else resolveResponse();
                        });
                    });
                });
                
                Promise.all(responsePromises)
                    .then(() => {
                        // Salvar fotos se houver
                        const photoPromises = session.photos.map(photo => {
                            return new Promise((resolvePhoto, rejectPhoto) => {
                                const photoSql = `
                                    INSERT INTO checklist_photos (
                                        checklist_execution_id, item_index, file_path,
                                        file_name, caption, taken_at
                                    ) VALUES (?, ?, ?, ?, ?, ?)
                                `;
                                
                                db.run(photoSql, [
                                    executionId,
                                    photo.item_index,
                                    `photos/${session.sessionId}_${photo.item_index}_${Date.now()}.jpg`,
                                    `photo_${Date.now()}.jpg`,
                                    photo.caption || '',
                                    photo.timestamp
                                ], (err) => {
                                    if (err) rejectPhoto(err);
                                    else resolvePhoto();
                                });
                            });
                        });
                        
                        return Promise.all(photoPromises);
                    })
                    .then(() => {
                        db.run('COMMIT', (err) => {
                            if (err) {
                                MandacaruLogger.error('Erro ao confirmar transação', { error: err.message });
                                reject(err);
                            } else {
                                MandacaruLogger.info('Checklist salvo com sucesso', {
                                    executionId,
                                    sessionId: session.sessionId,
                                    equipmentId: session.equipmentData.equipment.id,
                                    duration,
                                    completionRate
                                });
                                resolve({ executionId, completionRate, duration });
                            }
                        });
                    })
                    .catch(err => {
                        db.run('ROLLBACK');
                        reject(err);
                    });
            });
        });
    });
}

// Mostrar item atual do checklist
function showCurrentItem(chatId) {
    const session = activeChecklists.get(chatId);
    if (!session) {
        MandacaruLogger.warn('Tentativa de mostrar item sem sessão ativa', { chatId });
        return;
    }
    
    session.updateActivity();
    
    const currentItem = session.equipmentData.checklist.items[session.currentItemIndex];
    if (!currentItem) {
        finalizeChecklist(chatId);
        return;
    }
    
    const progress = session.getProgress();
    
    let message = `🏭 **CHECKLIST MANDACARU ERP**\n`;
    message += `**${session.equipmentData.equipment.name}**\n`;
    message += `📍 ${session.equipmentData.equipment.brand} ${session.equipmentData.equipment.model}\n\n`;
    
    // Barra de progresso
    const progressBar = '█'.repeat(Math.floor(progress.percentage / 10)) + 
                       '░'.repeat(10 - Math.floor(progress.percentage / 10));
    message += `📊 **Progresso:** [${progressBar}] ${progress.percentage}%\n`;
    message += `**Item ${progress.current + 1}/${progress.total}**\n\n`;
    
    // Descrição do item
    message += `📋 **${currentItem.description}**\n\n`;
    
    if (currentItem.instructions) {
        message += `💡 **Instruções:** ${currentItem.instructions}\n\n`;
    }
    
    if (currentItem.is_mandatory) {
        message += `🔴 **Item obrigatório**\n\n`;
    }
    
    message += `❓ **Como está este item?**`;
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ CONFORME', callback_data: 'item_ok' },
                    { text: '❌ NÃO CONFORME', callback_data: 'item_nok' }
                ],
                [
                    { text: '⏭️ PULAR ITEM', callback_data: 'item_skip' },
                    { text: '💬 Observação', callback_data: 'add_observation' }
                ],
                [
                    { text: '⏸️ Pausar', callback_data: 'pause_checklist' },
                    { text: '📊 Status', callback_data: 'show_status' }
                ]
            ]
        }
    };
    
    bot.sendMessage(chatId, message, { 
        parse_mode: 'Markdown',
        ...keyboard
    });
}

// Finalizar checklist
async function finalizeChecklist(chatId) {
    const session = activeChecklists.get(chatId);
    if (!session) return;
    
    try {
        bot.sendMessage(chatId, '💾 Salvando checklist no ERP Mandacaru...');
        
        const result = await saveChecklistExecution(session);
        
        const progress = session.getProgress();
        const duration = Math.round((new Date() - session.startTime) / 1000 / 60);
        const okItems = session.responses.filter(r => r.status === 'ok').length;
        const nokItems = session.responses.filter(r => r.status === 'nok').length;
        const skippedItems = session.responses.filter(r => r.status === 'skip').length;
        
        let message = `🎉 **CHECKLIST FINALIZADO!**\n\n`;
        message += `**Equipamento:** ${session.equipmentData.equipment.name}\n`;
        message += `**Checklist:** ${session.equipmentData.checklist.name}\n`;
        message += `**Duração:** ${duration} minutos\n`;
        message += `**Taxa de aprovação:** ${result.completionRate}%\n\n`;
        
        message += `**📊 Resultados:**\n`;
        message += `✅ Conformes: ${okItems}\n`;
        message += `❌ Não conformes: ${nokItems}\n`;
        message += `⏭️ Pulados: ${skippedItems}\n`;
        message += `💬 Observações: ${session.observations.length}\n`;
        message += `📸 Fotos: ${session.photos.length}\n\n`;
        
        if (nokItems > 0) {
            message += `⚠️ **ATENÇÃO:** ${nokItems} item(ns) com problema!\n`;
            message += `Verifique o relatório no sistema.\n\n`;
        }
        
        message += `**📄 ID da Execução:** ${result.executionId}\n`;
        message += `✅ **Dados salvos no ERP Mandacaru!**`;
        
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🔄 Novo Checklist', callback_data: 'new_checklist' },
                        { text: '📊 Relatórios', callback_data: 'view_reports' }
                    ]
                ]
            }
        };
        
        bot.sendMessage(chatId, message, { 
            parse_mode: 'Markdown',
            ...keyboard
        });
        
    } catch (error) {
        MandacaruLogger.error('Erro ao finalizar checklist', { 
            sessionId: session.sessionId,
            error: error.message 
        });
        
        bot.sendMessage(chatId, 
            `❌ **Erro ao salvar checklist**\n\n` +
            `Erro: ${error.message}\n\n` +
            `Tente novamente ou contate o suporte.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    activeChecklists.delete(chatId);
}

// Estado para observações
const awaitingObservation = new Set();

// Comando /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    
    MandacaruLogger.info('Comando /start executado', { 
        chatId, 
        userId, 
        username,
        firstName: msg.from.first_name 
    });
    
    try {
        const permissions = await checkUserPermissions(userId.toString(), username);
        
        if (!permissions.canUseBot) {
            const deniedMessage = `🚫 **Acesso Negado - ERP Mandacaru**\n\n` +
                `Olá ${msg.from.first_name}!\n\n` +
                `Você não tem permissão para usar este bot.\n` +
                `**Motivo:** ${permissions.reason}\n\n` +
                `📞 Entre em contato com o administrador do sistema.`;
            
            bot.sendMessage(chatId, deniedMessage, { parse_mode: 'Markdown' });
            return;
        }
        
        const welcomeMessage = `🏭 **Bot Checklist ERP Mandacaru**\n\n` +
            `Olá **${msg.from.first_name}**! 👋\n\n` +
            `Bem-vindo ao sistema de checklist NR12 integrado.\n\n` +
            `🆕 **Funcionalidades:**\n` +
            `• ✅ Checklists NR12 completos\n` +
            `• 📸 Fotos para não conformidades\n` +
            `• 💬 Sistema de observações\n` +
            `• ⏸️ Pausar e continuar\n` +
            `• 📊 Integração total com ERP\n\n` +
            `📋 **Como usar:**\n` +
            `1. 🔍 Envie o ID do equipamento\n` +
            `2. ✅ Complete o checklist NR12\n` +
            `3. 📸 Tire fotos quando necessário\n` +
            `4. 💾 Finalize automaticamente\n\n` +
            `🎯 **Digite o ID do equipamento para começar!**\n` +
            `(Ex: 6, 7, 8)`;
        
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '📋 Meus Checklists', callback_data: 'my_checklists' },
                        { text: '❓ Ajuda', callback_data: 'help' }
                    ],
                    [
                        { text: '🏭 Equipamentos', callback_data: 'list_equipments' },
                        { text: '📊 Relatórios', callback_data: 'view_reports' }
                    ]
                ]
            }
        };
        
        bot.sendMessage(chatId, welcomeMessage, { 
            parse_mode: 'Markdown',
            ...keyboard
        });
        
    } catch (error) {
        MandacaruLogger.error('Erro no comando /start', { 
            chatId, 
            userId, 
            username,
            error: error.message 
        });
        
        bot.sendMessage(chatId, 
            '❌ **Erro interno do sistema**\n\n' +
            'Tente novamente em alguns minutos.',
            { parse_mode: 'Markdown' }
        );
    }
});

// Processar mensagens (IDs de equipamentos)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    
    // Ignora comandos
    if (text && text.startsWith('/')) return;
    
    // Processa observações
    if (awaitingObservation.has(chatId)) {
        const session = activeChecklists.get(chatId);
        if (session && text) {
            session.addObservation(text);
            awaitingObservation.delete(chatId);
            
            bot.sendMessage(chatId, '✅ **Observação salva!**\n\nContinuando checklist...', {
                parse_mode: 'Markdown'
            });
            setTimeout(() => showCurrentItem(chatId), 1500);
            return;
        }
    }
    
    // Verifica se é um número (ID do equipamento)
    if (text && /^\d+$/.test(text.trim())) {
        const equipmentId = parseInt(text.trim());
        
        try {
            // Verificar permissões
            const permissions = await checkUserPermissions(userId.toString(), username);
            if (!permissions.canUseBot) {
                bot.sendMessage(chatId, '🚫 Sem permissão para iniciar checklist.');
                return;
            }
        } catch (error) {
            bot.sendMessage(chatId, '❌ Erro ao verificar permissões.');
            return;
        }
        
        // Verificar se já tem checklist ativo
        if (activeChecklists.has(chatId)) {
            const session = activeChecklists.get(chatId);
            const progress = session.getProgress();
            
            bot.sendMessage(chatId, 
                `⚠️ **Checklist já ativo**\n\n` +
                `Equipamento: ${session.equipmentData.equipment.name}\n` +
                `Progresso: ${progress.current}/${progress.total} (${progress.percentage}%)\n\n` +
                `Use /cancel para cancelar ou continue o checklist atual.`,
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        const loadingMsg = await bot.sendMessage(chatId, '🔍 **Buscando equipamento no ERP...**');
        
        try {
            MandacaruLogger.info('Buscando equipamento', { 
                chatId, 
                userId, 
                equipmentId 
            });
            
            const equipmentData = await getEquipmentData(equipmentId);
            
            const session = new ChecklistSession(chatId, equipmentData, userId.toString(), {
                username: username,
                first_name: msg.from.first_name,
                last_name: msg.from.last_name
            });
            
            activeChecklists.set(chatId, session);
            
            await bot.editMessageText('✅ **Equipamento encontrado!** Preparando checklist...', {
                chat_id: chatId,
                message_id: loadingMsg.message_id,
                parse_mode: 'Markdown'
            });
            
            const confirmMessage = `🎯 **Equipamento Mandacaru ERP**\n\n` +
                `**📋 Informações:**\n` +
                `• **Nome:** ${equipmentData.equipment.name}\n` +
                `• **ID:** ${equipmentData.equipment.id}\n` +
                `• **Marca/Modelo:** ${equipmentData.equipment.brand} ${equipmentData.equipment.model}\n` +
                `• **Categoria:** ${equipmentData.equipment.category}\n\n` +
                `**✅ Checklist NR12:**\n` +
                `• **Nome:** ${equipmentData.checklist.name}\n` +
                `• **Tipo:** ${equipmentData.checklist.type}\n` +
                `• **Total de itens:** ${equipmentData.checklist.items.length}\n\n` +
                `🚀 **Iniciando checklist em 3 segundos...**`;
            
            bot.sendMessage(chatId, confirmMessage, { parse_mode: 'Markdown' });
            
            setTimeout(() => showCurrentItem(chatId), 3000);
            
        } catch (error) {
            MandacaruLogger.error('Erro ao buscar equipamento', { 
                chatId, 
                userId, 
                equipmentId, 
                error: error.message 
            });
            
            await bot.editMessageText('❌ **Erro ao buscar equipamento**', {
                chat_id: chatId,
                message_id: loadingMsg.message_id,
                parse_mode: 'Markdown'
            });
            
            let errorMessage = `❌ **Equipamento não encontrado**\n\n`;
            errorMessage += `**ID buscado:** ${equipmentId}\n`;
            errorMessage += `**Erro:** ${error.message}\n\n`;
            errorMessage += `**Verifique se:**\n`;
            errorMessage += `• O ID está correto\n`;
            errorMessage += `• O equipamento está ativo para NR12\n`;
            errorMessage += `• Existe checklist cadastrado\n\n`;
            errorMessage += `💡 **Dica:** Use /equipments para ver IDs disponíveis`;
            
            bot.sendMessage(chatId, errorMessage, { parse_mode: 'Markdown' });
        }
    }
    
    // Processar fotos
    if (msg.photo && activeChecklists.has(chatId)) {
        const session = activeChecklists.get(chatId);
        session.updateActivity();
        
        const photo = msg.photo[msg.photo.length - 1];
        
        if (photo.file_size > MAX_FILE_SIZE) {
            bot.sendMessage(chatId, 
                `❌ **Foto muito grande**\n\n` +
                `Tamanho máximo: ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB\n` +
                `Tamanho da foto: ${Math.round(photo.file_size / 1024 / 1024)}MB`,
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        const processingMsg = await bot.sendMessage(chatId, '📸 **Processando foto...**');
        
        try {
            const photoData = {
                item_index: session.currentItemIndex - 1,
                file_id: photo.file_id,
                caption: msg.caption || '',
                timestamp: new Date().toISOString(),
                file_size: photo.file_size,
                session_id: session.sessionId
            };
            
            session.photos.push(photoData);
            
            MandacaruLogger.info('Foto processada', { 
                sessionId: session.sessionId,
                fileSize: photo.file_size,
                itemIndex: photoData.item_index
            });
            
            await bot.editMessageText('✅ **Foto salva!**', {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: 'Markdown'
            });
            
            bot.sendMessage(chatId, '📸 Foto salva! Continuando checklist...');
            setTimeout(() => showCurrentItem(chatId), 2000);
            
        } catch (error) {
            MandacaruLogger.error('Erro ao processar foto', { 
                sessionId: session.sessionId,
                chatId, 
                error: error.message 
            });
            
            await bot.editMessageText('❌ **Erro ao processar foto**', {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: 'Markdown'
            });
            
            bot.sendMessage(chatId, 'Continuando checklist sem a foto...');
            setTimeout(() => showCurrentItem(chatId), 1000);
        }
    }
});

// Callback queries (botões)
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    const messageId = callbackQuery.message.message_id;
    const userId = callbackQuery.from.id;
    
    const session = activeChecklists.get(chatId);
    
    bot.answerCallbackQuery(callbackQuery.id);
    
    // Comandos que não precisam de sessão
    switch (data) {
        case 'help':
            const helpMessage = `🆘 **Ajuda - Bot Mandacaru ERP**\n\n` +
                `**📋 Comandos:**\n` +
                `/start - Iniciar bot\n` +
                `/equipments - Listar equipamentos\n` +
                `/status - Status atual\n` +
                `/cancel - Cancelar checklist\n\n` +
                `**🔧 Como usar:**\n` +
                `1. Envie o ID do equipamento\n` +
                `2. Complete o checklist NR12\n` +
                `3. Tire fotos para itens NOK\n` +
                `4. Finalize automaticamente\n\n` +
                `**📱 Dicas:**\n` +
                `• Use botões para responder\n` +
                `• Adicione observações\n` +
                `• Pause se necessário`;
            
            bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
            return;
            
        case 'list_equipments':
            listEquipments(chatId);
            return;
            
        case 'view_reports':
            bot.sendMessage(chatId, 
                '📊 **Relatórios**\n\n' +
                'Acesse o painel do ERP Mandacaru para visualizar relatórios detalhados dos checklists realizados.',
                { parse_mode: 'Markdown' }
            );
            return;
    }
    
    // Comandos que precisam de sessão
    if (!session) {
        bot.sendMessage(chatId, 
            '❌ **Sessão expirada**\n\n' +
            'Inicie um novo checklist enviando o ID do equipamento.',
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    session.updateActivity();
    
    switch (data) {
        case 'pause_checklist':
            session.isPaused = true;
            bot.sendMessage(chatId, 
                '⏸️ **Checklist pausado**\n\n' +
                'Use /continue para retomar.',
                { parse_mode: 'Markdown' }
            );
            break;
            
        case 'add_observation':
            awaitingObservation.add(chatId);
            bot.sendMessage(chatId,
                `💬 **Adicionar Observação**\n\n` +
                `**Item:** ${session.equipmentData.checklist.items[session.currentItemIndex].description}\n\n` +
                `Digite sua observação:`,
                { parse_mode: 'Markdown' }
            );
            break;
            
        case 'show_status':
            showStatus(chatId);
            break;
            
        case 'item_ok':
        case 'item_nok':
        case 'item_skip':
            processItemResponse(chatId, data, messageId);
            break;
    }
});

// Processar resposta do item
function processItemResponse(chatId, response, messageId) {
    const session = activeChecklists.get(chatId);
    if (!session || session.isPaused) return;
    
    const currentItem = session.equipmentData.checklist.items[session.currentItemIndex];
    const statusMap = {
        'item_ok': 'ok',
        'item_nok': 'nok', 
        'item_skip': 'skip'
    };
    
    const status = statusMap[response];
    const statusText = {
        'ok': '✅ CONFORME',
        'nok': '❌ NÃO CONFORME',
        'skip': '⏭️ PULADO'
    };
    
    // Salvar resposta
    session.responses.push({
        item_index: session.currentItemIndex,
        item_description: currentItem.description,
        status: status,
        timestamp: new Date().toISOString(),
        session_id: session.sessionId
    });
    
    // Atualizar mensagem
    bot.editMessageText(
        `${statusText[status]} **${currentItem.description}**\n\n` +
        `Registrado em: ${new Date().toLocaleTimeString('pt-BR')}`,
        {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown'
        }
    );
    
    // Se NOK, solicitar foto
    if (status === 'nok') {
        bot.sendMessage(chatId,
            `📸 **FOTO OBRIGATÓRIA**\n\n` +
            `Item não conforme requer documentação fotográfica.\n\n` +
            `**Tire uma foto do problema e envie aqui.**`,
            { parse_mode: 'Markdown' }
        );
    }
    
    // Próximo item
    session.currentItemIndex++;
    
    if (status !== 'nok') {
        setTimeout(() => showCurrentItem(chatId), 2000);
    }
}

// Mostrar status da sessão
function showStatus(chatId) {
    const session = activeChecklists.get(chatId);
    if (!session) return;
    
    const progress = session.getProgress();
    const elapsed = Math.round((new Date() - session.startTime) / 1000 / 60);
    const okCount = session.responses.filter(r => r.status === 'ok').length;
    const nokCount = session.responses.filter(r => r.status === 'nok').length;
    
    const message = `📊 **Status - Mandacaru ERP**\n\n` +
        `**🏭 Equipamento:** ${session.equipmentData.equipment.name}\n` +
        `**🆔 ID:** ${session.equipmentData.equipment.id}\n` +
        `**📋 Checklist:** ${session.equipmentData.checklist.name}\n\n` +
        `**📈 Progresso:**\n` +
        `• Item: ${progress.current + 1}/${progress.total}\n` +
        `• Percentual: ${progress.percentage}%\n` +
        `• Status: ${session.isPaused ? '⏸️ Pausado' : '▶️ Ativo'}\n\n` +
        `**⏱️ Tempo:** ${elapsed} minutos\n\n` +
        `**📋 Respostas:**\n` +
        `• ✅ Conformes: ${okCount}\n` +
        `• ❌ Não conformes: ${nokCount}\n` +
        `• 📸 Fotos: ${session.photos.length}\n` +
        `• 💬 Observações: ${session.observations.length}`;
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

// Listar equipamentos disponíveis
function listEquipments(chatId) {
    const sql = `
        SELECT 
            e.id, e.nome, e.marca, e.modelo, 
            c.nome as categoria
        FROM equipamentos_equipamento e
        LEFT JOIN equipamentos_categoriaequipamento c ON e.categoria_id = c.id
        WHERE e.ativo_nr12 = 1
        ORDER BY e.nome
        LIMIT 10
    `;
    
    db.all(sql, [], (err, equipments) => {
        if (err) {
            MandacaruLogger.error('Erro ao listar equipamentos', { error: err.message });
            bot.sendMessage(chatId, '❌ Erro ao buscar equipamentos.');
            return;
        }
        
        if (!equipments || equipments.length === 0) {
            bot.sendMessage(chatId, '❌ Nenhum equipamento NR12 encontrado.');
            return;
        }
        
        let message = `🏭 **Equipamentos Disponíveis**\n\n`;
        
        equipments.forEach(eq => {
            message += `**ID ${eq.id}:** ${eq.nome}\n`;
            message += `📍 ${eq.marca} ${eq.modelo}\n`;
            message += `🏷️ ${eq.categoria || 'Sem categoria'}\n\n`;
        });
        
        message += `💡 **Para iniciar checklist, envie o ID do equipamento**`;
        
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    });
}

// Comandos adicionais
bot.onText(/\/equipments/, (msg) => {
    listEquipments(msg.chat.id);
});

bot.onText(/\/status/, (msg) => {
    showStatus(msg.chat.id);
});

bot.onText(/\/cancel/, (msg) => {
    const chatId = msg.chat.id;
    const session = activeChecklists.get(chatId);
    
    if (!session) {
        bot.sendMessage(chatId, '❌ Nenhum checklist ativo para cancelar.');
        return;
    }
    
    activeChecklists.delete(chatId);
    bot.sendMessage(chatId, 
        `❌ **Checklist cancelado**\n\n` +
        `Equipamento: ${session.equipmentData.equipment.name}\n` +
        `Progresso perdido: ${session.getProgress().percentage}%`,
        { parse_mode: 'Markdown' }
    );
});

bot.onText(/\/continue/, (msg) => {
    const chatId = msg.chat.id;
    const session = activeChecklists.get(chatId);
    
    if (!session) {
        bot.sendMessage(chatId, '❌ Nenhum checklist para continuar.');
        return;
    }
    
    if (!session.isPaused) {
        bot.sendMessage(chatId, '✅ Checklist já está ativo.');
        return;
    }
    
    session.isPaused = false;
    bot.sendMessage(chatId, '▶️ **Checklist retomado!**');
    setTimeout(() => showCurrentItem(chatId), 1000);
});

// Tratamento de erros
bot.on('error', (error) => {
    MandacaruLogger.error('Erro do bot', { error: error.message });
});

bot.on('polling_error', (error) => {
    MandacaruLogger.error('Erro de polling', { error: error.message });
});

// Limpeza de sessões antigas
setInterval(() => {
    const now = new Date();
    const expiredSessions = [];
    
    for (const [chatId, session] of activeChecklists) {
        if (now - session.lastActivity > SESSION_TIMEOUT) {
            expiredSessions.push({ chatId, session });
        }
    }
    
    expiredSessions.forEach(({ chatId, session }) => {
        activeChecklists.delete(chatId);
        bot.sendMessage(chatId,
            `⏰ **Sessão expirada**\n\n` +
            `Checklist cancelado por inatividade.\n` +
            `Equipamento: ${session.equipmentData.equipment.name}`,
            { parse_mode: 'Markdown' }
        );
    });
    
    if (expiredSessions.length > 0) {
        MandacaruLogger.info('Sessões expiradas limpas', { 
            count: expiredSessions.length 
        });
    }
}, 60 * 60 * 1000); // A cada hora

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Encerrando bot...');
    
    // Notificar usuários ativos
    for (const [chatId] of activeChecklists) {
        bot.sendMessage(chatId,
            '🔄 **Manutenção do sistema**\n\n' +
            'O bot será reiniciado em breve.',
            { parse_mode: 'Markdown' }
        ).catch(() => {});
    }
    
    db.close((err) => {
        if (err) {
            MandacaruLogger.error('Erro ao fechar banco', { error: err.message });
        } else {
            MandacaruLogger.info('Banco fechado com sucesso');
        }
        process.exit(0);
    });
});

// Startup
console.log('🤖 Bot Telegram Mandacaru ERP iniciado!');
console.log('📱 Integrado com banco SQLite3');
console.log('🔗 Usando tabelas existentes do ERP');
console.log(`⏱️ Timeout de sessão: ${SESSION_TIMEOUT / 1000 / 60} minutos`);

MandacaruLogger.info('Bot iniciado com sucesso', {
    dbPath: DB_PATH,
    sessionTimeout: SESSION_TIMEOUT,
    maxFileSize: MAX_FILE_SIZE
});

// Testar conexão com banco
db.get("SELECT COUNT(*) as count FROM equipamentos_equipamento WHERE ativo_nr12 = 1", (err, result) => {
    if (err) {
        MandacaruLogger.error('Erro ao testar banco', { error: err.message });
    } else {
        MandacaruLogger.info('Equipamentos NR12 ativos encontrados', { count: result.count });
    }
});

module.exports = { bot, db, activeChecklists };