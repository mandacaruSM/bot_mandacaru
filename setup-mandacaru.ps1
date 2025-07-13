# Setup Simplificado - Bot Telegram Mandacaru para Windows
Write-Host "🤖 Setup Bot Telegram Mandacaru (Versão Simplificada)" -ForegroundColor Blue
Write-Host "=================================================" -ForegroundColor Blue

# Verificar Node.js
Write-Host "`n1. Verificando Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js encontrado: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js não encontrado! Baixe em: https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Verificar NPM
Write-Host "`n2. Verificando NPM..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version
    Write-Host "✅ NPM encontrado: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ NPM não encontrado!" -ForegroundColor Red
    exit 1
}

# Criar diretórios
Write-Host "`n3. Criando diretórios..." -ForegroundColor Yellow
$dirs = @("logs", "temp", "backup")
foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "✅ Criado: $dir" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Já existe: $dir" -ForegroundColor Yellow
    }
}

# Criar package.json
Write-Host "`n4. Criando package.json..." -ForegroundColor Yellow
if (-not (Test-Path "package.json")) {
    $packageContent = @'
{
  "name": "mandacaru-telegram-bot",
  "version": "2.0.0",
  "description": "Bot Telegram integrado ao ERP Mandacaru",
  "main": "bot.js",
  "scripts": {
    "start": "node bot.js",
    "pm2:start": "pm2 start ecosystem.config.js",
    "pm2:stop": "pm2 stop mandacaru-telegram-bot",
    "pm2:logs": "pm2 logs mandacaru-telegram-bot"
  },
  "dependencies": {
    "node-telegram-bot-api": "^0.61.0",
    "axios": "^1.4.0",
    "dotenv": "^16.3.1"
  }
}
'@
    Set-Content "package.json" -Value $packageContent -Encoding UTF8
    Write-Host "✅ package.json criado" -ForegroundColor Green
} else {
    Write-Host "⚠️  package.json já existe" -ForegroundColor Yellow
}

# Instalar dependências
Write-Host "`n5. Instalando dependências..." -ForegroundColor Yellow
try {
    npm install
    Write-Host "✅ Dependências instaladas" -ForegroundColor Green
} catch {
    Write-Host "❌ Erro ao instalar dependências" -ForegroundColor Red
    exit 1
}

# Criar .env
Write-Host "`n6. Criando arquivo .env..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    $envContent = @'
# Token do Bot Telegram (OBRIGATÓRIO)
# Obtenha em: https://t.me/botfather
TELEGRAM_BOT_TOKEN=SEU_TOKEN_AQUI

# URL da API do ERP Mandacaru (OBRIGATÓRIO)
API_BASE_URL=http://localhost:3000

# Configurações opcionais
MAX_FILE_SIZE=10485760
SESSION_TIMEOUT=7200000
LOG_LEVEL=info
LOG_FILE=./logs/mandacaru-bot.log
ALLOW_ON_ERROR=false
NODE_ENV=production
'@
    Set-Content ".env" -Value $envContent -Encoding UTF8
    Write-Host "✅ Arquivo .env criado" -ForegroundColor Green
    Write-Host "⚠️  CONFIGURE o token do bot no arquivo .env!" -ForegroundColor Yellow
} else {
    Write-Host "⚠️  Arquivo .env já existe" -ForegroundColor Yellow
}

