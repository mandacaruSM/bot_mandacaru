const sqlite3 = require('sqlite3').verbose();

const dbPath = 'D:\\projeto\\mandacaru_erp\\db.sqlite3';
const db = new sqlite3.Database(dbPath);

// SUBSTITUA ESTES VALORES PELOS SEUS DADOS REAIS:
const TELEGRAM_ID = 'SEU_ID_AQUI';  // O ID que apareceu no console
const USERNAME = 'willians';         // Seu username do Telegram
const FIRST_NAME = 'Willians';       // Seu primeiro nome

console.log('👤 Adicionando usuário ao ERP Mandacaru...');

// Inserir ou atualizar usuário na tabela auth_cliente_usuariocliente
const sql = `
    INSERT OR REPLACE INTO auth_cliente_usuariocliente (
        username, first_name, email, is_active, telegram_chat_id, 
        cargo, ativo, created_at, updated_at, cliente_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const now = new Date().toISOString();

db.run(sql, [
    USERNAME,
    FIRST_NAME,
    `${USERNAME}@mandacaru.com`,  // Email temporário
    1,                            // is_active
    TELEGRAM_ID,                  // telegram_chat_id
    'Administrador Bot',          // cargo
    1,                            // ativo
    now,                          // created_at
    now,                          // updated_at
    1                             // cliente_id (ajuste se necessário)
], function(err) {
    if (err) {
        console.error('❌ Erro ao inserir usuário:', err.message);
    } else {
        console.log('✅ Usuário adicionado com sucesso!');
        console.log('🆔 ID do registro:', this.lastID);
        
        // Verificar se foi inserido
        db.get("SELECT * FROM auth_cliente_usuariocliente WHERE telegram_chat_id = ?", [TELEGRAM_ID], (err, user) => {
            if (err) {
                console.error('❌ Erro ao verificar:', err.message);
            } else if (user) {
                console.log('✅ Usuário encontrado:');
                console.log('  - ID:', user.id);
                console.log('  - Username:', user.username);
                console.log('  - Nome:', user.first_name);
                console.log('  - Telegram ID:', user.telegram_chat_id);
                console.log('  - Cargo:', user.cargo);
                console.log('  - Ativo:', user.ativo);
            }
            
            db.close();
        });
    }
});
