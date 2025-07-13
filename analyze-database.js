const sqlite3 = require('sqlite3').verbose();

const dbPath = 'D:\\projeto\\mandacaru_erp\\db.sqlite3';
const db = new sqlite3.Database(dbPath);

console.log('🔍 Analisando estrutura das tabelas do ERP...\n');

// Ver estrutura da tabela de equipamentos
db.all("PRAGMA table_info(equipamentos_equipamento)", (err, columns) => {
    if (err) {
        console.error('❌ Erro:', err.message);
    } else if (columns.length > 0) {
        console.log('📋 Estrutura da tabela equipamentos_equipamento:');
        columns.forEach(col => {
            console.log(`  - ${col.name}: ${col.type} ${col.notnull ? '(NOT NULL)' : ''}`);
        });
        
        // Ver alguns dados de exemplo
        db.all("SELECT * FROM equipamentos_equipamento LIMIT 3", (err, equipamentos) => {
            if (err) {
                console.error('❌ Erro ao buscar equipamentos:', err.message);
            } else {
                console.log('\n🏭 Equipamentos existentes no ERP:');
                equipamentos.forEach(eq => {
                    console.log(`  - ID: ${eq.id}, Nome: ${eq.nome || eq.name || 'N/A'}`);
                });
            }
        });
    }
});

// Ver usuários
db.all("PRAGMA table_info(auth_cliente_usuariocliente)", (err, columns) => {
    if (err) {
        console.error('❌ Erro:', err.message);
    } else if (columns.length > 0) {
        console.log('\n👥 Estrutura da tabela auth_cliente_usuariocliente:');
        columns.forEach(col => {
            console.log(`  - ${col.name}: ${col.type}`);
        });
    }
});

// Ver checklists NR12
db.all("SELECT * FROM nr12_checklist_checklistnr12 LIMIT 3", (err, checklists) => {
    if (err) {
        console.log('ℹ️  Tabela nr12_checklist_checklistnr12 vazia ou não acessível');
    } else {
        console.log('\n📋 Checklists NR12 existentes:');
        checklists.forEach(check => {
            console.log(`  - ID: ${check.id}, Nome: ${check.nome || check.name || 'N/A'}`);
        });
    }
});

setTimeout(() => {
    db.close();
    console.log('\n🎯 Análise concluída!');
}, 1000);
