-- =====================================================
-- Setup SQLite3 - Bot Telegram Mandacaru
-- =====================================================
-- Execute este script no SQLite3:
-- sqlite3 mandacaru.db < sqlite-setup.sql

-- Habilitar foreign keys
PRAGMA foreign_keys = ON;

-- =====================================================
-- 1. TABELA DE EQUIPAMENTOS
-- =====================================================
CREATE TABLE IF NOT EXISTS equipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(100) UNIQUE NOT NULL,
    location VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    brand VARCHAR(100),
    model VARCHAR(100),
    serial_number VARCHAR(100),
    installation_date DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    qr_code VARCHAR(255) UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índices para equipamentos
CREATE INDEX IF NOT EXISTS idx_equipment_code ON equipments(code);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipments(status);
CREATE INDEX IF NOT EXISTS idx_equipment_location ON equipments(location);
CREATE INDEX IF NOT EXISTS idx_equipment_qr_code ON equipments(qr_code);

-- Trigger para atualizar updated_at
CREATE TRIGGER IF NOT EXISTS update_equipments_updated_at
    AFTER UPDATE ON equipments
    FOR EACH ROW
BEGIN
    UPDATE equipments SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- =====================================================
-- 2. TABELA DE CHECKLISTS (TEMPLATES)
-- =====================================================
CREATE TABLE IF NOT EXISTS checklists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    version VARCHAR(20) DEFAULT '1.0',
    active BOOLEAN DEFAULT TRUE,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_checklist_active ON checklists(active);
CREATE INDEX IF NOT EXISTS idx_checklist_category ON checklists(category);

CREATE TRIGGER IF NOT EXISTS update_checklists_updated_at
    AFTER UPDATE ON checklists
    FOR EACH ROW
BEGIN
    UPDATE checklists SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- =====================================================
-- 3. TABELA DE ITENS DO CHECKLIST
-- =====================================================
CREATE TABLE IF NOT EXISTS checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checklist_id INTEGER NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    instructions TEXT,
    priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    reference_image_path VARCHAR(500),
    reference_image TEXT, -- Base64 da imagem de referência
    is_mandatory BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_checklist_items_checklist ON checklist_items(checklist_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_order ON checklist_items(order_index);

CREATE TRIGGER IF NOT EXISTS update_checklist_items_updated_at
    AFTER UPDATE ON checklist_items
    FOR EACH ROW
BEGIN
    UPDATE checklist_items SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- =====================================================
-- 4. RELACIONAMENTO EQUIPAMENTO-CHECKLIST
-- =====================================================
CREATE TABLE IF NOT EXISTS equipment_checklists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id INTEGER NOT NULL,
    checklist_id INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    frequency_days INTEGER DEFAULT 30, -- Frequência em dias
    last_execution DATETIME NULL,
    next_execution DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (equipment_id) REFERENCES equipments(id) ON DELETE CASCADE,
    FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE,
    UNIQUE(equipment_id, checklist_id)
);

CREATE INDEX IF NOT EXISTS idx_equipment_checklists_active ON equipment_checklists(is_active);
CREATE INDEX IF NOT EXISTS idx_next_execution ON equipment_checklists(next_execution);

CREATE TRIGGER IF NOT EXISTS update_equipment_checklists_updated_at
    AFTER UPDATE ON equipment_checklists
    FOR EACH ROW
BEGIN
    UPDATE equipment_checklists SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- =====================================================
-- 5. TABELA DE USUÁRIOS TELEGRAM
-- =====================================================
CREATE TABLE IF NOT EXISTS telegram_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id VARCHAR(50) UNIQUE NOT NULL,
    username VARCHAR(100),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(255),
    can_use_telegram_bot BOOLEAN DEFAULT TRUE,
    role VARCHAR(20) DEFAULT 'operator' CHECK (role IN ('operator', 'supervisor', 'admin')),
    department VARCHAR(100),
    employee_id VARCHAR(50),
    last_activity DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telegram_users_telegram_id ON telegram_users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_telegram_users_role ON telegram_users(role);
