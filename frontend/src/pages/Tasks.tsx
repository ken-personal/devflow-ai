// SCR-005: タスク一覧 & 作成/編集
import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { tasksApi, type Task, type CreateTaskInput, type UpdateTaskInput, type Comment } from '../api/tasks';
import { projectsApi, type Project } from '../api/projects';

const STATUS_LABELS: Record<Task['status'], string> = {
  todo: 'TODO', in_progress: '進行中', review: 'レビュー', done: '完了', cancelled: 'キャンセル',
};
const STATUS_COLORS: Record<Task['status'], string> = {
  todo: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  review: 'bg-yellow-100 text-yellow-700',
  done: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-500',
};
const PRIORITY_LABELS: Record<Task['priority'], string> = {
  low: '低', medium: '中', high: '高', critical: '緊急',
};
const PRIORITY_COLORS: Record<Task['priority'], string> = {
  low: 'text-gray-400', medium: 'text-blue-500', high: 'text-orange-500', critical: 'text-red-600',
};

type ModalMode = 'create' | 'detail' | null;

interface TaskFormState {
  project_id: string;
  title: string;
  description: string;
  priority: Task['priority'];
  assignee_id: string;
  due_date: string;
}

const defaultForm: TaskFormState = {
  project_id: '', title: '', description: '',
  priority: 'medium', assignee_id: '', due_date: '',
};

