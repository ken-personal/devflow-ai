// SCR-006: AIチャット（SSEストリーミング + react-markdown）
import React, { useEffect, useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { aiApi, type ChatSession, type ChatMessage, type SSEEvent } from '../api/ai';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

function AgentStepBadge({ step, tool }: { step: number; tool?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-400 my-1">
      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">
        {step}
      </span>
      <span>{tool ? `ツール実行: ${tool}` : '思考中...'}</span>
    </div>
  );
}

export default function Chat() {
  const [sessions, setSessions]         = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages]         = useState<DisplayMessage[]>([]);
  const [agentSteps, setAgentSteps]     = useState<Array<{ step: number; tool?: string }>>([]);
  const [input, setInput]               = useState('');
  const [sending, setSending]           = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const bottomRef      = useRef<HTMLDivElement>(null);
  const abortRef       = useRef<(() => void) | null>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  // セッション一覧取得
  useEffect(() => {
    void (async () => {
      try {
        const s = await aiApi.listSessions();
        setSessions(s);
      } catch { /* ignore */ } finally {
        setLoadingSessions(false);
      }
    })();
  }, []);

  // セッション切り替え時にメッセージ取得
  const loadMessages = useCallback(async (sessionId: string) => {
    setLoadingMessages(true);
    setMessages([]);
    setAgentSteps([]);
    try {
      const msgs = await aiApi.listMessages(sessionId);
      setMessages(msgs.map((m: ChatMessage) => ({
        id: m.message_id,
        role: m.role,
        content: m.content,
      })));
    } catch { /* ignore */ } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (activeSessionId) void loadMessages(activeSessionId);
  }, [activeSessionId, loadMessages]);

  // 送信後は自動スクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, agentSteps]);

  function newSession() {
    if (abortRef.current) { abortRef.current(); abortRef.current = null; }
    setActiveSessionId(null);
    setMessages([]);
    setAgentSteps([]);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const msg = input.trim();
    if (!msg || sending) return;

    setInput('');
    setSending(true);
    setAgentSteps([]);

    // ユーザーメッセージを即時表示
    const userMsgId = `user-${Date.now()}`;
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: msg }]);

    // アシスタント応答プレースホルダー
    const assistantMsgId = `assistant-${Date.now()}`;
    setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '', isStreaming: true }]);

    const abort = aiApi.streamChat(
      activeSessionId,
      msg,
      (event: SSEEvent) => {
        switch (event.type) {
          case 'agent_step':
            setAgentSteps(prev => [...prev, event.data]);
            break;
          case 'text_chunk':
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId
                ? { ...m, content: m.content + event.data.text }
                : m,
            ));
            break;
          case 'done':
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId ? { ...m, isStreaming: false } : m,
            ));
            setAgentSteps([]);
            setSending(false);
            break;
          case 'error':
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId
                ? { ...m, content: `⚠️ エラー: ${event.data.message}`, isStreaming: false }
                : m,
            ));
            setSending(false);
            break;
        }
      },
      (sid: string) => {
        setActiveSessionId(sid);
        setSessions(prev => {
          if (prev.find(s => s.session_id === sid)) return prev;
          return [{ session_id: sid, user_id: '', title: msg.slice(0, 30), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...prev];
        });
      },
    );
    abortRef.current = abort;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend(e as unknown as React.FormEvent);
    }
  }

  return (
    <div className="flex h-full">
      {/* サイドバー: セッション一覧 */}
      <aside className="w-56 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-3 border-b border-gray-100">
          <button
            onClick={newSession}
            className="w-full bg-blue-600 text-white text-xs px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + 新しいチャット
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingSessions && (
            <p className="text-xs text-gray-400 px-2 py-1">読み込み中...</p>
          )}
          {!loadingSessions && sessions.length === 0 && (
            <p className="text-xs text-gray-400 px-2 py-1">履歴はありません</p>
          )}
          {sessions.map(s => (
            <button
              key={s.session_id}
              onClick={() => setActiveSessionId(s.session_id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors truncate ${
                s.session_id === activeSessionId
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {s.title || '無題のチャット'}
            </button>
          ))}
        </div>
      </aside>

      {/* メインチャット */}
      <div className="flex-1 flex flex-col">
        {/* メッセージエリア */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loadingMessages && (
            <div className="text-center text-gray-400 py-12 text-sm">読み込み中...</div>
          )}
          {!activeSessionId && messages.length === 0 && !loadingMessages && (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="text-4xl mb-4">🤖</div>
              <p className="text-gray-700 font-medium">DevFlow AI アシスタント</p>
              <p className="text-sm text-gray-400 mt-2 max-w-xs">
                案件・タスクの状況確認、KPI分析、レポート生成などをお手伝いします。
              </p>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-800'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <>
                    {msg.isStreaming && msg.content === '' ? (
                      <span className="flex gap-1 items-center text-gray-400">
                        <span className="animate-bounce">●</span>
                        <span className="animate-bounce [animation-delay:0.15s]">●</span>
                        <span className="animate-bounce [animation-delay:0.3s]">●</span>
                      </span>
                    ) : (
                      <ReactMarkdown
                        className="prose prose-sm max-w-none prose-p:my-1 prose-pre:bg-gray-100 prose-pre:text-xs"
                      >
                        {msg.content}
                      </ReactMarkdown>
                    )}
                    {msg.isStreaming && msg.content !== '' && (
                      <span className="inline-block w-1 h-4 ml-0.5 bg-blue-500 animate-pulse align-text-bottom" />
                    )}
                  </>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {/* エージェントステップ表示 */}
          {agentSteps.length > 0 && (
            <div className="space-y-0.5 px-1">
              {agentSteps.map((step, i) => (
                <AgentStepBadge key={i} step={step.step} tool={step.tool} />
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* 入力エリア */}
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <form onSubmit={(e) => { void handleSend(e); }} className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="メッセージを入力（Shift+Enterで改行）"
              rows={1}
              className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-32 overflow-y-auto"
              style={{ minHeight: '42px' }}
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              className="shrink-0 bg-blue-600 text-white px-4 py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors text-sm font-medium"
            >
              {sending ? '送信中' : '送信'}
            </button>
          </form>
          <p className="text-xs text-gray-400 mt-1.5 text-center">
            AIは社内データのみ参照します。機密情報の入力には注意してください。
          </p>
        </div>
      </div>
    </div>
  );
}
