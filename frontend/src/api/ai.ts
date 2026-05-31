import apiClient, { getAccessToken } from './client';

export interface ChatSession {
  session_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  message_id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export type SSEEvent =
  | { type: 'agent_step'; data: { step: number; tool?: string } }
  | { type: 'text_chunk'; data: { text: string } }
  | { type: 'done'; data: { session_id: string; message_id: string; total_tokens: number } }
  | { type: 'error'; data: { message: string; code?: string } };

export const aiApi = {
  listSessions(): Promise<ChatSession[]> {
    return apiClient.get('/ai/sessions').then(r => r.data);
  },

  listMessages(sessionId: string): Promise<ChatMessage[]> {
    return apiClient.get(`/ai/sessions/${sessionId}/messages`).then(r => r.data);
  },

  /**
   * Sends a message and streams SSE events back.
   * Returns a cleanup function to abort the stream.
   */
  streamChat(
    sessionId: string | null,
    message: string,
    onEvent: (event: SSEEvent) => void,
    onSessionId: (sid: string) => void,
  ): () => void {
    const controller = new AbortController();
    const token = getAccessToken();
    const apiUrl = import.meta.env.VITE_API_URL as string ?? '';

    void (async () => {
      try {
        const res = await fetch(`${apiUrl}/api/v1/ai/chat`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ session_id: sessionId, message }),
        });

        if (!res.ok || !res.body) {
          onEvent({ type: 'error', data: { message: 'ストリーム接続に失敗しました' } });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          const lines = buf.split('\n');
          buf = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const raw = line.slice(6).trim();
              if (!raw) continue;
              try {
                const evt = JSON.parse(raw) as SSEEvent;
                if (evt.type === 'done' && evt.data.session_id) {
                  onSessionId(evt.data.session_id);
                }
                onEvent(evt);
              } catch {
                // ignore malformed SSE lines
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          onEvent({ type: 'error', data: { message: '通信エラーが発生しました' } });
        }
      }
    })();

    return () => controller.abort();
  },
};
