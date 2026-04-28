// CLAUDE.md: エラーハンドリング方針準拠
// 共通フォーマット: { "error": { "code": "...", "message": "...", "details": {} } }

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', 400, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(code = 'UNAUTHORIZED', message = '認証が必要です') {
    super(code, 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'アクセス権限がありません', code = 'FORBIDDEN') {
    super(code, 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource.toUpperCase()}_NOT_FOUND`, 404, `${resource}が見つかりません`);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(code, 409, message);
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super('RATE_LIMIT_EXCEEDED', 429, 'リクエストが多すぎます。しばらく待ってから再試行してください');
  }
}

export class BedrockTimeoutError extends AppError {
  constructor() {
    super('BEDROCK_TIMEOUT', 504, 'AI処理がタイムアウトしました');
  }
}
