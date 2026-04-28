#!/usr/bin/env bash
# DevFlow AI — デプロイスクリプト
# 使い方: ./scripts/deploy.sh [dev|stg|prod]
set -euo pipefail

ENV=${1:-dev}
REGION="ap-northeast-1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=========================================="
echo " DevFlow AI Deploy"
echo " 環境: $ENV"
echo "=========================================="

cd "$ROOT_DIR"

# ─── 1. バックエンドビルド ────────────────────────────────
echo "[1/5] バックエンドビルド..."
npm run build

# ─── 2. CDK デプロイ（バックエンド全スタック） ───────────
echo "[2/5] CDK デプロイ..."
cd infra
npx cdk deploy --all \
  --context env="$ENV" \
  --require-approval never \
  --outputs-file /tmp/devflow-cdk-outputs.json
cd "$ROOT_DIR"

# CDK Output から値を取得
API_URL=$(jq -r ".DevFlowApiStack${ENV^}.ApiUrl // empty" /tmp/devflow-cdk-outputs.json 2>/dev/null || echo "")
COGNITO_DOMAIN=$(jq -r ".DevFlowAuthStack${ENV^}.UserPoolDomain // empty" /tmp/devflow-cdk-outputs.json 2>/dev/null || echo "")
COGNITO_CLIENT_ID=$(jq -r ".DevFlowAuthStack${ENV^}.UserPoolClientId // empty" /tmp/devflow-cdk-outputs.json 2>/dev/null || echo "")
S3_BUCKET=$(jq -r ".DevFlowFrontStack${ENV^}.FrontendBucketName // empty" /tmp/devflow-cdk-outputs.json 2>/dev/null || echo "")
CF_DIST_ID=$(jq -r ".DevFlowFrontStack${ENV^}.CloudFrontDistributionId // empty" /tmp/devflow-cdk-outputs.json 2>/dev/null || echo "")

echo "  API URL: ${API_URL:-（取得失敗 - 手動設定必要）}"
echo "  S3 Bucket: ${S3_BUCKET:-（取得失敗）}"

# ─── 3. フロントエンドビルド ──────────────────────────────
echo "[3/5] フロントエンドビルド..."
cd frontend

# .env.local が存在する場合はそちらを優先（ローカルデプロイ時）
if [[ -f ".env.${ENV}" ]]; then
  echo "  .env.${ENV} を使用"
  set -a; source ".env.${ENV}"; set +a
else
  export VITE_API_URL="${API_URL%/}"
  export VITE_COGNITO_DOMAIN="${COGNITO_DOMAIN}"
  export VITE_COGNITO_CLIENT_ID="${COGNITO_CLIENT_ID}"
fi

npm run build
cd "$ROOT_DIR"

# ─── 4. S3 デプロイ ───────────────────────────────────────
if [[ -n "$S3_BUCKET" ]]; then
  echo "[4/5] S3 デプロイ (${S3_BUCKET})..."
  # アセット（JS/CSS）: 長期キャッシュ
  aws s3 sync frontend/dist/ "s3://${S3_BUCKET}/" \
    --delete \
    --cache-control "public,max-age=31536000,immutable" \
    --exclude "index.html" \
    --region "$REGION"
  # index.html: キャッシュなし（SPA）
  aws s3 cp frontend/dist/index.html "s3://${S3_BUCKET}/index.html" \
    --cache-control "no-cache,no-store,must-revalidate" \
    --region "$REGION"
else
  echo "[4/5] S3バケット名が取得できませんでした。手動でデプロイしてください。"
fi

# ─── 5. CloudFront キャッシュ無効化 ──────────────────────
if [[ -n "$CF_DIST_ID" ]]; then
  echo "[5/5] CloudFront キャッシュ無効化 (${CF_DIST_ID})..."
  aws cloudfront create-invalidation \
    --distribution-id "$CF_DIST_ID" \
    --paths "/*" \
    --region "$REGION"
else
  echo "[5/5] CloudFront DistributionID が取得できませんでした。"
fi

echo ""
echo "=========================================="
echo " デプロイ完了！"
if [[ -n "$CF_DIST_ID" ]]; then
  echo " CloudFront URL を確認: aws cloudfront get-distribution --id ${CF_DIST_ID} | jq '.Distribution.DomainName'"
fi
echo "=========================================="
