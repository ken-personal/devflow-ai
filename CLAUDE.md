# DevFlow AI — AI統合型業務管理システム

## プロジェクト概要
ITシステム開発会社向け業務管理システム。LangGraph + AWS Bedrock（Claude 3.5 Sonnet）を活用したAIエージェントで案件・タスク管理とレポート自動生成を実現する。

**設計書**:  ディレクトリ（REQ-001/BSD-001/DET-001/DB-001）

---

## 技術スタック

### フロントエンド
- React 18 + TypeScript（strictモード必須）+ Tailwind CSS
- ビルド: Vite

### バックエンド（Node.js Lambda）
- Runtime: Node.js 22 / ARM64（Graviton2）
- Framework: Hono v4（`hono/aws-lambda`アダプター使用）
- バリデーション: Zod v3（スキーマから型推論。型定義の二重管理禁止）
- DBアクセス: AWS SDK v3 + DocumentClient（`@aws-sdk/lib-dynamodb`）

### バックエンド（AI Lambda）
- Runtime: Python 3.13 / ARM64（SnapStart有効）
- Framework: LangGraph 0.2 + LangChain AWS
- LLM: AWS Bedrock（`anthropic.claude-3-5-sonnet-20241022-v2:0`）

### インフラ
- IaC: AWS CDK（TypeScript）
- CI/CD: GitHub Actions
- DB: Amazon DynamoDB Single Table Design（テーブル名: `DevFlowMain-{env}`）
- Auth: Amazon Cognito（JWT RS256）

---

## ディレクトリ構成

```
devflow-ai/
├── CLAUDE.md
├── docs/                   # 設計書
├── frontend/               # React SPA
│   └── src/
├── src/
│   ├── functions/
│   │   ├── auth/           # devflow-auth-api（Hono）
│   │   ├── projects/       # devflow-projects-api（Hono）
│   │   ├── tasks/          # devflow-tasks-api（Hono）
│   │   ├── files/          # devflow-files-api（Hono）
│   │   ├── users/          # devflow-users-api（Hono）
│   │   ├── reports/        # devflow-reports-api（Hono）
│   │   └── ai/             # devflow-ai-api（Python/LangGraph）
│   └── shared/
│       ├── db/
│       │   ├── client.ts   # DynamoDB DocumentClient シングルトン
│       │   └── repositories/
│       ├── middleware/     # authMiddleware / errorMiddleware
│       ├── errors/         # AppErrorサブクラス群
│       └── types/
├── infra/                  # AWS CDK スタック
└── tests/
```

---

## コーディング規約

### TypeScript共通
- `strict: true` 必須。`any`禁止（`unknown`を使う）
- ESModules（`import/export`）。CommonJS（`require`）禁止
- 命名: コンポーネントはPascalCase / 変数・関数はcamelCase / 環境変数はUPPER_SNAKE_CASE
- Zodスキーマから型を`z.infer<typeof schema>`で推論。型定義を別途書かない

### Lambda（Node.js）アーキテクチャ
- 3層構造を厳守: **Handler（Hono Route）→ Service → Repository**
- HandlerはZodバリデーションとレスポンス成形のみ。ビジネスロジックを書かない
- Serviceはビジネスロジック・権限チェック。DynamoDB操作はRepository経由のみ
- RepositoryはDynamoDB操作のみ。ビジネスロジックを書かない
- DynamoDBクライアントはシングルトン（`getDynamoClient()`）を使う。直接 `new DynamoDBClient()` しない

### Lambda（Python/LangGraph）
- LangGraphのAgentStateを明示的にTypeDict定義する
- ツールは原則Read Only。Write系はsave_reportのみ
- セキュリティ: ユーザー入力は必ずHumanMessageに隔離。SystemPromptと連結禁止
- 最大ステップ数: `recursion_limit=20`
- グラフは `AGENT = build_agent_graph()` でモジュールレベルにコンパイル（ウォームスタート最適化）

### DynamoDB Single Table Design
- テーブル名は環境変数 `DYNAMODB_TABLE_NAME` から取得（ハードコード禁止）
- PKプレフィックス: `USER#` / `PROJECT#` / `TASK#` / `SESSION#` / `REPORT#`
- SKプレフィックス: `USER#` / `PROJECT#` / `ASSIGNEE#` / `TASK#` / `COMMENT#` / `FILE#` / `SESSION#` / `MSG#` / `REPORT#`
- Commentは `PK=PROJECT#{id}` に格納（AWS公式隣接リストパターン）
- 論理削除: `is_deleted=true` + `ttl`（epoch秒、90日後）を設定
- FilterExpressionを大量データに使わない。GSIで対応する

