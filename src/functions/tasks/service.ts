import { randomUUID } from 'crypto';
import type { Task, Comment, UserRole } from '../../shared/types/index.js';
import { ForbiddenError, NotFoundError } from '../../shared/errors/index.js';
import type { ITaskRepository } from '../../shared/db/repositories/taskRepository.js';
import type { IProjectRepository } from '../../shared/db/repositories/projectRepository.js';
import type { CreateTaskInput, UpdateTaskInput, ListTasksQuery, CreateCommentInput } from './schemas.js';

function dueDateToEpoch(dateStr: string): number {
  return Math.floor(new Date(`${dateStr}T23:59:59Z`).getTime() / 1000);
}

export class TaskService {
  constructor(
    private readonly taskRepo: ITaskRepository,
    private readonly projectRepo: IProjectRepository,
  ) {}

  async list(userId: string, role: UserRole, query: ListTasksQuery): Promise<{
    total: number; limit: number; offset: number; items: Task[];
  }> {
    let tasks: Task[];

    const targetAssigneeId = query.assignee_id === 'me' ? userId : query.assignee_id;

    if (query.overdue_only && targetAssigneeId) {
      // AP-08: 期限切れタスク検出（GSI4）
      tasks = await this.taskRepo.listOverdue(targetAssigneeId, Math.floor(Date.now() / 1000));
    } else if (query.project_id) {
      // AP-05: 案件に紐づくタスク一覧
      tasks = await this.taskRepo.listByProject(query.project_id);
    } else if (targetAssigneeId) {
      // AP-07: 担当者のタスク一覧
      tasks = await this.taskRepo.listByAssignee(targetAssigneeId);
    } else if (role === 'member') {
      // Member: 自分のタスクのみ
      tasks = await this.taskRepo.listByAssignee(userId);
    } else {
      // Manager/Admin: 全タスク（GSI1 更新日降順、最大500件）
      tasks = await this.taskRepo.listAll();
    }

    // 論理削除済み除外
    tasks = tasks.filter((t) => !t.is_deleted);

    // フィルタリング
    if (query.status?.length) tasks = tasks.filter((t) => query.status!.includes(t.status));
    if (query.priority?.length) tasks = tasks.filter((t) => query.priority!.includes(t.priority));
    if (query.due_from) {
      const from = new Date(query.due_from).getTime();
      tasks = tasks.filter((t) => new Date(t.due_date).getTime() >= from);
    }
    if (query.due_to) {
      const to = new Date(query.due_to).getTime();
      tasks = tasks.filter((t) => new Date(t.due_date).getTime() <= to);
    }

    const total = tasks.length;
    const paged = tasks.slice(query.offset, query.offset + query.limit);
    return { total, limit: query.limit, offset: query.offset, items: paged };
  }

  async create(input: CreateTaskInput, _userId: string, _role: UserRole): Promise<Task> {
    // 案件の存在確認
    const project = await this.projectRepo.get(input.project_id);
    if (!project || project.is_deleted) throw new NotFoundError('project');

    const now = new Date().toISOString();
    const task: Task = {
      task_id:     randomUUID(),
      project_id:  input.project_id,
      title:       input.title,
      status:      input.status,
      priority:    input.priority,
      assignee_id: input.assignee_id,
      due_date:    input.due_date,
      due_epoch:   dueDateToEpoch(input.due_date),
      description: input.description,
      is_deleted:  false,
      created_at:  now,
      updated_at:  now,
    };
    await this.taskRepo.put(task);
    return task;
  }

  async update(
    taskId: string,
    input: UpdateTaskInput,
    userId: string,
    role: UserRole,
  ): Promise<Task> {
    const task = await this.taskRepo.getByTaskId(taskId);
    if (!task || task.is_deleted) throw new NotFoundError('task');

    // 権限チェック: 担当者 or Manager以上
    if (role === 'member' && task.assignee_id !== userId) throw new ForbiddenError();
    // assignee_id 変更は Manager 以上のみ
    if (input.assignee_id && role === 'member') throw new ForbiddenError('担当者変更にはManager以上の権限が必要です');

    const now = new Date().toISOString();
    const updates: Partial<Task> = { ...input, updated_at: now };

    // due_date を更新した場合は due_epoch も更新
    if (input.due_date) {
      updates.due_epoch = dueDateToEpoch(input.due_date);
    }

    await this.taskRepo.update(task.project_id, taskId, updates);
    return (await this.taskRepo.getByTaskId(taskId))!;
  }

  async logicalDelete(taskId: string, role: UserRole): Promise<void> {
    if (role === 'member') throw new ForbiddenError('タスク削除にはManager以上の権限が必要です');

    const task = await this.taskRepo.getByTaskId(taskId);
    if (!task || task.is_deleted) throw new NotFoundError('task');

    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;

    // #5決定: タスク削除時にそのタスク配下のFile連鎖論理削除は fileRepository で行う
    await this.taskRepo.update(task.project_id, taskId, { is_deleted: true, ttl, updated_at: now });
  }

  async addComment(
    taskId: string,
    input: CreateCommentInput,
    userId: string,
    _role: UserRole,
  ): Promise<Comment> {
    const task = await this.taskRepo.getByTaskId(taskId);
    if (!task || task.is_deleted) throw new NotFoundError('task');

    const now = new Date().toISOString();
    const comment: Comment = {
      comment_id: randomUUID(),
      task_id:    taskId,
      project_id: task.project_id,
      body:       input.body,
      author_id:  userId,
      created_at: now,
    };
    await this.taskRepo.putComment(comment);
    return comment;
  }
}
