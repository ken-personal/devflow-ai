import { handle }        from 'hono/aws-lambda';
import { Hono }          from 'hono';
import { authMiddleware } from '../../shared/middleware/authMiddleware.js';
import { errorHandler }  from '../../shared/middleware/errorMiddleware.js';
import settingsHandler   from './handler.js';

const app = new Hono().basePath('/api/v1');
app.use('*', authMiddleware);
app.route('/settings', settingsHandler);
app.onError(errorHandler);

export const handler = handle(app);
