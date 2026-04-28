// CLAUDE.md: getDynamoClient() はシングルトン必須。直接 new DynamoDBClient() 禁止
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

let _client: DynamoDBDocumentClient | null = null;

export function getDynamoClient(): DynamoDBDocumentClient {
  if (!_client) {
    const base = new DynamoDBClient({
      region: process.env.AWS_REGION ?? 'ap-northeast-1',
      // DynamoDBスロットリング対策: 指数バックオフで最大3回リトライ
      maxAttempts: 3,
    });
    _client = DynamoDBDocumentClient.from(base, {
      marshallOptions: {
        removeUndefinedValues: true,  // undefinedフィールドを自動除去（DynamoDB書き込みエラー防止）
        convertEmptyValues: false,    // 空文字を空文字のまま保持
      },
    });
  }
  return _client;
}

// CLAUDE.md: テーブル名はハードコード禁止。環境変数から取得
export function getTableName(): string {
  const name = process.env.DYNAMODB_TABLE_NAME;
  if (!name) throw new Error('DYNAMODB_TABLE_NAME is not set');
  return name;
}
