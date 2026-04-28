// DET-001: AI レポート生成 + 保存 + 一覧
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoClient, getTableName } from '../../shared/db/client.js';
import { pk, sk, gsi1pk, gsi2pk, GSI } from '../../shared/db/keys.js';
import { authMiddleware } from '../../shared/middleware/authMiddleware.js';
import { ForbiddenError } from '../../shared/errors/index.js';
import type { Report, UserRole } from '../../shared/types/index.js';

function requireManagerOrAbove(role: UserRole) {
  if (role === 'member') throw new ForbiddenError('レポート機能にはManager以上の権限が必要です');
}

const generateReportSchema = z.object({
  type:        z.enum(['project', 'workload', 'risk']),
  project_id:  z.string().uuid().optional(),
  period_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  period_to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine(
  (d) => d.type !== 'project' || !!d.project_id,
  { message: 'type が project の場合 project_id は必須です', path: ['project_id'] },
);

export const reportsHandler = new Hono()
  .use('*', authMiddleware)

  // POST /api/v1/reports/generate（Manager以上）
  .post('/generate', zValidator('json', generateReportSchema), async (c) => {
    requireManagerOrAbove(c.get('userRole'));

    const input = c.req.valid('json');
    const now = new Date().toISOString();
    const reportId = randomUUID();

    // AI Lambda（devflow-ai-api）に委譲するのが最終設計だが、
    // reports-api は保存と一覧を担当。ここでは Bedrock SDK 直接呼び出しで生成する
    const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
    const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'ap-northeast-1' });

    const modelId = process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-3-5-sonnet-20241022-v2:0';

    // CLAUDE.md: ユーザー入力は HumanMessage に隔離。SystemPrompt と連結禁止
    const prompt = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4096,
      system: 'あなたはITプロジェクト管理のエキスパートです。与えられた情報をもとに、プロフェッショナルなMarkdown形式のレポートを作成してください。',
      messages: [{
        role: 'user',
        // ユーザー指定内容はここに完全隔離
        content: `以下の条件でレポートを生成してください。\nタイプ: ${input.type}\n${input.project_id ? `案件ID: ${input.project_id}\n` : ''}${input.period_from ? `期間: ${input.period_from} 〜 ${input.period_to ?? '現在'}` : ''}`,
      }],
    };

    const result = await bedrock.send(new InvokeModelCommand({
      modelId,
      body: JSON.stringify(prompt),
      contentType: 'application/json',
      accept: 'application/json',
    }));

    const responseBody = JSON.parse(new TextDecoder().decode(result.body)) as { content: Array<{ text: string }> };
    const content = responseBody.content[0]?.text ?? '';

    const report: Report = {
      report_id:    reportId,
      title:        `${input.type === 'project' ? '案件' : input.type === 'workload' ? '工数' : 'リスク'}レポート ${now.slice(0, 10)}`,
      type:         input.type,
      content,
      project_id:   input.project_id,
      generated_by: c.get('userId'),
      created_at:   now,
    };

    const client = getDynamoClient();
    const table = getTableName();
    await client.send(new PutCommand({
      TableName: table,
      Item: {
        ...report,
        pk:     pk.report(reportId),
        sk:     sk.report(reportId),
        gsi1pk: gsi1pk.report,
        gsi1sk: now,
        gsi2pk: gsi2pk.report(c.get('userId')),
      },
    }));

    return c.json(report, 201);
  })

  // GET /api/v1/reports（Manager以上）- GSI1 作成日降順
  .get('/', async (c) => {
    requireManagerOrAbove(c.get('userRole'));

    const result = await getDynamoClient().send(new QueryCommand({
      TableName: getTableName(),
      IndexName: GSI.ENTITY_UPDATED,
      KeyConditionExpression: 'gsi1pk = :gsi1pk',
      ExpressionAttributeValues: { ':gsi1pk': gsi1pk.report },
      ScanIndexForward: false,
    }));

    const items = (result.Items ?? []).map((i) => ({
      report_id:  i.report_id,
      title:      i.title,
      type:       i.type,
      created_at: i.created_at,
    }));

    return c.json({ items });
  })

  // GET /api/v1/reports/:id（Manager以上）
  .get('/:id', zValidator('param', z.object({ id: z.string().uuid() })), async (c) => {
    requireManagerOrAbove(c.get('userRole'));
    const { id } = c.req.valid('param');

    const result = await getDynamoClient().send(
      new (await import('@aws-sdk/lib-dynamodb')).GetCommand({
        TableName: getTableName(),
        Key: { pk: pk.report(id), sk: sk.report(id) },
      }),
    );

    if (!result.Item) throw new (await import('../../shared/errors/index.js')).NotFoundError('report');
    const { pk: _pk, sk: _sk, gsi1pk: _g1, gsi1sk: _gs, gsi2pk: _g2, ...report } = result.Item;
    void _pk; void _sk; void _g1; void _gs; void _g2;
    return c.json(report);
  });
