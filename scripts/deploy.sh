#!/usr/bin/env bash
# Despliega frontend (build Vite + sync S3). Usado por GitHub Actions QA.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

: "${AWS_REGION:=us-east-1}"
: "${FRONTEND_BUCKET:?FRONTEND_BUCKET es obligatorio}"
: "${STACK_NAME:=rpetc-modern-app-qa}"
: "${FRONTEND_S3_PREFIX:=}"
: "${VITE_API_BASE_URL:=}"
: "${SETUP_FRONTEND_HOSTING:=0}"

if [[ -z "${VITE_API_BASE_URL}" ]]; then
  VITE_API_BASE_URL="$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}" \
    --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
    --output text)"
fi

if [[ -z "${VITE_API_BASE_URL}" || "${VITE_API_BASE_URL}" == "None" ]]; then
  echo "No se pudo resolver VITE_API_BASE_URL. Define el secret QA_API_BASE_URL o despliega el backend antes." >&2
  exit 1
fi

echo "==> Frontend deploy: bucket=${FRONTEND_BUCKET} api=${VITE_API_BASE_URL}"

if [[ "${SETUP_FRONTEND_HOSTING}" == "1" ]]; then
  echo "Configurando hosting estatico del bucket..."
  aws s3 website "s3://${FRONTEND_BUCKET}" \
    --index-document index.html \
    --error-document index.html \
    --region "${AWS_REGION}"
fi

npm ci
export VITE_API_BASE_URL
if [[ -n "${FRONTEND_S3_PREFIX}" ]]; then
  prefix="${FRONTEND_S3_PREFIX#/}"
  prefix="${prefix%/}"
  export VITE_BASE_PATH="/${prefix}/"
else
  export VITE_BASE_PATH="/"
fi
npm run build

S3_DEST="s3://${FRONTEND_BUCKET}"
if [[ -n "${FRONTEND_S3_PREFIX}" ]]; then
  prefix="${FRONTEND_S3_PREFIX#/}"
  prefix="${prefix%/}"
  S3_DEST="s3://${FRONTEND_BUCKET}/${prefix}"
fi

aws s3 sync dist "${S3_DEST}" --delete --region "${AWS_REGION}"

if [[ -n "${FRONTEND_S3_PREFIX}" ]]; then
  FRONTEND_URL="http://${FRONTEND_BUCKET}.s3-website-${AWS_REGION}.amazonaws.com/${FRONTEND_S3_PREFIX#/}/"
else
  FRONTEND_URL="http://${FRONTEND_BUCKET}.s3-website-${AWS_REGION}.amazonaws.com"
fi

echo "FrontendUrl=${FRONTEND_URL}"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "frontend_url=${FRONTEND_URL}" >> "${GITHUB_OUTPUT}"
fi
