# Despliegue frontend

## Modelo
| Front | Bucket S3 | API | CI GitHub |
|-------|-----------|-----|-----------|
| **prod** (`main`) | `rpetc` | backend prod | `prod-frontend.yml` |
| **QA** (`qa`) | `rpetc-dev` | backend prod | `qa-frontend.yml` |

QA usa el mismo bucket que dev local (`rpetc-dev`) y la API productiva compartida.

## Local
- Prod: `.env` → `FRONTEND_BUCKET=rpetc`, `VITE_API_BASE_URL`
- QA/dev: `.env.dev` → `FRONTEND_BUCKET=rpetc-dev` (ver `.env.dev.example`)

## GitHub Actions (Front-rpetc)

### Prod — rama `main`, environment **`prod`**
| Secret | Valor |
|--------|-------|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | IAM |
| `FRONTEND_BUCKET` | `rpetc` |
| `VITE_API_BASE_URL` | ApiUrl prod *(opcional)* |

### QA — rama `qa`, environment **`qa`**
| Secret | Valor |
|--------|-------|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | IAM |
| `FRONTEND_BUCKET` | `rpetc-dev` |
| `VITE_API_BASE_URL` | ApiUrl prod *(recomendado)* |

### Variables (opcionales, prod y qa)
| Variable | Valor |
|----------|-------|
| `AWS_REGION` | `us-east-1` |
| `STACK_NAME` | `rpetc-modern-app` |
| `FRONTEND_S3_PREFIX` | vacío |
| `SETUP_FRONTEND_HOSTING` | `0` (`1` solo la primera vez) |
