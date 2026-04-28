// CLAUDE.md: RepositoryはDynamoDB操作のみ。ビジネスロジックを書かない
import {
  PutCommand, GetCommand, QueryCommand, UpdateCommand,
  type PutCommandInput, type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { getDynamoClient, getTableName } from '../client.js';
import { pk, sk, gsi1pk, gsi2pk, SK_PREFIX, GSI } from '../keys.js';
import type { Project, ProjectAssignee } from '../../types/index.js';

// ─── DynamoDBアイテム型 ────────────────────────────────────
interface ProjectItem extends Project {
  pk: string;
  sk: string;
  gsi1pk: string;
  gsi1sk: string; // updated_at
}

interface AssigneeItem extends ProjectAssignee {
  pk: string;
  sk: string;
  gsi1pk: string;
  gsi2pk: string;
}

// ─── 変換ヘルパー ──────────────────────────────────────────
function toItem(project: Project): ProjectItem {
  return {
    ...project,
    pk: pk.project(project.project_id),
    sk: sk.project(project.project_id),
    gsi1pk: gsi1pk.project,
    gsi1sk: project.updated_at,
  };
}

function fromItem(item: Record<string, unknown>): Project {
  const { pk: _pk, sk: _sk, gsi1pk: _g1pk, gsi1sk: _g1sk, ...rest } = item;
  void _pk; void _sk; void _g1pk; void _g1sk;
  return rest as unknown as Project;
}

// ─── Repository ───────────────────────────────────────────
export interface IProjectRepository {
  put(project: Project): Promise<void>;
  get(projectId: string): Promise<Project | null>;
  listAll(limit: number, lastKey?: Record<string, unknown>): Promise<{ items: Project[]; lastKey?: Record<string, unknown> }>;
  listByAssignee(userId: string): Promise<string[]>; // 担当プロジェクトのIDリスト
  update(projectId: string, attrs: Partial<Project>): Promise<void>;
  putAssignee(assignee: ProjectAssignee): Promise<void>;
  deleteAssignee(projectId: string, userId: string): Promise<void>;
  listAssignees(projectId: string): Promise<ProjectAssignee[]>;
}

export class ProjectRepository implements IProjectRepository {
  private readonly client = getDynamoClient();
  private readonly table = getTableName();

  async put(project: Project): Promise<void> {
    const input: PutCommandInput = {
      TableName: this.table,
      Item: toItem(project),
    };
    await this.client.send(new PutCommand(input));
  }

  async get(projectId: string): Promise<Project | null> {
    const result = await this.client.send(new GetCommand({
      TableName: this.table,
      Key: { pk: pk.project(projectId), sk: sk.project(projectId) },
    }));
    if (!result.Item) return null;
    return fromItem(result.Item);
  }

  // AP-02: 全案件一覧（Manager用）- GSI1クエリ updated_at 降順
  async listAll(
    limit: number,
    lastKey?: Record<string, unknown>,
  ): Promise<{ items: Project[]; lastKey?: Record<string, unknown> }> {
    const input: QueryCommandInput = {
      TableName: this.table,
      IndexName: GSI.ENTITY_UPDATED,
      KeyConditionExpression: 'gsi1pk = :gsi1pk',
      ExpressionAttributeValues: { ':gsi1pk': gsi1pk.project },
      ScanIndexForward: false, // 降順
      Limit: limit,
      ExclusiveStartKey: lastKey,
    };
    const result = await this.client.send(new QueryCommand(input));
    return {
      items: (result.Items ?? []).map((i) => fromItem(i)),
      lastKey: result.LastEvaluatedKey,
    };
  }

  // AP-03: 担当者の案件一覧（Member用）- GSI2 でアサインレコードを取得しIDを返す
  async listByAssignee(userId: string): Promise<string[]> {
    const result = await this.client.send(new QueryCommand({
      TableName: this.table,
      IndexName: GSI.USER_ENTITY,
      KeyConditionExpression: 'gsi2pk = :gsi2pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: {
        ':gsi2pk': gsi2pk.assignee(userId),
        ':prefix': SK_PREFIX.ASSIGNEE,
      },
    }));
    return (result.Items ?? []).map((i) => i.project_id as string);
  }

  async update(projectId: string, attrs: Partial<Project>): Promise<void> {
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
      Key: { pk: pk.project(projectId), sk: sk.project(projectId) },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }));
  }

  async putAssignee(assignee: ProjectAssignee): Promise<void> {
    const item: AssigneeItem = {
      ...assignee,
      pk: pk.project(assignee.project_id),
      sk: sk.assignee(assignee.user_id),
      gsi1pk: gsi1pk.project,
      gsi2pk: gsi2pk.assignee(assignee.user_id),
    };
    await this.client.send(new PutCommand({ TableName: this.table, Item: item }));
  }

  async deleteAssignee(projectId: string, userId: string): Promise<void> {
    // 論理削除なし: アサインは物理削除で管理
    const { DeleteCommand } = await import('@aws-sdk/lib-dynamodb');
    await this.client.send(new DeleteCommand({
      TableName: this.table,
      Key: { pk: pk.project(projectId), sk: sk.assignee(userId) },
    }));
  }

  // AP-05: 案件に紐づくアサイン一覧
  async listAssignees(projectId: string): Promise<ProjectAssignee[]> {
    const result = await this.client.send(new QueryCommand({
      TableName: this.table,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: {
        ':pk': pk.project(projectId),
        ':prefix': SK_PREFIX.ASSIGNEE,
      },
    }));
    return (result.Items ?? []).map((i) => ({
      project_id: i.project_id as string,
      user_id: i.user_id as string,
      assigned_at: i.assigned_at as string,
    }));
  }
}
