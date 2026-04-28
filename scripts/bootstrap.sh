#!/usr/bin/env bash
# DevFlow AI — 初回セットアップスクリプト
# 使い方: ./scripts/bootstrap.sh [dev|stg|prod]
set -euo pipefail

ENV=${1:-dev}
REGION="ap-northeast-1"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

echo "=========================================="
echo " DevFlow AI Bootstrap"
echo " 環境: $ENV  アカウント: $ACCOUNT  リージョン: $REGION"
echo "=========================================="

# 1. 依存関係インストール
echo "[1/5] 依存関係インストール..."
npm ci
cd frontend && npm ci && cd ..
cd infra && npm ci && cd ..

# 2. CDK Bootstrap（初回のみ）
echo "[2/5] CDK Bootstrap..."
cd infra
npx cdk bootstrap \
  "aws://${ACCOUNT}/${REGION}" \
  --context env="$ENV"
cd ..

# 3. バックエンドビルド
echo "[3/5] バックエンドビルド..."
npm run build

# 4. CDK Synth（確認）
echo "[4/5] CDK Synth (確認)..."
cd infra
npx cdk synth --context env="$ENV" --no-staging
cd ..

echo ""
echo "=========================================="
echo " Bootstrap 完了！"
echo " 次のステップ:"
echo "   ./scripts/deploy.sh $ENV"
echo "=========================================="
