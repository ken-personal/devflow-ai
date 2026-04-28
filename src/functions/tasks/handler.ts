import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../../shared/middleware/authMiddleware.js';
import { TaskService } from './service.js';
import { TaskRepository } from '../../shared/db/repositories/taskRepository.js';
import { ProjectRepository } from '../../shared/db/repositories/projectRepository.js';
import {
  listTasksQuerySchema,
  createTaskSchema,
  updateTaskSchema,
  createCommentSchema,
} from './schemas.js';

const taskRepo = new TaskRepository();
const projectRepo = new ProjectRepository();
const service = new TaskService(taskRepo, projectRepo);

export const tasksHandler = new Hono()
  .use('*', authMiddleware)

  // GET /api/v1/tasks
  .get('/', zValidator('query', listTasksQuerySchema), async (c) => {
    const query = c.req.valid('query');
    const result = await service.list(c.get('userId'), c.get('userRole'), query);
    return c.json(result);
  })

  // POST /api/v1/tasks
  .post('/', zValidator('json', createTaskSchema), async (c) => {
    const input = c.req.valid('json');
    const task = await service.create(input, c.get('userId'), c.get('userRole'));
    return c.json(task, 201);
  })

  // PUT /api/v1/tasks/:id
  .put(
    '/:id',
    zValidator('param', z.object({ id: z.string().uuid() })),
    zValidator('json', updateTaskSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const input = c.req.valid('json');
      const task = await service.update(id, input, c.get('userId'), c.get('userRole'));
      return c.json(task);
    },
  )

  // DELETE /api/v1/tasks/:id
  .delete('/:id', zValidator('param', z.object({ id: z.string().uuid() })), async (c) => {
    const { id } = c.req.valid('param');
    await service.logicalDelete(id, c.get('userRole'));
    return c.body(null, 204);
  })

  // POST /api/v1/tasks/:id/comments
  .post(
    '/:id/comments',
    zValidator('param', z.object({ id: z.string().uuid() })),
    zValidator('json', createCommentSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const input = c.req.valid('json');
      const comment = await service.addComment(id, input, c.get('userId'), c.get('userRole'));
      return c.json(comment, 201);
    },
  );
