# Frontend RPETC (React + Vite)

Repositorio del frontend responsive de la app RPETC.

## Inicio rapido
1. Copia `.env.example` a `.env`.
2. Configura `VITE_API_BASE_URL` con el `ApiUrl` del stack backend.
3. `npm install && npm run dev`

## Despliegue a S3
Desde la raiz del repo:
- Prod: `.\deploy.ps1 -Environment prod`
- QA: `.\deploy-qa.ps1`

En Linux/CI: `bash scripts/deploy.sh`

## Repo relacionado
El backend (Lambdas + API) vive en un repositorio Git separado (`rpetc-sii-backend` o el nombre que definas).

## Manual de usuario
Ver `docs/manual-usuario-final.html` o `docs/manual-usuario-final.md`.
