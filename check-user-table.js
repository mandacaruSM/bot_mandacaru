const sqlite3 = require('sqlite3').verbose();

const dbPath = 'D:\\projeto\\mandacaru_erp\\db.sqlite3';
const db = new sqlite3.Database(dbPath);

console.log('🔍 Analisando estrutura da tabela de usuários...');

// Ver estrutura completa
db.all("PRAGMA table_info(auth_cliente_usuariocliente)", (err, columns) => {
    if (err) {
        console.error('❌ Erro:', err.message);
        db.close();
        return;
    }
    
    console.log('\n📋 Colunas da tabela:');
    columns.forEach(col => {
        const required = col.notnull ? ' (OBRIGATÓRIO)' : ' (opcional)';
        const defaultVal = col.dflt_value ? ` [default: ${col.dflt_value}]` : '';
        console.log(`  - ${col.name}: ${col.type}${required}${defaultVal}`);
    });
    
    // Ver um usuário existente como exemplo
    db.get("SELECT * FROM auth_cliente_usuariocliente LIMIT 1", (err, user) => {
        if (err) {
            console.error('❌ Erro ao buscar usuário:', err.message);
        } else if (user) {
            console.log('\n👤 Exemplo de usuário existente:');
            Object.keys(user).forEach(key => {
                if (key !== 'password') { // Não mostrar senha
                    console.log(`  - ${key}: ${user[key]}`);
                }
            });
        }
        
        db.close();
    });
});