CREATE INDEX IF NOT EXISTS idx_telegram_users_active ON telegram_users(can_use_telegram_bot);

CREATE TRIGGER IF NOT EXISTS update_telegram_users_updated_at
    AFTER UPDATE ON telegram_users
    FOR EACH ROW
BEGIN
    UPDATE telegram_users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- =====================================================
-- 6. TABELA DE EXECUÇÕES DE CHECKLIST
-- =====================================================
CREATE TABLE IF NOT EXISTS checklist_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id INTEGER NOT NULL,
    checklist_id INTEGER NOT NULL,
    user_telegram_id VARCHAR(50) NOT NULL,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NULL,
    duration_minutes INTEGER DEFAULT 0,
    total_items INTEGER DEFAULT 0,
    ok_items INTEGER DEFAULT 0,
    nok_items INTEGER DEFAULT 0,
    skipped_items INTEGER DEFAULT 0,
    completion_rate DECIMAL(5,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'failed')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (equipment_id) REFERENCES equipments(id),
    FOREIGN KEY (checklist_id) REFERENCES checklists(id),
    FOREIGN KEY (user_telegram_id) REFERENCES telegram_users(telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_checklist_executions_equipment ON checklist_executions(equipment_id);
CREATE INDEX IF NOT EXISTS idx_checklist_executions_user ON checklist_executions(user_telegram_id);
CREATE INDEX IF NOT EXISTS idx_checklist_executions_status ON checklist_executions(status);
CREATE INDEX IF NOT EXISTS idx_checklist_executions_date ON checklist_executions(start_time);
CREATE INDEX IF NOT EXISTS idx_checklist_executions_session ON checklist_executions(session_id);

CREATE TRIGGER IF NOT EXISTS update_checklist_executions_updated_at
    AFTER UPDATE ON checklist_executions
    FOR EACH ROW
BEGIN
    UPDATE checklist_executions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- =====================================================
-- 7. TABELA DE RESPOSTAS DOS ITENS
-- =====================================================
CREATE TABLE IF NOT EXISTS checklist_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checklist_execution_id INTEGER NOT NULL,
    item_index INTEGER NOT NULL,
    item_description TEXT NOT NULL,
    status VARCHAR(10) NOT NULL CHECK (status IN ('ok', 'nok', 'skip')),
    response_time DATETIME NOT NULL,
    observations TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (checklist_execution_id) REFERENCES checklist_executions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_checklist_responses_execution ON checklist_responses(checklist_execution_id);
CREATE INDEX IF NOT EXISTS idx_checklist_responses_status ON checklist_responses(status);
CREATE INDEX IF NOT EXISTS idx_checklist_responses_item ON checklist_responses(item_index);

-- =====================================================
-- 8. TABELA DE FOTOS DOS CHECKLISTS
-- =====================================================
CREATE TABLE IF NOT EXISTS checklist_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checklist_execution_id INTEGER NOT NULL,
    item_index INTEGER NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER DEFAULT 0,
    mime_type VARCHAR(100) DEFAULT 'image/jpeg',
    caption TEXT,
    photo_type VARCHAR(20) DEFAULT 'required' CHECK (photo_type IN ('required', 'extra', 'reference')),
    taken_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (checklist_execution_id) REFERENCES checklist_executions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_checklist_photos_execution ON checklist_photos(checklist_execution_id);
CREATE INDEX IF NOT EXISTS idx_checklist_photos_item ON checklist_photos(item_index);
CREATE INDEX IF NOT EXISTS idx_checklist_photos_type ON checklist_photos(photo_type);

-- =====================================================
-- 9. TABELA DE OBSERVAÇÕES
-- =====================================================
CREATE TABLE IF NOT EXISTS checklist_observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checklist_execution_id INTEGER NOT NULL,
    item_index INTEGER,
    observation TEXT NOT NULL,
    observation_type VARCHAR(20) DEFAULT 'item' CHECK (observation_type IN ('item', 'general', 'issue')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (checklist_execution_id) REFERENCES checklist_executions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_checklist_observations_execution ON checklist_observations(checklist_execution_id);
CREATE INDEX IF NOT EXISTS idx_checklist_observations_type ON checklist_observations(observation_type);

-- =====================================================
-- 10. TABELA DE LOGS DO BOT
-- =====================================================
CREATE TABLE IF NOT EXISTS bot_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level VARCHAR(10) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
    message TEXT NOT NULL,
    context TEXT, -- JSON como texto no SQLite
    user_telegram_id VARCHAR(50),
    session_id VARCHAR(100),
    execution_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bot_logs_level ON bot_logs(level);
CREATE INDEX IF NOT EXISTS idx_bot_logs_user ON bot_logs(user_telegram_id);
CREATE INDEX IF NOT EXISTS idx_bot_logs_session ON bot_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_bot_logs_date ON bot_logs(created_at);

-- =====================================================
-- VIEWS PARA RELATÓRIOS
-- =====================================================

-- View para relatório de execuções completo
CREATE VIEW IF NOT EXISTS v_checklist_executions_complete AS
SELECT 
    ce.id,
    ce.session_id,
    e.name as equipment_name,
    e.code as equipment_code,
    e.location as equipment_location,
    c.name as checklist_name,
    tu.username,
    tu.first_name,
    tu.last_name,
    ce.start_time,
    ce.end_time,
    ce.duration_minutes,
    ce.total_items,
    ce.ok_items,
    ce.nok_items,
    ce.skipped_items,
    ce.completion_rate,
    ce.status,
    ce.notes
FROM checklist_executions ce
JOIN equipments e ON ce.equipment_id = e.id
JOIN checklists c ON ce.checklist_id = c.id
JOIN telegram_users tu ON ce.user_telegram_id = tu.telegram_id;

-- View para estatísticas por equipamento
CREATE VIEW IF NOT EXISTS v_equipment_statistics AS
SELECT 
    e.id,
    e.name,
    e.code,
    e.location,
    COUNT(ce.id) as total_executions,
    COUNT(CASE WHEN ce.status = 'completed' THEN 1 END) as completed_executions,
    COUNT(CASE WHEN ce.status = 'cancelled' THEN 1 END) as cancelled_executions,
    AVG(ce.completion_rate) as avg_completion_rate,
    AVG(ce.duration_minutes) as avg_duration_minutes,
    SUM(ce.nok_items) as total_nok_items,
    MAX(ce.end_time) as last_execution
FROM equipments e
LEFT JOIN checklist_executions ce ON e.id = ce.equipment_id
GROUP BY e.id, e.name, e.code, e.location;

-- View para estatísticas por usuário
CREATE VIEW IF NOT EXISTS v_user_statistics AS
SELECT 
    tu.telegram_id,
    tu.username,
    tu.first_name,
    tu.last_name,
    tu.role,
    COUNT(ce.id) as total_executions,
    COUNT(CASE WHEN ce.status = 'completed' THEN 1 END) as completed_executions,
    AVG(ce.completion_rate) as avg_completion_rate,
    AVG(ce.duration_minutes) as avg_duration_minutes,
    SUM(ce.nok_items) as total_nok_items_found,
    COUNT(DISTINCT ce.equipment_id) as equipments_inspected,
    MAX(ce.end_time) as last_execution
FROM telegram_users tu
LEFT JOIN checklist_executions ce ON tu.telegram_id = ce.user_telegram_id
GROUP BY tu.telegram_id, tu.username, tu.first_name, tu.last_name, tu.role;

-- =====================================================
-- DADOS INICIAIS DE EXEMPLO
-- =====================================================

-- Inserir usuário administrador de exemplo
INSERT OR IGNORE INTO telegram_users (telegram_id, username, first_name, role, can_use_telegram_bot) 
VALUES ('123456789', 'admin_mandacaru', 'Administrador', 'admin', TRUE);

-- Inserir equipamentos de exemplo
INSERT OR IGNORE INTO equipments (name, code, location, description, category, status, qr_code)
VALUES 
    ('Compressor Principal', 'COMP-001', 'Sala de Máquinas A', 'Compressor de ar principal da linha de produção', 'Pneumático', 'active', 'QR-COMP-001'),
    ('Esteira Transportadora 1', 'EST-001', 'Linha de Produção 1', 'Esteira transportadora principal', 'Transporte', 'active', 'QR-EST-001'),
    ('Bomba de Água', 'BOMB-001', 'Casa de Bombas', 'Bomba centrífuga para abastecimento', 'Hidráulico', 'active', 'QR-BOMB-001');

-- Inserir checklists de exemplo
INSERT OR IGNORE INTO checklists (name, description, category, active)
VALUES 
    ('Checklist Diário Compressor', 'Verificação diária dos compressores de ar', 'Manutenção Preventiva', TRUE),
    ('Inspeção Semanal Esteiras', 'Inspeção semanal das esteiras transportadoras', 'Segurança', TRUE),
    ('Verificação Mensal Bombas', 'Verificação mensal do sistema de bombas', 'Hidráulico', TRUE);

-- Inserir itens do checklist de exemplo
INSERT OR IGNORE INTO checklist_items (checklist_id, order_index, description, instructions, priority, is_mandatory)
VALUES 
    -- Checklist Compressor (ID 1)
    (1, 1, 'Verificar nível de óleo', 'Verificar se o nível de óleo está entre MIN e MAX', 'high', TRUE),
    (1, 2, 'Verificar vazamentos', 'Inspecionar visualmente por vazamentos de ar ou óleo', 'high', TRUE),
    (1, 3, 'Verificar pressão de trabalho', 'Verificar se a pressão está dentro dos parâmetros (6-8 bar)', 'medium', TRUE),
    (1, 4, 'Verificar ruídos anormais', 'Escutar atentamente por ruídos estranhos durante operação', 'medium', TRUE),
    (1, 5, 'Verificar temperatura', 'Verificar se não há superaquecimento', 'medium', TRUE),
    
    -- Checklist Esteira (ID 2)
    (2, 1, 'Verificar alinhamento da esteira', 'Verificar se a esteira está alinhada corretamente', 'high', TRUE),
    (2, 2, 'Verificar tensão da correia', 'Verificar se a tensão está adequada', 'high', TRUE),
    (2, 3, 'Verificar limpeza da esteira', 'Verificar se a esteira está limpa e sem detritos', 'medium', TRUE),
    (2, 4, 'Verificar sensores de segurança', 'Testar funcionamento dos sensores de emergência', 'high', TRUE),
    (2, 5, 'Verificar proteções laterais', 'Verificar se todas as proteções estão no lugar', 'high', TRUE),
    
    -- Checklist Bomba (ID 3)
    (3, 1, 'Verificar pressão de sucção', 'Verificar pressão na entrada da bomba', 'high', TRUE),
    (3, 2, 'Verificar pressão de recalque', 'Verificar pressão na saída da bomba', 'high', TRUE),
    (3, 3, 'Verificar vazamentos', 'Inspecionar por vazamentos nas conexões', 'high', TRUE),
    (3, 4, 'Verificar vibração', 'Verificar se há vibração excessiva', 'medium', TRUE),
    (3, 5, 'Verificar temperatura dos mancais', 'Verificar temperatura dos rolamentos', 'medium', TRUE);

-- Relacionar equipamentos com checklists
INSERT OR IGNORE INTO equipment_checklists (equipment_id, checklist_id, is_active, frequency_days)
VALUES 
    (1, 1, TRUE, 1),  -- Compressor com checklist diário
    (2, 2, TRUE, 7),  -- Esteira com checklist semanal  
    (3, 3, TRUE, 30); -- Bomba com checklist mensal

-- =====================================================
-- EXEMPLO DE EXECUÇÃO DE CHECKLIST
-- =====================================================

-- Inserir execução de exemplo (simulando um checklist já realizado)
INSERT OR IGNORE INTO checklist_executions (
    id,
    equipment_id, 
    checklist_id, 
    user_telegram_id, 
    session_id,
    start_time, 
    end_time, 
    duration_minutes, 
    total_items, 
    ok_items, 
    nok_items, 
    skipped_items, 
    completion_rate, 
    status
) VALUES (
    1,
    1, -- Compressor Principal
    1, -- Checklist Diário Compressor
    '123456789', -- Admin
    'demo_session_001',
    datetime('now', '-2 hours'),
    datetime('now', '-1 hour'),
    15,
    5, -- total items
    4, -- ok items
    1, -- nok items
    0, -- skipped
    80.00, -- completion rate
    'completed'
);

-- Inserir respostas de exemplo
INSERT OR IGNORE INTO checklist_responses (checklist_execution_id, item_index, item_description, status, response_time)
VALUES 
    (1, 0, 'Verificar nível de óleo', 'ok', datetime('now', '-1 hour -55 minutes')),
    (1, 1, 'Verificar vazamentos', 'nok', datetime('now', '-1 hour -52 minutes')),
    (1, 2, 'Verificar pressão de trabalho', 'ok', datetime('now', '-1 hour -50 minutes')),
    (1, 3, 'Verificar ruídos anormais', 'ok', datetime('now', '-1 hour -48 minutes')),
    (1, 4, 'Verificar temperatura', 'ok', datetime('now', '-1 hour -46 minutes'));

-- Inserir observação de exemplo
INSERT OR IGNORE INTO checklist_observations (checklist_execution_id, item_index, observation, observation_type)
VALUES (1, 1, 'Pequeno vazamento detectado na conexão principal. Programar manutenção.', 'issue');

-- =====================================================
-- VERIFICAÇÕES FINAIS
-- =====================================================

-- Verificar se todas as tabelas foram criadas
.tables

-- Verificar alguns dados
SELECT 'Equipamentos cadastrados:' as info, COUNT(*) as total FROM equipments;
SELECT 'Checklists cadastrados:' as info, COUNT(*) as total FROM checklists;
SELECT 'Usuários cadastrados:' as info, COUNT(*) as total FROM telegram_users;
SELECT 'Itens de checklist:' as info, COUNT(*) as total FROM checklist_items;

-- Mostrar estrutura das principais tabelas
.schema equipments
.schema telegram_users
.schema checklist_executions

-- =====================================================
-- INFORMAÇÕES IMPORTANTES
-- =====================================================

/*
DIFERENÇAS DO SQLite3 vs MySQL:
1. AUTOINCREMENT em vez de AUTO_INCREMENT
2. VARCHAR é tratado como TEXT
3. BOOLEAN é emulado com CHECK constraints
4. JSON é armazenado como TEXT
5. Triggers em vez de Events para manutenção
6. Não há PROCEDURES - use triggers ou lógica no app
7. FOREIGN KEYS precisam ser habilitadas explicitamente

COMANDOS ÚTEIS SQLITE3:
.tables                  - Listar tabelas
.schema table_name      - Ver estrutura da tabela
.dump                   - Backup completo
.read filename.sql      - Executar arquivo SQL
.quit                   - Sair

BACKUP E RESTORE:
Backup:  sqlite3 database.db .dump > backup.sql
Restore: sqlite3 new_database.db < backup.sql

PERFORMANCE:
- SQLite3 é excelente para aplicações pequenas/médias
- Suporta até 1TB de dados
- Transações ACID completas
- Ideal para desenvolvimento e deploy simples
*/