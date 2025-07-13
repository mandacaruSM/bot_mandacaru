const sqlite3 = require('sqlite3').verbose();

const dbPath = 'D:\\projeto\\mandacaru_erp\\db.sqlite3';
const db = new sqlite3.Database(dbPath);

// ⚠️ SUBSTITUA pelo seu Telegram ID real:
const TELEGRAM_ID = '853870420';

console.log('🔄 Atualizando usuário mandacaru...');

// Atualizar o usuário existente com seu Telegram ID
const sql = `
    UPDATE auth_cliente_usuariocliente 
    SET telegram_chat_id = ?, 
        first_name = 'Willians',
        cargo = 'Administrador',
        updated_at = ?
    WHERE id = 1
`;

const now = new Date().toISOString();

db.run(sql, [TELEGRAM_ID, now], function(err) {
    if (err) {
        console.error('❌ Erro ao atualizar:', err.message);
    } else {
        console.log('✅ Usuário atualizado com sucesso!');
        console.log('📝 Linhas afetadas:', this.changes);
        
        // Verificar se foi atualizado
        db.get("SELECT * FROM auth_cliente_usuariocliente WHERE id = 1", (err, user) => {
            if (err) {
                console.error('❌ Erro ao verificar:', err.message);
            } else {
                console.log('\n✅ Dados atualizados:');
                console.log(`  🆔 ID: ${user.id}`);
                console.log(`  👤 Username: ${user.username}`);
                console.log(`  📛 Nome: ${user.first_name}`);
                console.log(`  📧 Email: ${user.email}`);
                console.log(`  📱 Telegram ID: ${user.telegram_chat_id}`);
                console.log(`  💼 Cargo: ${user.cargo}`);
                console.log(`  ✅ Ativo: ${user.is_active && user.ativo ? 'SIM' : 'NÃO'}`);
                
                console.log('\n🎉 Pronto! Agora você pode testar o bot!');
                console.log('📱 Execute: node bot.js');
                console.log('🤖 No Telegram, envie: /start');
            }
            
            db.close();
        });
    }
});
