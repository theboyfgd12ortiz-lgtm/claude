# Abre Claude Code a través de OmniRoute (modelos gratuitos), para cuando se acabó el límite de tu plan.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\claude-gratis.ps1 [modelo]
# El modelo por defecto es 'auto/coding' (OmniRoute elige uno gratuito bueno para código).
# Otros: auto/fast, auto/cheap, auto, o uno concreto como openai/gpt-5.4 (mira Dashboard de OmniRoute).
param([string]$Modelo = 'auto/coding')

if (-not (Get-Command omniroute -ErrorAction SilentlyContinue)) {
  Write-Host "No encuentro el comando 'omniroute'. Instálalo siguiendo https://github.com/diegosouzapw/OmniRoute y vuelve a intentar." -ForegroundColor Yellow
  exit 1
}
Write-Host "Abriendo Claude Code con OmniRoute ($Modelo). Tus mods siguen activos; los modelos gratuitos tienen sus propios límites." -ForegroundColor Cyan
omniroute run claude --model $Modelo
