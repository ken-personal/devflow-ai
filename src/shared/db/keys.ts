// DB-001: Single Table Design キー定義
// PKプレフィックスとSKプレフィックスをここで一元管理する

// ─── PKビルダー ───────────────────────────────────────────
export const pk = {
  user:    (userId: string)    => `USER#${userId}`,
  project: (projectId: string) => `PROJECT#${projectId}`,
  session: (sessionId: string) => `SESSION#${sessionId}`,
  report:  (reportId: string)  => `REPORT#${reportId}`,
  task:    (taskId: string)    => `TASK#${taskId}`, // Fileをタスク直下に置く場合
} as const;

// ─── SKビルダー ───────────────────────────────────────────
export const sk = {
  user:     (userId: string)    => `USER#${userId}`,
  project:  (projectId: string) => `PROJECT#${projectId}`,
  assignee: (userId: string)    => `ASSIGNEE#${userId}`,
  task:     (taskId: string)    => `TASK#${taskId}`,
  // AP-09: begins_with('COMMENT#{task_id}') でタスク別コメントを絞り込む
  comment:  (taskId: string, timestamp: string, commentId: string) =>
    `COMMENT#${taskId}#${timestamp}#${commentId}`,
  file:     (fileId: string)    => `FILE#${fileId}`,
  session:  (sessionId: string) => `SESSION#${sessionId}`,
  // AP-11: timestamp順ソート済み
  message:  (timestamp: string, messageId: string) => `MSG#${timestamp}#${messageId}`,
  report:   (reportId: string)  => `REPORT#${reportId}`,
} as const;

// ─── GSI1 PKビルダー（エンティティ種別固定値） ─────────────
export const gsi1pk = {
  user:    'USER',
  project: 'PROJECT',
  task:    'TASK',
  session: 'SESSION',
  report:  'REPORT',
} as const;

// ─── GSI2 PKビルダー（ユーザー別クエリ） ──────────────────
export const gsi2pk = {
  user:      (userId: string)    => `USER#${userId}`,
  assignee:  (userId: string)    => `USER#${userId}`, // ProjectAssignee
  session:   (userId: string)    => `USER#${userId}`, // ChatSession
  report:    (userId: string)    => `USER#${userId}`, // Report（generated_by）
} as const;

// ─── SKプレフィックス（begins_with 用） ───────────────────
export const SK_PREFIX = {
  USER:     'USER#',
  PROJECT:  'PROJECT#',
  ASSIGNEE: 'ASSIGNEE#',
  TASK:     'TASK#',
  COMMENT:  'COMMENT#',
  FILE:     'FILE#',
  SESSION:  'SESSION#',
  MSG:      'MSG#',
  REPORT:   'REPORT#',
} as const;

// ─── 固定PK（設定など単一レコード） ──────────────────────
export const FIXED_PK = {
  SETTINGS: 'SETTINGS',
} as const;

export const FIXED_SK = {
  BEDROCK: 'BEDROCK',
} as const;

// ─── GSI名 ────────────────────────────────────────────────
export const GSI = {
  ENTITY_UPDATED: 'entity_type-updated_at-index', // GSI1
  USER_ENTITY:    'user-entity-index',             // GSI2
  TASK_ID:        'task-id-index',                 // GSI3 (KEYS_ONLY)
  DUE_DATE:       'due-date-index',                // GSI4
} as const;
