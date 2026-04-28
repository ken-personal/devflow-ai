// DET-001 SEQ-001: Cognito HostedUI 認証コードフロー
// フロントが HostedUI でログイン → code を受け取り → POST /auth/login で Lambda がトークン交換
// InitiateAuth の AuthFlowType に AUTHORIZATION_CODE は存在しないため
// Cognito の /oauth2/token エンドポイントを fetch で直接呼び出す
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  GlobalSignOutCommand,
  GetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { UnauthorizedError } from '../../shared/errors/index.js';
import { authMiddleware } from '../../shared/middleware/authMiddleware.js';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION ?? 'ap-northeast-1',
});

const loginSchema = z.object({
  code:         z.string().min(1),
  redirect_uri: z.string().url(),
});

const REFRESH_COOKIE = 'refresh_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'Strict' as const,
  maxAge: 30 * 24 * 60 * 60, // 30日
};

// Cognito /oauth2/token レスポンス型
interface CognitoTokenResponse {
  access_token: string;
  refresh_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
}

async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  clientId: string,
): Promise<CognitoTokenResponse> {
  const cognitoDomain = process.env.COGNITO_DOMAIN;
  if (!cognitoDomain) throw new Error('COGNITO_DOMAIN is not set');

  const body = new URLSearchParams({
    grant_type:   'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id:    clientId,
  });

  const res = await fetch(`${cognitoDomain}/oauth2/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  if (!res.ok) {
    throw new UnauthorizedError('INVALID_CODE', '認証コードが無効または期限切れです');
  }

  return res.json() as Promise<CognitoTokenResponse>;
}

export const authHandler = new Hono()

  // POST /api/v1/auth/login（公開エンドポイント）
  .post('/login', zValidator('json', loginSchema), async (c) => {
    const { code, redirect_uri } = c.req.valid('json');
    const clientId = process.env.COGNITO_CLIENT_ID;
    if (!clientId) throw new Error('COGNITO_CLIENT_ID is not set');

    const tokens = await exchangeCodeForTokens(code, redirect_uri, clientId);

    // リフレッシュトークンは HttpOnly Cookie にセット（localStorage 禁止: BSD-001 9.1）
    setCookie(c, REFRESH_COOKIE, tokens.refresh_token, COOKIE_OPTIONS);

    // ユーザー情報取得
    const userInfo = await cognitoClient.send(new GetUserCommand({ AccessToken: tokens.access_token }));
    const attrs = Object.fromEntries(
      (userInfo.UserAttributes ?? []).map((a) => [a.Name ?? '', a.Value ?? '']),
    );

    return c.json({
      access_token: tokens.access_token,
      token_type:   'Bearer',
      expires_in:   tokens.expires_in,
      user: {
        user_id:    attrs['sub'],
        email:      attrs['email'],
        name:       attrs['custom:name'] ?? attrs['name'],
        role:       attrs['custom:role'] ?? 'member',
        is_active:  true,
        created_at: new Date().toISOString(),
      },
    });
  })

  // POST /api/v1/auth/logout（JWT必須）
  .post('/logout', authMiddleware, async (c) => {
    const authHeader = c.req.header('Authorization');
    const accessToken = authHeader?.replace('Bearer ', '');
    if (accessToken) {
      await cognitoClient.send(new GlobalSignOutCommand({ AccessToken: accessToken }));
    }
    deleteCookie(c, REFRESH_COOKIE);
    return c.body(null, 204);
  })

  // POST /api/v1/auth/refresh（HttpOnly Cookie 経由）
  .post('/refresh', async (c) => {
    const refreshToken = getCookie(c, REFRESH_COOKIE);
    if (!refreshToken) {
      throw new UnauthorizedError('REFRESH_TOKEN_EXPIRED', 'リフレッシュトークンが無効です');
    }

    const clientId = process.env.COGNITO_CLIENT_ID;
    if (!clientId) throw new Error('COGNITO_CLIENT_ID is not set');

    const result = await cognitoClient.send(new InitiateAuthCommand({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: clientId,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    }));

    const auth = result.AuthenticationResult;
    if (!auth?.AccessToken) {
      deleteCookie(c, REFRESH_COOKIE);
      throw new UnauthorizedError('REFRESH_TOKEN_EXPIRED', 'リフレッシュトークンの有効期限が切れました');
    }

    return c.json({
      access_token: auth.AccessToken,
      token_type:   'Bearer',
      expires_in:   auth.ExpiresIn ?? 3600,
    });
  })

  // GET /api/v1/auth/me（JWT必須）
  .get('/me', authMiddleware, (c) => {
    return c.json({
      user_id:       c.get('userId'),
      email:         c.get('userEmail'),
      name:          c.get('userName'),
      role:          c.get('userRole'),
      is_active:     true,
      mfa_enabled:   false, // TODO: DynamoDBのUserレコードから取得
      last_login_at: null,
    });
  });
