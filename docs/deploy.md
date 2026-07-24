# Despliegue frontend

## CI automático (GitHub Actions)
Solo rama **`qa`** / **`QA`**, environment **`qa`**.

| Destino | Bucket S3 | API |
|---------|-----------|-----|
| Front QA | **`rpetc-dev`** (fijo en workflow) | `rpetc-modern-app` (prod) |

Prod (`rpetc`) se despliega manual: `.\deploy.ps1 -Environment prod`

## Secrets (environment `qa`)
| Secret | Obligatorio |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | Sí |
| `AWS_SECRET_ACCESS_KEY` | Sí |
| `VITE_API_BASE_URL` | Recomendado (ApiUrl prod) |

No hace falta secret `FRONTEND_BUCKET`: el workflow usa **`rpetc-dev`** directamente.

## Variables (opcionales)
| Variable | Default |
|----------|---------|
| `AWS_REGION` | `us-east-1` |
| `SETUP_FRONTEND_HOSTING` | `0` |

**No configures** `STACK_NAME` ni `FRONTEND_BUCKET` en GitHub: el workflow usa **`rpetc-modern-app`** y **`rpetc-dev`** fijos. Si tienes `STACK_NAME=rpetc-modern-app-qa` en variables, bórrala o ignórala (ya no se lee).

## Local
Copia `.env.dev.example` → `.env.dev` (`FRONTEND_BUCKET=rpetc-dev`).
