# Genera manual-usuario-final.pdf a partir de manual-usuario-final.md
# Para PDF con imagenes: abrir manual-usuario-final.html en el navegador e Imprimir -> Guardar como PDF.
#
# PowerShell exige ruta relativa con .\ o llamada con &; si escribe solo
#   modern-app\docs\build-manual-pdf.ps1
# intentara cargar un modulo llamado "modern-app" y fallara.
#
# Opcion A - ya esta en esta carpeta (docs):
#   Set-Location "ruta\completa\a\modern-app\docs"
#   .\build-manual-pdf.ps1
#
# Opcion B - desde la carpeta padre del repo (ajuste la ruta):
#   & ".\modern-app\docs\build-manual-pdf.ps1"
#
# Opcion C - ruta absoluta entre comillas:
#   & "C:\Users\...\rpetc sii\modern-app\docs\build-manual-pdf.ps1"
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$md = Join-Path $here "manual-usuario-final.md"
$pdf = Join-Path $here "manual-usuario-final.pdf"

if (-not (Test-Path -LiteralPath $md)) {
    Write-Error "No se encontro: $md"
}

Set-Location $here

function Test-Cmd($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

if (Test-Cmd "pandoc") {
    Write-Host "Usando pandoc..."
    & pandoc $md -o $pdf --from markdown --resource-path="$here"
    if (Test-Path -LiteralPath $pdf) {
        Write-Host "OK: $pdf"
        exit 0
    }
    Write-Warning "pandoc no produjo el PDF (a menudo falta un motor LaTeX: MiKTeX o TinyTeX). Probando md-to-pdf..."
}

if (Test-Cmd "npx") {
    Write-Host "Usando npx md-to-pdf (primera vez puede tardar al bajar el paquete)..."
    & npx --yes md-to-pdf $md
    $p = Join-Path $here "manual-usuario-final.pdf"
    if (Test-Path -LiteralPath $p) {
        Write-Host "OK: $p"
        exit 0
    }
}

Write-Host @"

No se pudo generar el PDF automaticamente.

Opciones:
1) Instalar Pandoc (https://pandoc.org) y un motor PDF (por ejemplo MiKTeX en Windows), luego:
     pandoc manual-usuario-final.md -o manual-usuario-final.pdf

2) Con Node.js instalado, en esta carpeta:
     npx --yes md-to-pdf manual-usuario-final.md

3) Abrir manual-usuario-final.md en Visual Studio Code, vista previa Markdown, e imprimir a PDF.

"@ -ForegroundColor Yellow
exit 1
