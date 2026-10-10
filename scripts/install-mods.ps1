# Instala o actualiza TODO en Windows: los mods de este repo, rtk y los plugins de terceros
# (caveman, humanizer, ponytail, token-optimizer). Headroom es opcional: $env:WITH_HEADROOM = '1'.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\install-mods.ps1
# Es seguro correrlo otra vez: trae lo nuevo. Variables opcionales:
#   $env:SKIP_RTK, SKIP_CAVEMAN, SKIP_HUMANIZER, SKIP_PONYTAIL, SKIP_TOKEN_OPTIMIZER = '1' para saltar esa parte
#   $env:CLAUDE_MODS_REPO = 'dueño/repo'
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

# --- 2. Plugins de terceros, desde su repositorio original ---
#   caveman (Node) · humanizer · ponytail (Node) · token-optimizer (Python 3)
function AddMarketplace($name, $repo) {
  if (HasMarketplace $name) { claude plugin marketplace update $name | Out-Host; return $true }
  claude plugin marketplace add $repo | Out-Host
  if ($LASTEXITCODE -ne 0) { Warn "no pude añadir $repo"; return $false }
  return $true
}
function ThirdParty($skip, $needs, $market, $repo, $id) {
  if ((Get-Item "env:$skip" -ErrorAction SilentlyContinue).Value -eq '1') { return }
  if ($needs -and -not (Get-Command $needs -ErrorAction SilentlyContinue)) { Warn "$id necesita '$needs' y no lo encuentro; sigo sin él"; return }
  if (AddMarketplace $market $repo) { InstallOrUpdate $id }
}
$Py = if (Get-Command python3 -ErrorAction SilentlyContinue) { 'python3' } elseif (Get-Command python -ErrorAction SilentlyContinue) { 'python' } else { 'python' }
ThirdParty 'SKIP_CAVEMAN' 'node' 'caveman' 'JuliusBrussee/caveman' 'caveman@caveman'
ThirdParty 'SKIP_HUMANIZER' '' 'humanizer' 'blader/humanizer' 'humanizer@humanizer'
ThirdParty 'SKIP_PONYTAIL' 'node' 'ponytail' 'DietrichGebert/ponytail' 'ponytail@ponytail'
ThirdParty 'SKIP_TOKEN_OPTIMIZER' $Py 'alexgreensh-token-optimizer' 'alexgreensh/token-optimizer' 'token-optimizer@alexgreensh-token-optimizer'

# rtk ya recorta los comandos de Bash: se apaga el recorte propio de token-optimizer para que no peleen.
if ($env:SKIP_RTK -ne '1') {
  $SettingsPath = Join-Path $HOME '.claude\settings.json'
  try {
    $data = if (Test-Path $SettingsPath) { Get-Content $SettingsPath -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
    if (-not $data.PSObject.Properties['env']) { $data | Add-Member -NotePropertyName env -NotePropertyValue ([pscustomobject]@{}) }
    $data.env | Add-Member -NotePropertyName TOKEN_OPTIMIZER_BASH_COMPRESS -NotePropertyValue '0' -Force
    # UTF-8 sin BOM: con BOM Claude Code no puede leer el archivo.
    [System.IO.File]::WriteAllText($SettingsPath, ($data | ConvertTo-Json -Depth 32), (New-Object System.Text.UTF8Encoding $false))
  } catch { Warn "no pude ajustar $SettingsPath" }
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

# --- 4. Headroom (opcional, solo en tu PC): $env:WITH_HEADROOM = '1' ---
# Es un proxy que pasa TODO el tráfico de Claude Code por tu máquina. Aquí solo se instala el programa.
if ($env:WITH_HEADROOM -eq '1') {
  if (Get-Command uv -ErrorAction SilentlyContinue) { uv tool install --python 3.13 'headroom-ai[all]' }
  else { & $Py -m pip install --user 'headroom-ai[all]' }
  if ($LASTEXITCODE -ne 0) { Warn 'no pude instalar headroom (necesita Python 3.10+ o uv)' }
  else { Write-Host 'Headroom instalado. Para usarlo abre Claude así: headroom wrap claude   (y headroom unwrap claude para quitarlo).' }
}

Write-Host ''
if (-not $Failed) { Write-Host 'Listo. Reinicia Claude Code o usa /reload-plugins. Escribe /mods para ver el panel.' }
else { Write-Host 'Terminé, pero con avisos (arriba). Lo que no falló ya quedó instalado.' }
