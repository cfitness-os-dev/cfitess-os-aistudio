param(
    [string]$Model = "",
    [int]$Port = 8081,
    [int]$Context = 32768,
    [int]$GpuLayers = 99
)

$serverExe = "C:\Users\FP123\AppData\Local\Programs\llama.cpp\llama-server.exe"
if (-not (Test-Path $serverExe)) {
    Write-Error "llama-server.exe introuvable dans $serverExe"
    exit 1
}

# Recherche automatique d'un modèle GGUF dans E:\MODELS_LLM si non spécifié
if (-not $Model) {
    $found = Get-ChildItem -Path "E:\MODELS_LLM" -Filter "*.gguf" -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) {
        $Model = $found.FullName
    } else {
        Write-Error "Aucun fichier .gguf trouvé dans E:\MODELS_LLM. Veuillez passer -Model <chemin>"
        exit 1
    }
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   DÉMARRAGE DE LLAMA.CPP SERVER (OpenCode compatible)    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Exécutable   : $serverExe"
Write-Host "Modèle GGUF  : $Model"
Write-Host "Port API     : http://127.0.0.1:$Port/v1"
Write-Host "Contexte     : $Context tokens"
Write-Host "GPU Vulkan   : $GpuLayers couches offloadées"
Write-Host "==========================================================" -ForegroundColor Cyan

& $serverExe -m $Model --port $Port --host 127.0.0.1 -c $Context -ngl $GpuLayers
