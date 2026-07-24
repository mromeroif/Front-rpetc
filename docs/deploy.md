# Despliegue frontend

## CI (rama `qa`)
Workflow: `.github/workflows/qa-frontend.yml`

Flujo: `npm install` → `npm run build` → `aws s3 sync` a **`s3://rpetc-dev`**.

## GitHub — environment `qa`

### Secrets
| Secret | Uso |
|--------|-----|
| `AWS_ACCESS_KEY_ID` | IAM deploy S3 |
| `AWS_SECRET_ACCESS_KEY` | IAM deploy S3 |
| `VITE_API_BASE_URL` | URL del API prod (backend compartido) |

Si omites `VITE_API_BASE_URL`, el workflow usa por defecto  
`https://tk31h2efqk.execute-api.us-east-1.amazonaws.com`.

## Local
```powershell
.\deploy-qa.ps1
```

## Prod (manual)
```powershell
.\deploy.ps1 -Environment prod
```
