// CLAUDE.md: Honoグローバルエラーハンドラー
// ZodError → ValidationError(400) / AppError → 対応ステータス / 予期しないエラー → 500
import type { Context } from 'hono';
import { ZodError } from 'zod';
import { AppError, ValidationError } from '../errors/index.js';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

function buildErrorBody(code: string, message: string, details?: Record<string, unknown>): ErrorBody {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

export function errorHandler(err: unknown, c: Context) {
  // Zodバリデーションエラー → 400
  if (err instanceof ZodError) {
    const validationError = new ValidationError('入力値が不正です', {
      fields: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return c.json(buildErrorBody(validationError.code, validationError.message, validationError.details), 400);
  }

  // AppError サブクラス → 対応ステータスコード
  if (err instanceof AppError) {
    return c.json(buildErrorBody(err.code, err.message, err.details), err.statusCode as 400 | 401 | 403 | 404 | 409 | 429 | 500 | 504);
  }

  // 予期しないエラー → JSON構造化ログ出力後 500
  const message = err instanceof Error ? err.message : 'Unknown error';
  console.error(JSON.stringify({
    level: 'ERROR',
    message: 'Unexpected error',
    error: message,
    stack: err instanceof Error ? err.stack : undefined,
    timestamp: new Date().toISOString(),
  }));

  return c.json(buildErrorBody('INTERNAL_ERROR', 'サーバーエラーが発生しました。しばらく待ってから再試行してください'), 500);
}