---

## よく使うコマンド

```bash
# フロントエンド
cd frontend && npm run dev          # 開発サーバー起動
cd frontend && npm run build        # ビルド
cd frontend && npm run typecheck    # 型チェック

# バックエンド
npm run test                        # テスト実行（Jestで個別テスト推奨）
npm run typecheck                   # TypeScript型チェック
npm run lint                        # ESLintチェック

# Python AI Lambda
cd src/functions/ai && pip install -r requirements.txt --break-system-packages
cd src/functions/ai && pytest tests/ -v

# CDK
cd infra && npm run cdk synth       # テンプレート確認
cd infra && npm run cdk diff        # 差分確認
cd infra && npm run cdk deploy      # デプロイ（環境指定必須: --context env=dev）
```

---

## 環境変数（Lambda共通）

環境変数はすべてCDKから注入。Lambda内でハードコードは絶対禁止。

```
DYNAMODB_TABLE_NAME     # DevFlowMain-{env}
AWS_REGION              # ap-northeast-1
COGNITO_USER_POOL_ID    # us-east-1_xxxxxxxx
COGNITO_CLIENT_ID       # xxxxxxxxxxxxxxxx
S3_BUCKET_NAME          # devflow-files-{env}
BEDROCK_MODEL_ID        # anthropic.claude-3-5-sonnet-20241022-v2:0
ENV                     # dev / stg / prod
```

シークレット（APIキー等）はSecrets Manager管理。Lambda環境変数にはARNのみ設定。

---

## エラーハンドリング方針

### HTTPエラー共通フォーマット
```json
{ "error": { "code": "ERROR_CODE", "message": "説明", "details": {} } }
```

### エラークラス（`src/shared/errors/index.ts`）
- `ValidationError`（400）/ `UnauthorizedError`（401）/ `ForbiddenError`（403）
- `NotFoundError`（404）/ `ConflictError`（409）/ `RateLimitError`（429）

### Honoグローバルエラーハンドラー
- `ZodError` → `ValidationError`（400）に変換
- `AppError`サブクラス → 対応ステータスで返却
- 予期しないエラー → CloudWatchにJSON構造化ログ出力後500を返す

---

## セキュリティ要件（MUST）

- JWT検証はAPI Gateway JWT Authorizerに委任。Lambda側で再検証しない
- IAMは最小権限。ワイルドカード（`*`）禁止
- Memberロールは自分の担当データのみアクセス可。サーバー側で強制フィルタ
- LLMへのユーザー入力は `HumanMessage` に完全隔離。`SystemMessage` と連結禁止
- LLMツールはRead Only原則。`save_report` のみWriteを許可
- S3署名付きURLの有効期限: アップロード用300秒 / ダウンロード用3600秒
- すべての通信はTLS 1.2以上（API GatewayのHTTPS強制）

---

## テスト方針

- **個別テストを優先**。テストスイート全体の実行は避ける（パフォーマンス）
- ServiceレイヤーはRepositoryをモック化して単体テスト
- Handler（Hono）は`hono/testing`でHTTPリクエストをテスト
- Python LambdaはpytestでAgentツールを単体テスト
- テストが通らない状態でコードを提出しない

---

## CDKスタック構成

```
DevFlowAuthStack    # Cognito UserPool / Google IdP
DevFlowStorageStack # DynamoDB / S3バケット群
DevFlowApiStack     # API Gateway REST API / Lambda(Node.js) / WAF / IAM
DevFlowAiStack      # Lambda(Python/LangGraph) / Bedrock権限
DevFlowFrontStack   # S3(静的配信) / CloudFront / OAC
DevFlowMonitorStack # CloudWatch Alarms / X-Ray / GuardDuty / Config
```

デプロイ順序: Auth → Storage → Api → Ai → Front → Monitor

---

## ワークフロー

1. 実装前に必ず設計書（`docs/`）を確認する
2. 機能追加は必ずfeatureブランチで作業する（`feature/xxxx`）
3. 実装後は `npm run typecheck` と `npm run lint` を必ず実行する
4. テストが通ることを確認してからPRを作成する
5. 本番デプロイはGitHub Actionsの手動承認後のみ実行する
