// CLAUDE.md: JWT検証はAPI Gateway JWT Authorizerに委任。Lambda側で再検証しない
import { createMiddleware } from 'hono/factory';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { UnauthorizedError } from '../errors/index.js';
import type { UserRole, JwtClaims } from '../types/index.js';

const VALID_ROLES: UserRole[] = ['admin', 'manager', 'member'];

export const authMiddleware = createMiddleware(async (c, next) => {
  // API Gateway REST API JWT Authorizer は claims を
  // event.requestContext.authorizer.claims に注入する
  const event = c.env as APIGatewayProxyEvent;
  const claims = event?.requestContext?.authorizer?.claims as Partial<JwtClaims> | undefined;

  if (!claims?.sub) {
    throw new UnauthorizedError();
  }

  const role = claims['custom:role'] as UserRole | undefined;
  if (!role || !VALID_ROLES.includes(role)) {
    throw new UnauthorizedError('UNAUTHORIZED', '無効なロールです');
  }

  c.set('userId', claims.sub);
  c.set('userEmail', claims.email ?? '');
  c.set('userRole', role);
  c.set('userName', claims['custom:name'] ?? '');

  await next();
});
