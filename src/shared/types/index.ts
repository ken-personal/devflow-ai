// DET-001 / DB-001 に基づく共有型定義
// Zodスキーマから推論するため、ここではDynamoDB内部型のみ定義する

// ─── ロール ───────────────────────────────────────────────
export type UserRole = 'admin' | 'manager' | 'member';

// ─── ユーザー ──────────────────────────────────────────────
export interface User {
  user_id: string;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  mfa_enabled: boolean;
  created_at: string; // ISO8601
  updated_at: string; // ISO8601
  last_login_at?: string; // ISO8601
}

// ─── 案件 ─────────────────────────────────────────────────
export type ProjectStatus = 'planning' | 'active' | 'review' | 'hold' | 'delayed';

export interface Project {
  project_id: string;
  name: string;
  client_name: string;
  status: ProjectStatus;
  progress: number; // 0-100
  budget?: number;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  owner_id: string;
  description?: string;
  is_deleted: boolean;
  ttl?: number; // epoch秒
  created_at: string;
  updated_at: string;
}

// 担当者アサイン
export interface ProjectAssignee {
  project_id: string;
  user_id: string;
  assigned_at: string;
}

// ─── タスク ────────────────────────────────────────────────
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'high' | 'medium' | 'low';

export interface Task {
  task_id: string;
  project_id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string;
  due_date: string;    // YYYY-MM-DD（表示用）
  due_epoch: number;   // Unix epoch秒（GSI4 範囲クエリ用）
  description?: string;
  is_deleted: boolean;
  ttl?: number;
  created_at: string;
  updated_at: string;
}

// ─── コメント ──────────────────────────────────────────────
export interface Comment {
  comment_id: string;
  task_id: string;
  project_id: string;
  body: string;
  author_id: string;
  created_at: string;
}

// ─── ファイル ──────────────────────────────────────────────
export type FileTargetType = 'project' | 'task';

export interface FileMetadata {
  file_id: string;
  target_id: string;
  target_type: FileTargetType;
  file_name: string;
  s3_key: string;
  size: number;
  content_type: string;
  uploaded_by: string;
  created_at: string;
}

// ─── AIチャット ────────────────────────────────────────────
export interface ChatSession {
  session_id: string;
  user_id: string;
  title: string;
  ttl: number; // epoch秒（90日後）
  created_at: string;
  updated_at: string;
}

export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  message_id: string;
  session_id: string;
  role: MessageRole;
  content: string; // 最大4096文字
  ttl: number;
  created_at: string;
}

// ─── レポート ──────────────────────────────────────────────
export type ReportType = 'project' | 'workload' | 'risk';

export interface Report {
  report_id: string;
  title: string;
  type: ReportType;
  content: string; // Markdown 最大40000文字
  project_id?: string;
  generated_by: string;
  created_at: string;
}

// ─── JWT Claims（API Gateway REST API JWT Authorizer） ────
export interface JwtClaims {
  sub: string;              // user_id (Cognito sub)
  email: string;
  'custom:role': string;
  'custom:name': string;
  exp: number;
}

// ─── Hono context 型拡張 ──────────────────────────────────
declare module 'hono' {
  interface ContextVariableMap {
    userId: string;
    userEmail: string;
    userRole: UserRole;
    userName: string;
  }
}

// ─── ページネーション ──────────────────────────────────────
export interface PaginatedResponse<T> {
  total: number;
  limit: number;
  offset: number;
  items: T[];
}
