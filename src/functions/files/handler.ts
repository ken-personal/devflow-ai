// DET-001: S3 署名付きURL発行のみ。Lambda経由でファイルをアップロードしない
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { authMiddleware } from '../../shared/middleware/authMiddleware.js';
import { ValidationError } from '../../shared/errors/index.js';

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-northeast-1' });

// REQ-001 F-050: 許可するMIMEタイプ
const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'application/zip',
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const presignedUrlSchema = z.object({
  file_name:    z.string().min(1).max(255),
  file_size:    z.number().int().min(1).max(MAX_FILE_SIZE),
  content_type: z.string().refine((v) => ALLOWED_CONTENT_TYPES.has(v), {
    message: `許可されていないファイル形式です。許可形式: ${[...ALLOWED_CONTENT_TYPES].join(', ')}`,
  }),
  target_type:  z.enum(['project', 'task']),
  target_id:    z.string().uuid(),
});

export const filesHandler = new Hono()
  .use('*', authMiddleware)

  // POST /api/v1/files/presigned-url
  .post('/presigned-url', zValidator('json', presignedUrlSchema), async (c) => {
    const { file_name, file_size, content_type, target_type, target_id } = c.req.valid('json');

    if (file_size > MAX_FILE_SIZE) {
      throw new ValidationError('FILE_TOO_LARGE', { max_size: MAX_FILE_SIZE });
    }

    const bucket = process.env.S3_BUCKET_NAME;
    if (!bucket) throw new Error('S3_BUCKET_NAME is not set');

    const fileId = randomUUID();
    // s3_key: {target_type}s/{target_id}/{file_id}/{file_name}
    const s3Key = `${target_type}s/${target_id}/${fileId}/${file_name}`;

    // CLAUDE.md: アップロード用署名付きURL有効期限 300秒
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        ContentType: content_type,
        ContentLength: file_size,
        Metadata: {
          file_id:     fileId,
          target_type: target_type,
          target_id:   target_id,
          uploaded_by: c.get('userId'),
        },
      }),
      { expiresIn: 300 },
    );

    return c.json({ upload_url: uploadUrl, file_id: fileId, expires_in: 300 }, 201);
  });
