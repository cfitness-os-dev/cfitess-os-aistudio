# Lancement de Claude Code en mode 100% Local via le support Anthropic natif d'Ollama
param (
    [string]$Model = "qwen3.8:latest"
)

$ErrorActionPreference = "Stop"

# Verifier si Ollama tourne sur le port 11434
$tcp = Test-NetConnection -ComputerName 127.0.0.1 -Port 11434 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $tcp) {
    Write-Host "[Ollama] Démarrage du serveur Ollama..." -ForegroundColor Cyan
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Minimized
    Start-Sleep -Seconds 2
}

Write-Host "[Claude Code Local] Configuration de la connexion directe Ollama..." -ForegroundColor Cyan
$env:ANTHROPIC_AUTH_TOKEN = "ollama"
$env:ANTHROPIC_BASE_URL = "http://localhost:11434"

Write-Host "[Claude Code Local] Lancement de Claude Code avec le modele local : $Model" -ForegroundColor Green
Write-Host "-------------------------------------------------------------------------" -ForegroundColor DarkGray

& claude --model $Model @args
