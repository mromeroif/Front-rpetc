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
| `STACK_NAME` | `rpetc-modern-app` |
| `FRONTEND_S3_PREFIX` | vacío |
| `SETUP_FRONTEND_HOSTING` | `0` |

## Local
Copia `.env.dev.example` → `.env.dev` (`FRONTEND_BUCKET=rpetc-dev`).
