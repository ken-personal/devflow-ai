// SCR-008: メンバー管理（Admin のみ）
import React, { useEffect, useState } from 'react';
import { usersApi, type Member, type CreateMemberInput } from '../api/users';
import { useAuth } from '../contexts/AuthContext';

const ROLE_LABELS: Record<Member['role'], string> = {
  admin: '管理者', manager: 'マネージャー', member: 'メンバー',
};

const ROLE_COLORS: Record<Member['role'], string> = {
  admin:   'bg-red-100 text-red-700',
  manager: 'bg-yellow-100 text-yellow-700',
  member:  'bg-gray-100 text-gray-600',
};

interface CreateForm {
  email: string;
  name: string;
  role: Member['role'];
}

const defaultCreateForm: CreateForm = { email: '', name: '', role: 'member' };

export default function Members() {
  const { user: currentUser } = useAuth();
  const [members, setMembers]       = useState<Member[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(defaultCreateForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await usersApi.list();
      setMembers(list);
    } catch {
      setError('メンバーの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const input: CreateMemberInput = {
        email: createForm.email,
        name: createForm.name,
        role: createForm.role,
      };
      await usersApi.create(input);
      setSuccess(`${createForm.email} を招待しました。一時パスワードがメールで送信されます。`);
      setCreateForm(defaultCreateForm);
      setShowCreate(false);
      void load();
    } catch {
      setError('メンバーの作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(member: Member) {
    if (member.user_id === currentUser?.user_id) {
      setError('自分自身を無効化することはできません');
      return;
    }
    try {
      if (member.is_active) {
        await usersApi.disable(member.user_id);
      } else {
        await usersApi.enable(member.user_id);
      }
      void load();
    } catch {
      setError('ステータスの変更に失敗しました');
    }
  }

  async function handleRoleChange(member: Member, role: Member['role']) {
    if (member.user_id === currentUser?.user_id) {
      setError('自分自身のロールは変更できません');
      return;
    }
    try {
      await usersApi.update(member.user_id, { role });
      void load();
    } catch {
      setError('ロールの変更に失敗しました');
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">メンバー管理</h1>
        <button
          onClick={() => { setShowCreate(true); setError(null); setSuccess(null); }}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          + メンバー招待
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg">{success}</div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-12">読み込み中...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-5 py-3">名前</th>
                <th className="px-5 py-3">メールアドレス</th>
                <th className="px-5 py-3">ロール</th>
                <th className="px-5 py-3">ステータス</th>
                <th className="px-5 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {members.map(m => (
                <tr key={m.user_id} className={`hover:bg-gray-50 ${!m.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3 font-medium text-gray-800">
                    {m.name}
                    {m.user_id === currentUser?.user_id && (
                      <span className="ml-2 text-xs text-blue-500 font-normal">（あなた）</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500">{m.email}</td>
                  <td className="px-5 py-3">
                    {m.user_id === currentUser?.user_id ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[m.role]}`}>
                        {ROLE_LABELS[m.role]}
                      </span>
                    ) : (
                      <select
                        value={m.role}
                        onChange={e => { void handleRoleChange(m, e.target.value as Member['role']); }}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {(Object.keys(ROLE_LABELS) as Member['role'][]).map(r => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {m.is_active ? '有効' : '無効'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {m.user_id !== currentUser?.user_id && (
                      <button
                        onClick={() => { void handleToggleActive(m); }}
                        className={`text-xs hover:underline ${m.is_active ? 'text-red-500' : 'text-green-600'}`}
                      >
                        {m.is_active ? '無効化' : '有効化'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 招待モーダル */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">メンバー招待</h2>
              <button
                onClick={() => setShowCreate(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                &times;
              </button>
            </div>
            <form onSubmit={(e) => { void handleCreate(e); }} className="px-6 py-4 space-y-4">
              {error && <p className="text-sm text-red-500">{error}</p>}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">メールアドレス *</label>
                <input
                  required
                  type="email"
                  value={createForm.email}
                  onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="user@example.com"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">名前 *</label>
                <input
                  required
                  value={createForm.name}
                  onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="山田 太郎"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">ロール</label>
                <select
                  value={createForm.role}
                  onChange={e => setCreateForm(f => ({ ...f, role: e.target.value as Member['role'] }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {(Object.keys(ROLE_LABELS) as Member['role'][]).map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>

              <p className="text-xs text-gray-400">
                招待後、ユーザーには一時パスワードがメールで送信されます。
                ログイン後にパスワードの変更が必要です。
              </p>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? '招待中...' : '招待する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
