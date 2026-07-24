# Despliegue frontend

## CI automático (GitHub Actions)
Solo existe el environment **`qa`** en GitHub. El workflow `qa-frontend.yml` corre en rama **`qa`**.

| Destino | Bucket | API backend |
|---------|--------|-------------|
| Front QA | `rpetc-dev` | `rpetc-modern-app` (prod) |

**Prod** (`rpetc`) no tiene CI: despliega manual con `.\deploy.ps1 -Environment prod` desde tu máquina.

## Secrets (environment `qa` en Front-rpetc)
| Secret | Valor |
|--------|-------|
| `AWS_ACCESS_KEY_ID` | IAM |
| `AWS_SECRET_ACCESS_KEY` | IAM |
| `FRONTEND_BUCKET` | `rpetc-dev` |
| `VITE_API_BASE_URL` | ApiUrl prod |

## Variables (opcionales)
| Variable | Valor |
|----------|-------|
| `AWS_REGION` | `us-east-1` |
| `STACK_NAME` | `rpetc-modern-app` |
| `FRONTEND_S3_PREFIX` | vacío |
| `SETUP_FRONTEND_HOSTING` | `0` |

## Local
- QA: `.\deploy-qa.ps1` o rama `qa` en GitHub
- Prod: `.\deploy.ps1 -Environment prod`
