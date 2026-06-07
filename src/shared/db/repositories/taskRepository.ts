// CLAUDE.md: RepositoryはDynamoDB操作のみ。ビジネスロジックを書かない
import {
  PutCommand, GetCommand, QueryCommand, UpdateCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { getDynamoClient, getTableName } from '../client.js';
import { pk, sk, gsi1pk, gsi2pk, SK_PREFIX, GSI } from '../keys.js';
import type { Task, Comment } from '../../types/index.js';

// ─── DynamoDBアイテム型 ────────────────────────────────────
interface TaskItem extends Task {
  pk: string;
  sk: string;
  gsi1pk: string;
  gsi1sk: string;
  gsi2pk: string;
  // GSI3: task_id をPKとして使用
  // GSI4: assignee_id + due_epoch
}

interface CommentItem extends Comment {
  pk: string;
  sk: string;
}

// ─── 変換ヘルパー ──────────────────────────────────────────
function toTaskItem(task: Task): TaskItem {
  return {
    ...task,
    pk: pk.project(task.project_id),
    sk: sk.task(task.task_id),
    gsi1pk: gsi1pk.task,
    gsi1sk: task.updated_at,
    gsi2pk: gsi2pk.user(task.assignee_id),
    // task_id はGSI3のPKとして機能（属性名そのまま）
    // assignee_id + due_epoch はGSI4のキーとして機能（属性名そのまま）
  };
}

function fromTaskItem(item: Record<string, unknown>): Task {
  const { pk: _pk, sk: _sk, gsi1pk: _g1pk, gsi1sk: _g1sk, gsi2pk: _g2pk, ...rest } = item;
  void _pk; void _sk; void _g1pk; void _g1sk; void _g2pk;
  return rest as unknown as Task;
}

// ─── Repository ───────────────────────────────────────────
export interface ITaskRepository {
  put(task: Task): Promise<void>;
  get(projectId: string, taskId: string): Promise<Task | null>;
  getByTaskId(taskId: string): Promise<Task | null>;
  listAll(limit?: number): Promise<Task[]>;
  listByProject(projectId: string): Promise<Task[]>;
  listByAssignee(userId: string): Promise<Task[]>;
  listOverdue(assigneeId: string, nowEpoch: number): Promise<Task[]>;
  update(projectId: string, taskId: string, attrs: Partial<Task>): Promise<void>;
  logicalDeleteByProject(projectId: string, now: string, ttl: number): Promise<void>;
  putComment(comment: Comment): Promise<void>;
  listComments(projectId: string, taskId: string): Promise<Comment[]>;
}

export class TaskRepository implements ITaskRepository {
  private readonly client = getDynamoClient();
  private readonly table = getTableName();

  async put(task: Task): Promise<void> {
    await this.client.send(new PutCommand({ TableName: this.table, Item: toTaskItem(task) }));
  }

  // AP-05: 案件のitem collectionからタスクを取得
  async get(projectId: string, taskId: string): Promise<Task | null> {
    const result = await this.client.send(new GetCommand({
      TableName: this.table,
      Key: { pk: pk.project(projectId), sk: sk.task(taskId) },
    }));
    if (!result.Item) return null;
    return fromTaskItem(result.Item);
  }

  // AP-06: task_id だけで取得（GSI3 KEYS_ONLY → pk/sk取得 → GetItem）
  async getByTaskId(taskId: string): Promise<Task | null> {
    const gsi3Result = await this.client.send(new QueryCommand({
      TableName: this.table,
      IndexName: GSI.TASK_ID,
      KeyConditionExpression: 'task_id = :taskId',
      ExpressionAttributeValues: { ':taskId': taskId },
      Limit: 1,
    }));
    const keys = gsi3Result.Items?.[0];
    if (!keys) return null;

    const result = await this.client.send(new GetCommand({
      TableName: this.table,
      Key: { pk: keys.pk, sk: keys.sk },
    }));
    if (!result.Item) return null;
    return fromTaskItem(result.Item);
  }

  // Manager/Admin: 全タスク一覧（GSI1 更新日降順）
  async listAll(limit = 500): Promise<Task[]> {
    const result = await this.client.send(new QueryCommand({
      TableName: this.table,
      IndexName: GSI.ENTITY_UPDATED,
      KeyConditionExpression: 'gsi1pk = :gsi1pk',
      ExpressionAttributeValues: { ':gsi1pk': gsi1pk.task },
      ScanIndexForward: false,
      Limit: limit,
    }));
    return (result.Items ?? []).map(fromTaskItem);
  }

  // AP-05: 案件に紐づくタスク一覧
  async listByProject(projectId: string): Promise<Task[]> {
    const result = await this.client.send(new QueryCommand({
      TableName: this.table,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: {
        ':pk': pk.project(projectId),
        ':prefix': SK_PREFIX.TASK,
      },
    }));
    return (result.Items ?? []).map(fromTaskItem);
  }

  // AP-07: 担当者のタスク一覧（GSI2）
  async listByAssignee(userId: string): Promise<Task[]> {
    const result = await this.client.send(new QueryCommand({
      TableName: this.table,
      IndexName: GSI.USER_ENTITY,
      KeyConditionExpression: 'gsi2pk = :gsi2pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: {
        ':gsi2pk': gsi2pk.user(userId),
        ':prefix': SK_PREFIX.TASK,
      },
    }));
    return (result.Items ?? []).map(fromTaskItem);
  }

  // AP-08: 期限切れタスク検出（GSI4 due_epoch 範囲クエリ）
  async listOverdue(assigneeId: string, nowEpoch: number): Promise<Task[]> {
    const input: QueryCommandInput = {
      TableName: this.table,
      IndexName: GSI.DUE_DATE,
      KeyConditionExpression: 'assignee_id = :aid AND due_epoch < :now',
      FilterExpression: 'is_deleted = :false AND #status <> :done',
      ExpressionAttributeValues: {
        ':aid': assigneeId,
        ':now': nowEpoch,
        ':false': false,
        ':done': 'done',
      },
      ExpressionAttributeNames: { '#status': 'status' },
    };
    const result = await this.client.send(new QueryCommand(input));
    return (result.Items ?? []).map(fromTaskItem);
  }

  async update(projectId: string, taskId: string, attrs: Partial<Task>): Promise<void> {
    const entries = Object.entries(attrs).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;

    const sets = entries.map(([, ], i) => `#attr${i} = :val${i}`);
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    entries.forEach(([k, v], i) => {
      names[`#attr${i}`] = k;
      values[`:val${i}`] = v;
    });

    await this.client.send(new UpdateCommand({
      TableName: this.table,
      Key: { pk: pk.project(projectId), sk: sk.task(taskId) },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }));
  }

  // 案件削除時: 配下タスクを一括論理削除
  async logicalDeleteByProject(projectId: string, now: string, ttl: number): Promise<void> {
    const tasks = await this.listByProject(projectId);
    await Promise.all(
      tasks
        .filter((t) => !t.is_deleted)
        .map((t) =>
          this.update(projectId, t.task_id, {
            is_deleted: true,
            ttl,
            updated_at: now,
          }),
        ),
    );
  }

  // AP-09: タスクのコメント一覧（AWS推奨隣接リストパターン）
  async putComment(comment: Comment): Promise<void> {
    const item: CommentItem = {
      ...comment,
      pk: pk.project(comment.project_id),
      sk: sk.comment(comment.task_id, comment.created_at, comment.comment_id),
    };
    await this.client.send(new PutCommand({ TableName: this.table, Item: item }));
  }

  async listComments(projectId: string, taskId: string): Promise<Comment[]> {
    const result = await this.client.send(new QueryCommand({
      TableName: this.table,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: {
        ':pk': pk.project(projectId),
        ':prefix': `${SK_PREFIX.COMMENT}${taskId}#`,
      },
    }));
    return (result.Items ?? []).map((i) => {
      const { pk: _pk, sk: _sk, ...rest } = i;
      void _pk; void _sk;
      return rest as Comment;
    });
  }
}