export default function Tasks() {
  const { user } = useAuth();
  const [tasks, setTasks]               = useState<Task[]>([]);
  const [projects, setProjects]         = useState<Project[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filterStatus, setFilterStatus] = useState<Task['status'] | ''>('');
  const [filterMine, setFilterMine]     = useState(false);
  const [modalMode, setModalMode]       = useState<ModalMode>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [form, setForm]                 = useState<TaskFormState>(defaultForm);
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [comments, setComments]         = useState<Comment[]>([]);
  const [commentBody, setCommentBody]   = useState('');
  const [editStatus, setEditStatus]     = useState<Task['status'] | null>(null);

  const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, projRes] = await Promise.all([
        tasksApi.list({
          ...(filterStatus ? { status: filterStatus } : {}),
          ...(filterMine ? { assignee_id: 'me' } : {}),
          limit: 50,
        }),
        projectsApi.list({ limit: 100 }),
      ]);
      setTasks(tasksRes.items);
      setProjects(projRes.items);
    } catch {
      setError('タスクの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterMine]);

  useEffect(() => { void load(); }, [load]);

  async function openDetail(task: Task) {
    setSelectedTask(task);
    setEditStatus(task.status);
    setComments([]);
    setModalMode('detail');
    try {
      const c = await tasksApi.listComments(task.task_id);
      setComments(c);
    } catch { /* ignore */ }
  }

  function openCreate() {
    setForm(defaultForm);
    setModalMode('create');
    setError(null);
  }

  function closeModal() { setModalMode(null); setSelectedTask(null); setCommentBody(''); }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const input: CreateTaskInput = {
        project_id: form.project_id,
        title: form.title,
        description: form.description,
        priority: form.priority,
        assignee_id: form.assignee_id,
        due_date: form.due_date,
      };
      await tasksApi.create(input);
      closeModal();
      void load();
    } catch {
      setError('タスクの作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange() {
    if (!selectedTask || !editStatus) return;
    const update: UpdateTaskInput = { status: editStatus };
    try {
      await tasksApi.update(selectedTask.task_id, update);
      void load();
      closeModal();
    } catch {
      setError('ステータスの更新に失敗しました');
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTask || !commentBody.trim()) return;
    try {
      const c = await tasksApi.addComment(selectedTask.task_id, commentBody);
      setComments(prev => [...prev, c]);
      setCommentBody('');
    } catch { /* ignore */ }
  }

  async function handleDelete(taskId: string) {
    if (!confirm('このタスクを削除しますか？')) return;
    try {
      await tasksApi.delete(taskId);
      void load();
    } catch { /* ignore */ }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">タスク</h1>
        {isAdminOrManager && (
          <button
            onClick={openCreate}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + タスク作成
          </button>
        )}
      </div>

      {/* フィルター */}
      <div className="flex gap-3 flex-wrap items-center">
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={filterMine}
            onChange={e => setFilterMine(e.target.checked)}
            className="rounded"
          />
          自分のタスクのみ
        </label>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterStatus('')}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filterStatus === '' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
          >
            すべて
          </button>
          {(Object.keys(STATUS_LABELS) as Task['status'][]).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filterStatus === s ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">{error}</div>}

      {/* タスクリスト */}
      {loading ? (
        <div className="text-center text-gray-400 py-12">読み込み中...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center text-gray-400 py-12">タスクがありません</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-5 py-3">優先度</th>
                <th className="px-5 py-3">タスク名</th>
                <th className="px-5 py-3">ステータス</th>
                <th className="px-5 py-3">期限</th>
                <th className="px-5 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tasks.map(task => (
                <tr key={task.task_id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <span className={`font-bold ${PRIORITY_COLORS[task.priority]}`}>
                      {PRIORITY_LABELS[task.priority]}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-medium text-gray-800">
                    <button
                      onClick={() => { void openDetail(task); }}
                      className="text-left hover:text-blue-600 hover:underline"
                    >
                      {task.title}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[task.status]}`}>
                      {STATUS_LABELS[task.status]}
                    </span>
                  </td>
                  <td className={`px-5 py-3 ${new Date(task.due_date) < new Date() && task.status !== 'done' ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
                    {task.due_date}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => { void openDetail(task); }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        詳細
                      </button>
                      {isAdminOrManager && (
                        <button
                          onClick={() => { void handleDelete(task.task_id); }}
                          className="text-xs text-red-500 hover:underline"
                        >
                          削除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 作成モーダル */}
      {modalMode === 'create' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">タスク作成</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <form onSubmit={(e) => { void handleCreate(e); }} className="px-6 py-4 space-y-4">
              {error && <p className="text-sm text-red-500">{error}</p>}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">案件 *</label>
                <select
                  required
                  value={form.project_id}
                  onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">選択してください</option>
                  {projects.map(p => (
                    <option key={p.project_id} value={p.project_id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">タスク名 *</label>
                <input
                  required
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">説明</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">優先度</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value as Task['priority'] }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {(Object.keys(PRIORITY_LABELS) as Task['priority'][]).map(p => (
                      <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">期限 *</label>
                  <input
                    required
                    type="date"
                    value={form.due_date}
                    onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">担当者ID *</label>
                <input
                  required
                  value={form.assignee_id}
                  onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))}
                  placeholder="user-xxxx"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  キャンセル
                </button>
                <button type="submit" disabled={submitting} className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {submitting ? '作成中...' : '作成'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 詳細モーダル */}
      {modalMode === 'detail' && selectedTask && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 truncate">{selectedTask.title}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl shrink-0 ml-2">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="flex gap-3 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[selectedTask.status]}`}>
                  {STATUS_LABELS[selectedTask.status]}
                </span>
                <span className={`text-xs font-semibold ${PRIORITY_COLORS[selectedTask.priority]}`}>
                  優先度: {PRIORITY_LABELS[selectedTask.priority]}
                </span>
                <span className="text-xs text-gray-500">期限: {selectedTask.due_date}</span>
              </div>

              {selectedTask.description && (
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedTask.description}</p>
              )}

              {/* ステータス変更 */}
              <div className="flex gap-2 items-center">
                <select
                  value={editStatus ?? selectedTask.status}
                  onChange={e => setEditStatus(e.target.value as Task['status'])}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {(Object.keys(STATUS_LABELS) as Task['status'][]).map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
                <button
                  onClick={() => { void handleStatusChange(); }}
                  className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  更新
                </button>
              </div>

              {/* コメント */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">コメント</h3>
                <div className="space-y-3 mb-3">
                  {comments.map(c => (
                    <div key={c.comment_id} className="bg-gray-50 rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-700">{c.user_name}</span>
                        <span className="text-xs text-gray-400">{new Date(c.created_at).toLocaleString('ja-JP')}</span>
                      </div>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">{c.body}</p>
                    </div>
                  ))}
                  {comments.length === 0 && (
                    <p className="text-xs text-gray-400">コメントはありません</p>
                  )}
                </div>
                <form onSubmit={(e) => { void handleAddComment(e); }} className="flex gap-2">
                  <input
                    value={commentBody}
                    onChange={e => setCommentBody(e.target.value)}
                    placeholder="コメントを入力..."
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={!commentBody.trim()}
                    className="text-sm px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
                  >
                    送信
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
