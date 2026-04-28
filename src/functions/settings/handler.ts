import { Hono }         from 'hono';
import { zValidator }   from '@hono/zod-validator';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoClient, getTableName } from '../../shared/db/client.js';
import { FIXED_PK, FIXED_SK } from '../../shared/db/keys.js';
import { ForbiddenError } from '../../shared/errors/index.js';
import { updateBedrockSettingsSchema } from './schemas.js';

// declare module 'hono' でグローバル拡張済みのためジェネリクス不要
const app = new Hono();

// デフォルト設定
const DEFAULTS = {
  model_id:    'anthropic.claude-3-5-sonnet-20241022-v2:0',
  temperature: 0.1,
  max_tokens:  2048,
} as const;

// GET /settings/bedrock — 認証済みユーザー全員が参照可
app.get('/bedrock', async (c) => {
  const client = getDynamoClient();
  const result = await client.send(new GetCommand({
    TableName: getTableName(),
    Key: { pk: FIXED_PK.SETTINGS, sk: FIXED_SK.BEDROCK },
  }));

  const item = result.Item;
  return c.json({
    model_id:    item?.['model_id']    ?? DEFAULTS.model_id,
    temperature: item?.['temperature'] ?? DEFAULTS.temperature,
    max_tokens:  item?.['max_tokens']  ?? DEFAULTS.max_tokens,
    updated_at:  item?.['updated_at']  ?? null,
    updated_by:  item?.['updated_by']  ?? null,
  });
});

// PUT /settings/bedrock — Admin のみ
app.put('/bedrock', zValidator('json', updateBedrockSettingsSchema), async (c) => {
  const userRole = c.get('userRole');
  if (userRole !== 'admin') throw new ForbiddenError('管理者のみ設定を変更できます');

  const userId = c.get('userId');
  const body   = c.req.valid('json');
  const now    = new Date().toISOString();

  // 現在の設定を取得してマージ
  const client = getDynamoClient();
  const current = await client.send(new GetCommand({
    TableName: getTableName(),
    Key: { pk: FIXED_PK.SETTINGS, sk: FIXED_SK.BEDROCK },
  }));

  const merged = {
    model_id:    body.model_id    ?? current.Item?.['model_id']    ?? DEFAULTS.model_id,
    temperature: body.temperature ?? current.Item?.['temperature'] ?? DEFAULTS.temperature,
    max_tokens:  body.max_tokens  ?? current.Item?.['max_tokens']  ?? DEFAULTS.max_tokens,
  };

  await client.send(new PutCommand({
    TableName: getTableName(),
    Item: {
      pk:          FIXED_PK.SETTINGS,
      sk:          FIXED_SK.BEDROCK,
      entity_type: 'SETTINGS',
      ...merged,
      updated_at:  now,
      updated_by:  userId,
    },
  }));

  return c.json({ ...merged, updated_at: now, updated_by: userId });
});

export default app;
