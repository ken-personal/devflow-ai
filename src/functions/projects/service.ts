// CLAUDE.md: Service はビジネスロジック・権限チェック・複数 Repository 協調
// DynamoDB 操作は Repository 経由のみ
import { randomUUID } from 'crypto';
import type { Project, ProjectAssignee, UserRole } from '../../shared/types/index.js';
import { ForbiddenError, NotFoundError, ConflictError } from '../../shared/errors/index.js';
import type { IProjectRepository } from '../../shared/db/repositories/projectRepository.js';
import type { ITaskRepository } from '../../shared/db/repositories/taskRepository.js';
import type { CreateProjectInput, UpdateProjectInput, ListProjectsQuery } from './schemas.js';

export interface ProjectListItem {
  project_id: string;
  name: string;
  client_name: string;
  status: Project['status'];
  progress: number;
  assignees: string[]; // user_id 一覧
  task_count: number;
  created_at: string;
  updated_at: string;
}

export class ProjectService {
  constructor(
    private readonly projectRepo: IProjectRepository,
    private readonly taskRepo: ITaskRepository,
  ) {}

  async list(
    userId: string,
    role: UserRole,
    query: ListProjectsQuery,
  ): Promise<{ total: number; limit: number; offset: number; items: ProjectListItem[] }> {
    let projects: Project[];

    if (role === 'member') {
      // Member: 担当案件のみ（AP-03）
      const projectIds = await this.projectRepo.listByAssignee(userId);
      const fetched = await Promise.all(projectIds.map((id) => this.projectRepo.get(id)));
      projects = fetched.filter((p): p is Project => p !== null && !p.is_deleted);
    } else {
      // Manager / Admin: 全案件（AP-02）
      const result = await this.projectRepo.listAll(1000);
      projects = result.items.filter((p) => !p.is_deleted);
    }

    // フィルタリング
    if (query.status?.length) {
      projects = projects.filter((p) => query.status!.includes(p.status));
    }
    if (query.q) {
      const q = query.q.toLowerCase();
      projects = projects.filter(
        (p) => p.name.toLowerCase().includes(q) || p.client_name.toLowerCase().includes(q),
      );
    }

    const total = projects.length;

    // ページネーション
    const paged = projects.slice(query.offset, query.offset + query.limit);

    // 担当者情報を付与
    const items = await Promise.all(
      paged.map(async (p) => {
        const assignees = await this.projectRepo.listAssignees(p.project_id);
        const tasks = await this.taskRepo.listByProject(p.project_id);
        return {
          project_id: p.project_id,
          name: p.name,
          client_name: p.client_name,
          status: p.status,
          progress: p.progress,
          assignees: assignees.map((a) => a.user_id),
          task_count: tasks.filter((t) => !t.is_deleted).length,
          created_at: p.created_at,
          updated_at: p.updated_at,
        };
      }),
    );

    return { total, limit: query.limit, offset: query.offset, items };
  }

  async get(projectId: string, userId: string, role: UserRole): Promise<Project> {
    const project = await this.projectRepo.get(projectId);
    if (!project || project.is_deleted) throw new NotFoundError('project');

    // Member は担当案件のみ参照可
    if (role === 'member') {
      const assignedIds = await this.projectRepo.listByAssignee(userId);
      if (!assignedIds.includes(projectId)) throw new ForbiddenError();
    }

    return project;
  }

  async create(input: CreateProjectInput, userId: string, role: UserRole): Promise<Project> {
    if (role === 'member') throw new ForbiddenError('案件登録にはManager以上の権限が必要です');

    const now = new Date().toISOString();
    const project: Project = {
      project_id: randomUUID(),
      name: input.name,
      client_name: input.client_name,
      status: input.status,
      progress: 0,
      budget: input.budget,
      start_date: input.start_date,
      end_date: input.end_date,
      owner_id: userId,
      description: input.description,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    };

    await this.projectRepo.put(project);

    // 担当者アサイン
    const assignees: ProjectAssignee[] = input.assignee_ids.map((uid) => ({
      project_id: project.project_id,
      user_id: uid,
      assigned_at: now,
    }));
    await Promise.all(assignees.map((a) => this.projectRepo.putAssignee(a)));

    return project;
  }

  async update(
    projectId: string,
    input: UpdateProjectInput,
    _userId: string,
    role: UserRole,
  ): Promise<Project> {
    if (role === 'member') throw new ForbiddenError('案件更新にはManager以上の権限が必要です');

    const project = await this.projectRepo.get(projectId);
    if (!project || project.is_deleted) throw new NotFoundError('project');

    const now = new Date().toISOString();
    const { assignee_ids, ...rest } = input;

    await this.projectRepo.update(projectId, { ...rest, updated_at: now });

    // 担当者の更新
    if (assignee_ids) {
      const current = await this.projectRepo.listAssignees(projectId);
      const currentIds = new Set(current.map((a) => a.user_id));
      const newIds = new Set(assignee_ids);

      const toAdd = assignee_ids.filter((id) => !currentIds.has(id));
      const toRemove = current.filter((a) => !newIds.has(a.user_id));

      await Promise.all([
        ...toAdd.map((uid) =>
          this.projectRepo.putAssignee({ project_id: projectId, user_id: uid, assigned_at: now }),
        ),
        ...toRemove.map((a) => this.projectRepo.deleteAssignee(projectId, a.user_id)),
      ]);
    }

    return (await this.projectRepo.get(projectId))!;
  }

  async logicalDelete(projectId: string, role: UserRole): Promise<void> {
    if (role !== 'admin') throw new ForbiddenError('案件削除にはAdmin権限が必要です');

    const project = await this.projectRepo.get(projectId);
    if (!project) throw new NotFoundError('project');
    if (project.is_deleted) throw new ConflictError('ALREADY_DELETED', 'すでに削除されています');

    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60; // 90日後

    await this.projectRepo.update(projectId, { is_deleted: true, ttl, updated_at: now });

    // CLAUDE.md: 案件削除時は関連タスクも論理削除
    await this.taskRepo.logicalDeleteByProject(projectId, now, ttl);
  }
}
