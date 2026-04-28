// SCR-003/004: 案件一覧 & 案件詳細（モーダル）
import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { projectsApi, type Project, type CreateProjectInput, type UpdateProjectInput } from '../api/projects';

const STATUS_LABELS: Record<Project['status'], string> = {
  planning:  '計画中',
  active:    '進行中',
  on_hold:   '保留',
  completed: '完了',
  cancelled: 'キャンセル',
};

const STATUS_COLORS: Record<Project['status'], string> = {
  planning:  'bg-gray-100 text-gray-600',
  active:    'bg-blue-100 text-blue-700',
  on_hold:   'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-500',
};

type ModalMode = 'create' | 'edit' | null;

interface ProjectFormState {
  name: string;
  description: string;
  status: Project['status'];
  start_date: string;
  end_date: string;
  budget: string;
}

const defaultForm: ProjectFormState = {
  name: '', description: '', status: 'planning',
  start_date: '', end_date: '', budget: '',
};

function projectToForm(p: Project): ProjectFormState {
  return {
    name: p.name,
    description: p.description,
    status: p.status,
    start_date: p.start_date,
    end_date: p.end_date,
    budget: String(p.budget),
  };
}

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects]         = useState<Project[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filterStatus, setFilterStatus] = useState<Project['status'] | ''>('');
  const [modalMode, setModalMode]       = useState<ModalMode>(null);
  const [editing, setEditing]           = useState<Project | null>(null);
  const [form, setForm]                 = useState<ProjectFormState>(defaultForm);
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await projectsApi.list(filterStatus ? { status: filterStatus } : undefined);
      setProjects(res.items);
    } catch {
      setError('案件の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { void load(); }, [load]);

  function openCreate() {
    setForm(defaultForm);
    setEditing(null);
    setModalMode('create');
    setError(null);
  }

  function openEdit(p: Project) {
    setForm(projectToForm(p));
    setEditing(p);
    setModalMode('edit');
    setError(null);
  }

  function closeModal() { setModalMode(null); setEditing(null); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const budget = Number(form.budget);
      if (isNaN(budget)) { setError('予算は数値で入力してください'); return; }

      if (modalMode === 'create') {
        const input: CreateProjectInput = {
          name: form.name,
          description: form.description,
          start_date: form.start_date,
          end_date: form.end_date,
          budget,
        };
        await projectsApi.create(input);
      } else if (editing) {
        const input: UpdateProjectInput = {
          name: form.name,
          description: form.description,
          status: form.status,
          start_date: form.start_date,
          end_date: form.end_date,
          budget,
        };
        await projectsApi.update(editing.project_id, input);
      }
      closeModal();
      void load();
    } catch {
      setError('保存に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(projectId: string) {
    if (!confirm('この案件を削除しますか？関連タスクも削除されます。')) return;
    try {
      await projectsApi.delete(projectId);
      void load();
    } catch {
      setError('削除に失敗しました');
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">案件</h1>
        {isAdminOrManager && (
          <button
            onClick={openCreate}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + 案件作成
          </button>
        )}
      </div>

      {/* フィルター */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilterStatus('')}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filterStatus === '' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
        >
          すべて
        </button>
        {(Object.keys(STATUS_LABELS) as Project['status'][]).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filterStatus === s ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {/* テーブル */}
      {loading ? (
        <div className="text-center text-gray-400 py-12">読み込み中...</div>
      ) : projects.length === 0 ? (
        <div className="text-center text-gray-400 py-12">案件がありません</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-5 py-3">案件名</th>
                <th className="px-5 py-3">ステータス</th>
                <th className="px-5 py-3">開始日</th>
                <th className="px-5 py-3">完了予定日</th>
                <th className="px-5 py-3">予算</th>
                {isAdminOrManager && <th className="px-5 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {projects.map(p => (
                <tr key={p.project_id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{p.name}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{p.start_date}</td>
                  <td className="px-5 py-3 text-gray-500">{p.end_date}</td>
                  <td className="px-5 py-3 text-gray-500">¥{p.budget.toLocaleString()}</td>
                  {isAdminOrManager && (
                    <td className="px-5 py-3">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => openEdit(p)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          編集
                        </button>
                        {user?.role === 'admin' && (
                          <button
                            onClick={() => { void handleDelete(p.project_id); }}
                            className="text-xs text-red-500 hover:underline"
                          >
                            削除
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* モーダル */}
      {modalMode && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">
                {modalMode === 'create' ? '案件作成' : '案件編集'}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={(e) => { void handleSubmit(e); }} className="px-6 py-4 space-y-4">
              {error && <p className="text-sm text-red-500">{error}</p>}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">案件名 *</label>
                <input
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
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

              {modalMode === 'edit' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">ステータス</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as Project['status'] }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {(Object.keys(STATUS_LABELS) as Project['status'][]).map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">開始日 *</label>
                  <input
                    required
                    type="date"
                    value={form.start_date}
                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">完了予定日 *</label>
                  <input
                    required
                    type="date"
                    value={form.end_date}
                    onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">予算（円）</label>
                <input
                  type="number"
                  min="0"
                  value={form.budget}
                  onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
