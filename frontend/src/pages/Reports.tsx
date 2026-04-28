// SCR-007: レポート一覧（Manager/Admin のみ）
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { reportsApi, type Report } from '../api/reports';

const TYPE_LABELS: Record<Report['report_type'], string> = {
  weekly: '週次',
  monthly: '月次',
  project: '案件別',
  custom: 'カスタム',
};

const TYPE_COLORS: Record<Report['report_type'], string> = {
  weekly:  'bg-blue-100 text-blue-700',
  monthly: 'bg-purple-100 text-purple-700',
  project: 'bg-green-100 text-green-700',
  custom:  'bg-gray-100 text-gray-600',
};

export default function Reports() {
  const [reports, setReports]       = useState<Report[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<Report | null>(null);
  const [filterType, setFilterType] = useState<Report['report_type'] | ''>('');
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      try {
        const res = await reportsApi.list(filterType ? { report_type: filterType } : undefined);
        setReports(res.items);
      } catch {
        setError('レポートの読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    })();
  }, [filterType]);

  return (
    <div className="flex h-full">
      {/* レポート一覧サイドバー */}
      <aside className="w-72 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 mb-3">レポート</h2>
          {/* タイプフィルター */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilterType('')}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterType === '' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}
            >
              すべて
            </button>
            {(Object.keys(TYPE_LABELS) as Report['report_type'][]).map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterType === t ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {loading && <p className="text-sm text-gray-400 p-4">読み込み中...</p>}
          {!loading && error && <p className="text-sm text-red-500 p-4">{error}</p>}
          {!loading && !error && reports.length === 0 && (
            <p className="text-sm text-gray-400 p-4">レポートがありません</p>
          )}
          {reports.map(r => (
            <button
              key={r.report_id}
              onClick={() => setSelected(r)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selected?.report_id === r.report_id ? 'bg-blue-50' : ''}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${TYPE_COLORS[r.report_type]}`}>
                  {TYPE_LABELS[r.report_type]}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-800 truncate">{r.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(r.created_at).toLocaleDateString('ja-JP')}
              </p>
            </button>
          ))}
        </div>
      </aside>

      {/* レポート本文 */}
      <main className="flex-1 overflow-y-auto p-6">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-4xl mb-4">📊</div>
            <p className="text-gray-500">レポートを選択してください</p>
            <p className="text-xs text-gray-400 mt-1">
              AIチャットで「週次レポートを生成して」と話しかけると新しいレポートが作成されます
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${TYPE_COLORS[selected.report_type]}`}>
                    {TYPE_LABELS[selected.report_type]}
                  </span>
                </div>
                <h1 className="text-xl font-bold text-gray-900">{selected.title}</h1>
                <p className="text-sm text-gray-400 mt-1">
                  作成日: {new Date(selected.created_at).toLocaleString('ja-JP')}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                閉じる
              </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <ReactMarkdown
                className="prose prose-sm max-w-none prose-headings:text-gray-800 prose-p:text-gray-600 prose-li:text-gray-600 prose-strong:text-gray-800 prose-table:text-sm"
              >
                {selected.content}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