# Criar ecosystem.config.js
Write-Host "`n7. Criando configuração do PM2..." -ForegroundColor Yellow
if (-not (Test-Path "ecosystem.config.js")) {
    $ecosystemContent = @'
module.exports = {
  apps: [{
    name: 'mandacaru-telegram-bot',
    script: 'bot.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
'@
    Set-Content "ecosystem.config.js" -Value $ecosystemContent -Encoding UTF8
    Write-Host "✅ ecosystem.config.js criado" -ForegroundColor Green
} else {
    Write-Host "⚠️  ecosystem.config.js já existe" -ForegroundColor Yellow
}

# Verificar bot.js
Write-Host "`n8. Verificando bot.js..." -ForegroundColor Yellow
if (-not (Test-Path "bot.js")) {
    Write-Host "❌ bot.js não encontrado!" -ForegroundColor Red
    Write-Host "   Você precisa criar o arquivo bot.js com o código do bot" -ForegroundColor Yellow
    
    # Criar bot.js básico
    $basicBot = @'
// Bot Telegram Mandacaru
// SUBSTITUA este conteúdo pelo código completo do bot

console.log('❌ Configure o bot.js com o código completo!');
console.log('📄 Veja o arquivo de configuração no guia de instalação');
process.exit(1);
'@
    Set-Content "bot.js" -Value $basicBot -Encoding UTF8
    Write-Host "✅ bot.js básico criado - SUBSTITUA pelo código real!" -ForegroundColor Yellow
} else {
    Write-Host "✅ bot.js encontrado" -ForegroundColor Green
}

# Criar scripts auxiliares
Write-Host "`n9. Criando scripts auxiliares..." -ForegroundColor Yellow

# start.bat
$startBat = @'
@echo off
echo 🚀 Iniciando Bot Mandacaru...
node bot.js
pause
'@
Set-Content "start.bat" -Value $startBat -Encoding ASCII
Write-Host "✅ start.bat criado" -ForegroundColor Green

# monitor.ps1
$monitorScript = @'
Write-Host "📊 Status do Bot Mandacaru" -ForegroundColor Blue
Write-Host "=========================" -ForegroundColor Blue

# Verificar se está rodando
$nodeProcesses = Get-Process node -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "✅ Node.js está rodando" -ForegroundColor Green
    $nodeProcesses | Format-Table ProcessName, Id, CPU, WorkingSet
} else {
    Write-Host "❌ Node.js não está rodando" -ForegroundColor Red
}

# Logs recentes
Write-Host "`n📝 Logs recentes:" -ForegroundColor Blue
if (Test-Path "logs\combined.log") {
    Get-Content "logs\combined.log" -Tail 10
} else {
    Write-Host "Nenhum log encontrado" -ForegroundColor Yellow
}

# Verificar configuração
Write-Host "`n⚙️ Configuração:" -ForegroundColor Blue
if (Test-Path ".env") {
    $env = Get-Content ".env" -Raw
    if ($env -match "SEU_TOKEN_AQUI") {
        Write-Host "❌ Token não configurado!" -ForegroundColor Red
    } else {
        Write-Host "✅ Token configurado" -ForegroundColor Green
    }
}
'@
Set-Content "monitor.ps1" -Value $monitorScript -Encoding UTF8
Write-Host "✅ monitor.ps1 criado" -ForegroundColor Green

# backup.ps1
$backupScript = @'
$Date = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = "backup\mandacaru_backup_$Date.zip"

Write-Host "📦 Criando backup..." -ForegroundColor Blue

$files = @("*.js", "*.json", ".env.example", "ecosystem.config.js")
try {
    Compress-Archive -Path $files -DestinationPath $BackupFile -Force
    Write-Host "✅ Backup criado: $BackupFile" -ForegroundColor Green
} catch {
    Write-Host "❌ Erro ao criar backup: $_" -ForegroundColor Red
}
'@
Set-Content "backup.ps1" -Value $backupScript -Encoding UTF8
Write-Host "✅ backup.ps1 criado" -ForegroundColor Green

# Criar .gitignore
Write-Host "`n10. Criando .gitignore..." -ForegroundColor Yellow
if (-not (Test-Path ".gitignore")) {
    $gitignoreContent = @'
# Dependências
node_modules/
npm-debug.log*

# Configurações sensíveis
.env
.env.local
.env.production

# Logs
logs/*.log
*.log

# Arquivos temporários
temp/*

# Backups
backup/*

# Sistema
Thumbs.db
.DS_Store

# IDE
.vscode/
.idea/
'@
    Set-Content ".gitignore" -Value $gitignoreContent -Encoding UTF8
    Write-Host "✅ .gitignore criado" -ForegroundColor Green
}

# Verificação final
Write-Host "`n🔍 VERIFICAÇÃO FINAL" -ForegroundColor Blue
Write-Host "====================" -ForegroundColor Blue

Write-Host "`nArquivos criados:" -ForegroundColor Yellow
$files = @("package.json", ".env", "ecosystem.config.js", "bot.js", "start.bat", "monitor.ps1", "backup.ps1", ".gitignore")
foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "✅ $file" -ForegroundColor Green
    } else {
        Write-Host "❌ $file" -ForegroundColor Red
    }
}

Write-Host "`nDiretórios criados:" -ForegroundColor Yellow
foreach ($dir in $dirs) {
    if (Test-Path $dir) {
        Write-Host "✅ $dir\" -ForegroundColor Green
    } else {
        Write-Host "❌ $dir\" -ForegroundColor Red
    }
}

# Status da configuração
Write-Host "`n⚙️ Status da configuração:" -ForegroundColor Yellow
if (Test-Path ".env") {
    $envContent = Get-Content ".env" -Raw
    if ($envContent -match "SEU_TOKEN_AQUI") {
        Write-Host "❌ Token do bot NÃO configurado!" -ForegroundColor Red
    } else {
        Write-Host "✅ Token do bot configurado" -ForegroundColor Green
    }
}

if (Test-Path "bot.js") {
    $botContent = Get-Content "bot.js" -Raw
    if ($botContent -match "SUBSTITUA") {
        Write-Host "❌ bot.js precisa ser substituído pelo código real!" -ForegroundColor Red
    } else {
        Write-Host "✅ bot.js parece estar configurado" -ForegroundColor Green
    }
}

# Instruções finais
Write-Host "`n📋 PRÓXIMOS PASSOS:" -ForegroundColor Blue
Write-Host "==================" -ForegroundColor Blue
Write-Host "1. ✏️  Edite o arquivo .env e configure:" -ForegroundColor Yellow
Write-Host "   - TELEGRAM_BOT_TOKEN=seu_token_real" -ForegroundColor Gray
Write-Host "   - API_BASE_URL=url_do_seu_erp" -ForegroundColor Gray
Write-Host ""
Write-Host "2. 📝 Substitua o conteúdo do bot.js pelo código completo do bot" -ForegroundColor Yellow
Write-Host ""
Write-Host "3. 🧪 Teste o bot:" -ForegroundColor Yellow
Write-Host "   .\start.bat  ou  npm start" -ForegroundColor Gray
Write-Host ""
Write-Host "4. 📊 Monitore o bot:" -ForegroundColor Yellow
Write-Host "   .\monitor.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "5. 💾 Faça backup:" -ForegroundColor Yellow
Write-Host "   .\backup.ps1" -ForegroundColor Gray
Write-Host ""

# Verificar PM2 (opcional)
Write-Host "🔧 Para produção (opcional):" -ForegroundColor Blue
try {
    $pm2Version = pm2 --version
    Write-Host "✅ PM2 disponível: $pm2Version" -ForegroundColor Green
    Write-Host "   Para usar PM2: npm run pm2:start" -ForegroundColor Gray
} catch {
    Write-Host "⚠️  PM2 não instalado. Para instalar: npm install -g pm2" -ForegroundColor Yellow
}

Write-Host "`n🎉 Setup básico concluído!" -ForegroundColor Green
Write-Host "📄 Configure o .env e bot.js antes de testar" -ForegroundColor Yellow

# Criar arquivo de status
$statusContent = @"
Setup Bot Mandacaru - $(Get-Date)
=======================================

✅ Estrutura básica criada
✅ Dependências instaladas
✅ Scripts auxiliares criados

PENDENTE:
❗ Configurar token no .env
❗ Substituir bot.js pelo código completo

Comandos úteis:
- .\start.bat - Iniciar bot
- .\monitor.ps1 - Ver status
- .\backup.ps1 - Fazer backup
- npm start - Iniciar via npm
- npm run pm2:start - Iniciar com PM2 (se instalado)
"@

Set-Content "setup-status.txt" -Value $statusContent -Encoding UTF8
Write-Host "`n📄 Status salvo em setup-status.txt" -ForegroundColor Blue