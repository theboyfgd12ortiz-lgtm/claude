# Instala o actualiza TODO en Windows: los mods de este repo, caveman y rtk.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\install-mods.ps1
# Es seguro correrlo otra vez: trae lo nuevo. Variables opcionales:
#   $env:SKIP_RTK = '1'  /  $env:SKIP_CAVEMAN = '1'  /  $env:CLAUDE_MODS_REPO = 'dueño/repo'
$ErrorActionPreference = 'Continue'
$Repo = if ($env:CLAUDE_MODS_REPO) { $env:CLAUDE_MODS_REPO } else { 'theboyfgd12ortiz-lgtm/claude' }
$Market = 'claude-mods'
$Failed = $false

function Warn($msg) { Write-Host "AVISO: $msg" -ForegroundColor Yellow; $script:Failed = $true }

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Write-Host "No encuentro el comando 'claude'; instala Claude Code primero." -ForegroundColor Red
  exit 1
}

function InstallOrUpdate($id) {
  $installed = (claude plugin list 2>$null) -join "`n"
  if ($installed -match [regex]::Escape($id)) { claude plugin update $id; if ($LASTEXITCODE -ne 0) { Warn "no pude actualizar $id" } }
  else { claude plugin install $id; if ($LASTEXITCODE -ne 0) { Warn "no pude instalar $id" } }
}

function HasMarketplace($name) { ((claude plugin marketplace list 2>$null) -join "`n") -match [regex]::Escape($name) }

# --- 1. Mods de este repo ---
if (HasMarketplace $Market) { claude plugin marketplace update $Market }
else { claude plugin marketplace add $Repo; if ($LASTEXITCODE -ne 0) { Warn "no pude añadir $Repo"; exit 1 } }

$List = Join-Path $HOME ".claude\plugins\marketplaces\$Market\.claude-plugin\marketplace.json"
$Plugins = (Get-Content $List -Raw | ConvertFrom-Json).plugins | ForEach-Object { $_.name }
foreach ($p in $Plugins) { InstallOrUpdate "$p@$Market" }

# --- 2. caveman (plugin de terceros, Apache-2.0; necesita Node 22+) ---
if ($env:SKIP_CAVEMAN -ne '1') {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Warn 'caveman necesita Node.js y no lo encuentro; sigo sin caveman' }
  else {
    if (HasMarketplace 'caveman') { claude plugin marketplace update caveman }
    else { claude plugin marketplace add JuliusBrussee/caveman; if ($LASTEXITCODE -ne 0) { Warn 'no pude añadir el marketplace de caveman' } }
    InstallOrUpdate 'caveman@caveman'
  }
}

# --- 3. rtk (programa de terceros, Apache-2.0): lo usa el mod rtk-hook ---
# El hook de rtk es un script bash: Claude Code en Windows usa Git Bash, que necesita jq y rtk.
if ($env:SKIP_RTK -ne '1') {
  if (-not (Get-Command jq -ErrorAction SilentlyContinue)) {
    Write-Host 'Instalando jq (lo necesita rtk-hook)...'
    winget install --id jqlang.jq -e --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) { Warn 'no pude instalar jq (winget install jqlang.jq)' }
  }
  if (-not (Get-Command rtk -ErrorAction SilentlyContinue)) {
    Write-Host 'Instalando rtk...'
    winget install --id rtk-ai.rtk -e --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) { Warn 'no pude instalar rtk (winget install rtk-ai.rtk)' }
  } else { Write-Host "rtk ya está instalado: $(rtk --version)" }
}

Write-Host ''
if (-not $Failed) { Write-Host 'Listo. Reinicia Claude Code o usa /reload-plugins. Escribe /mods para ver el panel.' }
else { Write-Host 'Terminé, pero con avisos (arriba). Lo que no falló ya quedó instalado.' }
