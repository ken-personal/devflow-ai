import { z } from 'zod';

export const taskStatusSchema = z.enum(['todo', 'in_progress', 'review', 'done']);
export const taskPrioritySchema = z.enum(['high', 'medium', 'low']);

// GET /api/v1/tasks クエリパラメータ
export const listTasksQuerySchema = z.object({
  project_id:   z.string().uuid().optional(),
  assignee_id:  z.union([z.literal('me'), z.string().uuid()]).optional(),
  status:       z.union([z.string(), z.array(z.string())]).optional()
                  .transform((v) => v ? (Array.isArray(v) ? v : [v]) : undefined)
                  .pipe(z.array(taskStatusSchema).optional()),
  priority:     z.union([z.string(), z.array(z.string())]).optional()
                  .transform((v) => v ? (Array.isArray(v) ? v : [v]) : undefined)
                  .pipe(z.array(taskPrioritySchema).optional()),
  due_from:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  due_to:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  overdue_only: z.coerce.boolean().default(false),
  limit:        z.coerce.number().int().min(1).max(200).default(50),
  offset:       z.coerce.number().int().min(0).default(0),
});

// POST /api/v1/tasks ボディ
export const createTaskSchema = z.object({
  project_id:  z.string().uuid(),
  title:       z.string().min(1).max(200),
  status:      taskStatusSchema.default('todo'),
  priority:    taskPrioritySchema.default('medium'),
  assignee_id: z.string().uuid(),
  due_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(5000).optional(),
});

// PUT /api/v1/tasks/:id ボディ（部分更新）
export const updateTaskSchema = z.object({
  title:       z.string().min(1).max(200).optional(),
  status:      taskStatusSchema.optional(),
  priority:    taskPrioritySchema.optional(),
  due_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().max(5000).optional(),
  // assignee_id 変更は Manager 以上のみ（Service層で権限チェック）
  assignee_id: z.string().uuid().optional(),
});

// POST /api/v1/tasks/:id/comments ボディ
export const createCommentSchema = z.object({
  body: z.string().min(1).max(2000),
});

export type ListTasksQuery  = z.infer<typeof listTasksQuerySchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
