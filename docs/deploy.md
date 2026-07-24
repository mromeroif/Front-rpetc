# Despliegue frontend

## Desarrollo local
1. Copia `.env.example` a `.env`
2. `VITE_API_BASE_URL` = `ApiUrl` del backend
3. `npm install && npm run dev`

## Publicacion S3
Desde la raiz del repo:

| Comando | Descripcion |
|---------|-------------|
| `.\deploy.ps1 -Environment prod` | Build + sync S3 prod |
| `.\deploy-qa.ps1` | Build + sync S3 QA |
| `bash scripts/deploy.sh` | CI / Linux |

Variables en `.env`: `FRONTEND_BUCKET`, `FRONTEND_S3_PREFIX` (opcional), `VITE_API_BASE_URL`.

Si no defines `VITE_API_BASE_URL`, el script consulta CloudFormation (`STACK_NAME`, default `rpetc-modern-app-qa` en QA).

## GitHub Actions (repo frontend)
Workflow: `.github/workflows/qa-frontend.yml` en rama `qa`.

Secrets: `QA_AWS_*`, `QA_FRONTEND_BUCKET`, opcional `QA_API_BASE_URL`.

Variables: `QA_AWS_REGION`, `QA_STACK_NAME`, `QA_FRONTEND_S3_PREFIX`, `QA_SETUP_FRONTEND_HOSTING` (`1` la primera vez).

## Manual de usuario
- HTML: `docs/manual-usuario-final.html`
- MD: `docs/manual-usuario-final.md`
- PDF: `docs/build-manual-pdf.ps1`
