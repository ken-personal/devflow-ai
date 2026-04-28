// CLAUDE.md: Handler はZodバリデーションとレスポンス成形のみ。ビジネスロジックを書かない
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../../shared/middleware/authMiddleware.js';
import { ProjectService } from './service.js';
import { ProjectRepository } from '../../shared/db/repositories/projectRepository.js';
import { TaskRepository } from '../../shared/db/repositories/taskRepository.js';
import {
  listProjectsQuerySchema,
  createProjectSchema,
  updateProjectSchema,
} from './schemas.js';

const projectRepo = new ProjectRepository();
const taskRepo = new TaskRepository();
const service = new ProjectService(projectRepo, taskRepo);

export const projectsHandler = new Hono()
  .use('*', authMiddleware)

  // GET /api/v1/projects
  .get('/', zValidator('query', listProjectsQuerySchema), async (c) => {
    const query = c.req.valid('query');
    const result = await service.list(c.get('userId'), c.get('userRole'), query);
    return c.json(result);
  })

  // POST /api/v1/projects
  .post('/', zValidator('json', createProjectSchema), async (c) => {
    const input = c.req.valid('json');
    const project = await service.create(input, c.get('userId'), c.get('userRole'));
    return c.json(project, 201);
  })

  // GET /api/v1/projects/:id
  .get('/:id', zValidator('param', z.object({ id: z.string().uuid() })), async (c) => {
    const { id } = c.req.valid('param');
    const project = await service.get(id, c.get('userId'), c.get('userRole'));
    return c.json(project);
  })

  // PUT /api/v1/projects/:id
  .put(
    '/:id',
    zValidator('param', z.object({ id: z.string().uuid() })),
    zValidator('json', updateProjectSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const input = c.req.valid('json');
      const project = await service.update(id, input, c.get('userId'), c.get('userRole'));
      return c.json(project);
    },
  )

  // DELETE /api/v1/projects/:id
  .delete('/:id', zValidator('param', z.object({ id: z.string().uuid() })), async (c) => {
    const { id } = c.req.valid('param');
    await service.logicalDelete(id, c.get('userRole'));
    return c.body(null, 204);
  });
