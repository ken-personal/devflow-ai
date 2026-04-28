// DET-001: ユーザー管理 Admin専用。Cognito + DynamoDB の両方を操作
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminEnableUserCommand,
  AdminDisableUserCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { authMiddleware } from '../../shared/middleware/authMiddleware.js';
import { ForbiddenError, ConflictError } from '../../shared/errors/index.js';

const cognito = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION ?? 'ap-northeast-1',
});

function requireAdmin(role: string) {
  if (role !== 'admin') throw new ForbiddenError('ユーザー管理にはAdmin権限が必要です');
}

const createUserSchema = z.object({
  email: z.string().email(),
  name:  z.string().min(1).max(50),
  role:  z.enum(['manager', 'member']),
});

const updateUserSchema = z.object({
  role:      z.enum(['admin', 'manager', 'member']).optional(),
  is_active: z.boolean().optional(),
  name:      z.string().min(1).max(50).optional(),
});

export const usersHandler = new Hono()
  .use('*', authMiddleware)

  // GET /api/v1/users（Admin専用）
  .get('/', async (c) => {
    requireAdmin(c.get('userRole'));

    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    if (!userPoolId) throw new Error('COGNITO_USER_POOL_ID is not set');

    const result = await cognito.send(new ListUsersCommand({ UserPoolId: userPoolId }));
    const users = (result.Users ?? []).map((u) => {
      const attrs = Object.fromEntries((u.Attributes ?? []).map((a) => [a.Name, a.Value]));
      return {
        user_id:       attrs.sub,
        email:         attrs.email,
        name:          attrs['custom:name'] ?? attrs.name,
        role:          attrs['custom:role'] ?? 'member',
        is_active:     u.Enabled,
        last_login_at: null,
      };
    });

    return c.json({ items: users });
  })

  // POST /api/v1/users（Admin専用）
  .post('/', zValidator('json', createUserSchema), async (c) => {
    requireAdmin(c.get('userRole'));

    const { email, name, role } = c.req.valid('json');
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    if (!userPoolId) throw new Error('COGNITO_USER_POOL_ID is not set');

    try {
      const result = await cognito.send(new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'custom:name', Value: name },
          { Name: 'custom:role', Value: role },
        ],
        DesiredDeliveryMediums: ['EMAIL'],
      }));

      const attrs = Object.fromEntries(
        (result.User?.Attributes ?? []).map((a) => [a.Name, a.Value]),
      );

      return c.json({
        user_id: attrs.sub,
        email, name, role, is_active: true,
        created_at: new Date().toISOString(),
      }, 201);
    } catch (e) {
      if (e instanceof Error && e.name === 'UsernameExistsException') {
        throw new ConflictError('EMAIL_ALREADY_EXISTS', 'このメールアドレスは既に登録されています');
      }
      throw e;
    }
  })

  // PUT /api/v1/users/:id（Admin専用）
  .put('/:id', zValidator('param', z.object({ id: z.string() })), zValidator('json', updateUserSchema), async (c) => {
    requireAdmin(c.get('userRole'));

    const { id } = c.req.valid('param');
    const input = c.req.valid('json');

    // CLAUDE.md: 自分自身への無効化禁止
    if (id === c.get('userId') && input.is_active === false) {
      throw new ForbiddenError('自分自身を無効化することはできません', 'SELF_OPERATION_FORBIDDEN');
    }

    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    if (!userPoolId) throw new Error('COGNITO_USER_POOL_ID is not set');

    const attrs: { Name: string; Value: string }[] = [];
    if (input.name) attrs.push({ Name: 'custom:name', Value: input.name });
    if (input.role) attrs.push({ Name: 'custom:role', Value: input.role });

    if (attrs.length > 0) {
      await cognito.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: id,
        UserAttributes: attrs,
      }));
    }

    if (input.is_active !== undefined) {
      const Command = input.is_active ? AdminEnableUserCommand : AdminDisableUserCommand;
      await cognito.send(new Command({ UserPoolId: userPoolId, Username: id }));
    }

    return c.json({ user_id: id, ...input });
  });
