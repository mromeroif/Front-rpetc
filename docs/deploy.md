# Despliegue frontend

## CI (rama `qa`)
Workflow: `.github/workflows/qa-frontend.yml`

Flujo simple: `npm install` → `npm run build` → `aws s3 sync` a **`s3://rpetc-dev`**.

## GitHub — environment `qa`

### Secrets
| Secret | Uso |
|--------|-----|
| `AWS_ACCESS_KEY_ID` | IAM deploy S3 |
| `AWS_SECRET_ACCESS_KEY` | IAM deploy S3 |

### Variables
| Variable | Ejemplo |
|----------|---------|
| `VITE_API_BASE_URL` | `https://tk31h2efqk.execute-api.us-east-1.amazonaws.com` |

No hace falta `FRONTEND_BUCKET` ni `STACK_NAME`: bucket fijo **`rpetc-dev`**, API prod en build.

## Local
```powershell
.\deploy-qa.ps1
```
(o copia `.env.dev.example` → `.env.dev`)

## Prod (manual, sin CI)
```powershell
.\deploy.ps1 -Environment prod
```
