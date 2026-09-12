# Publica uma atualização do app (OTA, via eas update) nos dois canais de
# uma vez só — "production" e "preview" — pra não depender de qual build
# (produção ou teste) está instalada no celular.
#
# Uso:
#   .\atualizar-app.ps1 -Mensagem "Descrição do que mudou"
#
# Exemplo:
#   .\atualizar-app.ps1 -Mensagem "Pontas e Pontos Extras + Jornal de Ofertas"

param(
    [Parameter(Mandatory = $true)]
    [string]$Mensagem
)

Write-Host ""
Write-Host "==> Publicando no canal 'production'..." -ForegroundColor Cyan
eas update --branch production --message $Mensagem
if ($LASTEXITCODE -ne 0) {
    Write-Host "Deu erro publicando em 'production' — parei antes de tentar o 'preview'. Confere a mensagem acima." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==> Publicando no canal 'preview'..." -ForegroundColor Cyan
eas update --branch preview --message $Mensagem
if ($LASTEXITCODE -ne 0) {
    Write-Host "Publicou em 'production', mas deu erro em 'preview'. Confere a mensagem acima." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Pronto! Atualização publicada nos dois canais (production e preview)." -ForegroundColor Green
Write-Host "No celular: fecha o app completamente, abre e espera uns 15-20s, fecha de novo e abre — a atualização aparece."
