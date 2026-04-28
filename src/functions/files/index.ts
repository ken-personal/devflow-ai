import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { errorHandler } from '../../shared/middleware/errorMiddleware.js';
import { filesHandler } from './handler.js';

const app = new Hono().basePath('/api/v1');
app.route('/files', filesHandler);
app.onError(errorHandler);

export const handler = handle(app);
