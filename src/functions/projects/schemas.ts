// CLAUDE.md: Zodスキーマから型を z.infer<typeof schema> で推論。型定義を別途書かない
import { z } from 'zod';

export const projectStatusSchema = z.enum(['planning', 'active', 'review', 'hold', 'delayed']);

// GET /api/v1/projects クエリパラメータ
export const listProjectsQuerySchema = z.object({
  status:      z.union([z.string(), z.array(z.string())]).optional()
                 .transform((v) => v ? (Array.isArray(v) ? v : [v]) : undefined)
                 .pipe(z.array(projectStatusSchema).optional()),
  assignee_id: z.string().uuid().optional(),
  start_from:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_to:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q:           z.string().max(100).optional(),
  sort:        z.enum(['updated_at', 'created_at', 'end_date']).default('updated_at'),
  order:       z.enum(['asc', 'desc']).default('desc'),
  limit:       z.coerce.number().int().min(1).max(100).default(20),
  offset:      z.coerce.number().int().min(0).default(0),
});

// POST /api/v1/projects ボディ
export const createProjectSchema = z.object({
  name:         z.string().min(1).max(100),
  client_name:  z.string().min(1).max(100),
  status:       projectStatusSchema,
  budget:       z.number().int().min(0).optional(),
  start_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  assignee_ids: z.array(z.string().uuid()).min(1),
  description:  z.string().max(2000).optional(),
}).refine((d) => d.start_date < d.end_date, {
  message: 'end_date は start_date より後の日付を指定してください',
  path: ['end_date'],
});

// PUT /api/v1/projects/:id ボディ（部分更新）
export const updateProjectSchema = z.object({
  name:         z.string().min(1).max(100).optional(),
  client_name:  z.string().min(1).max(100).optional(),
  status:       projectStatusSchema.optional(),
  budget:       z.number().int().min(0).optional(),
  start_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  assignee_ids: z.array(z.string().uuid()).min(1).optional(),
  description:  z.string().max(2000).optional(),
  progress:     z.number().int().min(0).max(100).optional(),
}).refine(
  (d) => !(d.start_date && d.end_date) || d.start_date < d.end_date,
  { message: 'end_date は start_date より後の日付を指定してください', path: ['end_date'] },
);

export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
