# Instala o actualiza TODOS los mods del marketplace claude-mods (scope: user) en Windows.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\install-mods.ps1
$ErrorActionPreference = 'Stop'
$Repo = if ($env:CLAUDE_MODS_REPO) { $env:CLAUDE_MODS_REPO } else { 'theboyfgd12ortiz-lgtm/claude' }
$Market = 'claude-mods'

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Write-Error "claude-mods: no encuentro el comando 'claude'; instala Claude Code primero."
}

if ((claude plugin marketplace list 2>$null) -match $Market) {
  claude plugin marketplace update $Market
} else {
  claude plugin marketplace add $Repo
}

$List = Join-Path $HOME ".claude\plugins\marketplaces\$Market\.claude-plugin\marketplace.json"
$Plugins = (Get-Content $List -Raw | ConvertFrom-Json).plugins | ForEach-Object { $_.name }
$Installed = claude plugin list 2>$null

foreach ($p in $Plugins) {
  if ($Installed -match "$p@$Market") { claude plugin update "$p@$Market" }
  else { claude plugin install "$p@$Market" }
}

Write-Host "claude-mods: listo ($($Plugins.Count) mods). Reinicia Claude Code o usa /reload-plugins."
