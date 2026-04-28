// SCR: システム設定（Admin のみ）— Bedrock モデル設定
import React, { useEffect, useState } from 'react';
import { settingsApi, type BedrockSettings, type UpdateBedrockSettingsInput, ALLOWED_MODELS } from '../api/settings';

export default function Settings() {
  const [settings, setSettings]   = useState<BedrockSettings | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [success, setSuccess]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const [modelId, setModelId]         = useState('');
  const [temperature, setTemperature] = useState(0.1);
  const [maxTokens, setMaxTokens]     = useState(2048);

  useEffect(() => {
    void (async () => {
      try {
        const s = await settingsApi.getBedrock();
        setSettings(s);
        setModelId(s.model_id);
        setTemperature(s.temperature);
        setMaxTokens(s.max_tokens);
      } catch {
        setError('設定の読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const input: UpdateBedrockSettingsInput = { model_id: modelId, temperature, max_tokens: maxTokens };
      const updated = await settingsApi.updateBedrock(input);
      setSettings(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('設定の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-gray-400">読み込み中...</div>;
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">システム設定</h1>

      {/* Bedrock 設定 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-800 mb-1">AI モデル設定</h2>
        <p className="text-xs text-gray-400 mb-5">
          AIチャット・レポート生成に使用する Amazon Bedrock モデルを設定します。
          変更は最大1分以内に反映されます。
        </p>

        {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}
        {success && <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg mb-4">設定を保存しました</div>}

        <form onSubmit={(e) => { void handleSave(e); }} className="space-y-5">
          {/* モデル選択 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">モデル</label>
            <select
              value={modelId}
              onChange={e => setModelId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ALLOWED_MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">現在: {settings?.model_id}</p>
          </div>

          {/* Temperature */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Temperature: <span className="font-mono font-bold">{temperature.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={temperature}
              onChange={e => setTemperature(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>0.0（精確・決定的）</span>
              <span>1.0（創造的・多様）</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">業務データ分析は 0.1 推奨</p>
          </div>

          {/* Max Tokens */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">最大トークン数</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={100}
                max={4096}
                step={256}
                value={maxTokens}
                onChange={e => setMaxTokens(Number(e.target.value))}
                className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-400">100 〜 4096</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            {settings?.updated_at && (
              <p className="text-xs text-gray-400">
                最終更新: {new Date(settings.updated_at).toLocaleString('ja-JP')}
                {settings.updated_by && ` by ${settings.updated_by}`}
              </p>
            )}
            <button
              type="submit"
              disabled={saving}
              className="ml-auto px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? '保存中...' : '設定を保存'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
