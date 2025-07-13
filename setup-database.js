const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

console.log('🔧 Configurando banco SQLite3 para Mandacaru...');

const dbPath = 'D:\\projeto\\mandacaru_erp\\db.sqlite3';

// Verificar se arquivo existe
if (!fs.existsSync(dbPath)) {
    console.log('❌ Arquivo de banco não encontrado:', dbPath);
    process.exit(1);
}

// SQL para criar tabelas do bot (versão simplificada)
const createTables = `
-- Tabela de usuários do Telegram
CREATE TABLE IF NOT EXISTS telegram_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    can_use_telegram_bot BOOLEAN DEFAULT TRUE,
    role TEXT DEFAULT 'operator',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de equipamentos (se não existir)
CREATE TABLE IF NOT EXISTS equipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    location TEXT NOT NULL,
    description TEXT,
    qr_code TEXT UNIQUE,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de checklists
CREATE TABLE IF NOT EXISTS checklists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de itens do checklist
CREATE TABLE IF NOT EXISTS checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checklist_id INTEGER NOT NULL,
    order_index INTEGER DEFAULT 0,
    description TEXT NOT NULL,
    instructions TEXT,
    priority TEXT DEFAULT 'medium',
    is_mandatory BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (checklist_id) REFERENCES checklists(id)
);

-- Tabela de execuções
CREATE TABLE IF NOT EXISTS checklist_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id INTEGER NOT NULL,
    checklist_id INTEGER NOT NULL,
    user_telegram_id TEXT NOT NULL,
    session_id TEXT UNIQUE NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    duration_minutes INTEGER DEFAULT 0,
    total_items INTEGER DEFAULT 0,
    ok_items INTEGER DEFAULT 0,
    nok_items INTEGER DEFAULT 0,
    skipped_items INTEGER DEFAULT 0,
    completion_rate REAL DEFAULT 0,
    status TEXT DEFAULT 'active',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (equipment_id) REFERENCES equipments(id),
    FOREIGN KEY (checklist_id) REFERENCES checklists(id)
);

-- Tabela de respostas
CREATE TABLE IF NOT EXISTS checklist_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checklist_execution_id INTEGER NOT NULL,
    item_index INTEGER NOT NULL,
    item_description TEXT NOT NULL,
    status TEXT NOT NULL,
    response_time DATETIME NOT NULL,
    observations TEXT,
    FOREIGN KEY (checklist_execution_id) REFERENCES checklist_executions(id)
);

-- Tabela de fotos
CREATE TABLE IF NOT EXISTS checklist_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checklist_execution_id INTEGER NOT NULL,
    item_index INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    caption TEXT,
    taken_at DATETIME NOT NULL,
    FOREIGN KEY (checklist_execution_id) REFERENCES checklist_executions(id)
);

-- Inserir dados de exemplo
INSERT OR IGNORE INTO telegram_users (telegram_id, username, first_name, role) 
VALUES ('ADMIN_ID', 'admin', 'Administrador', 'admin');

INSERT OR IGNORE INTO equipments (name, code, location, qr_code, description)
VALUES 
    ('Compressor Principal', 'COMP-001', 'Sala de Máquinas', 'QR-COMP-001', 'Compressor de ar principal'),
    ('Esteira 1', 'EST-001', 'Linha de Produção 1', 'QR-EST-001', 'Esteira transportadora'),
    ('Bomba Água', 'BOMB-001', 'Casa de Bombas', 'QR-BOMB-001', 'Bomba centrífuga');

INSERT OR IGNORE INTO checklists (name, description)
VALUES 
    ('Checklist Diário', 'Verificação diária de equipamentos'),
    ('Checklist Semanal', 'Inspeção semanal completa');

INSERT OR IGNORE INTO checklist_items (checklist_id, order_index, description, instructions, priority)
VALUES 
    (1, 1, 'Verificar nível de óleo', 'Verificar se está entre MIN e MAX', 'high'),
    (1, 2, 'Verificar vazamentos', 'Inspecionar visualmente', 'high'),
    (1, 3, 'Verificar pressão', 'Verificar se está normal', 'medium'),
    (1, 4, 'Verificar ruídos', 'Escutar por ruídos anormais', 'medium'),
    (1, 5, 'Verificar temperatura', 'Verificar se não há superaquecimento', 'medium');
`;

// Conectar e executar
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Erro ao conectar:', err.message);
        return;
    }
    console.log('✅ Conectado ao banco SQLite3');
});

// Executar SQL
db.exec(createTables, (err) => {
    if (err) {
        console.error('❌ Erro ao criar tabelas:', err.message);
    } else {
        console.log('✅ Tabelas criadas com sucesso!');
        
        // Verificar tabelas criadas
        db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
            if (err) {
                console.error('❌ Erro ao listar tabelas:', err.message);
            } else {
                console.log('📋 Tabelas encontradas:');
                tables.forEach(table => {
                    console.log('  -', table.name);
                });
            }
            
            // Verificar dados de exemplo
            db.all("SELECT * FROM equipments", (err, equipments) => {
                if (err) {
                    console.error('❌ Erro ao buscar equipamentos:', err.message);
                } else {
                    console.log(`🏭 ${equipments.length} equipamentos cadastrados`);
                }
                
                db.close((err) => {
                    if (err) {
                        console.error('❌ Erro ao fechar banco:', err.message);
                    } else {
                        console.log('🎉 Setup do banco concluído!');
                    }
                });
            });
        });
    }
});
