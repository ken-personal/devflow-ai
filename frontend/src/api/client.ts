// BSD-001 9.1: Axios interceptor で401を検知 → リフレッシュトークンで自動再取得
import axios, { type AxiosError } from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export const apiClient = axios.create({
  baseURL:         `${BASE_URL}/api/v1`,
  withCredentials: true,   // HttpOnly Cookie（refresh_token）を自動送信
  headers: { 'Content-Type': 'application/json' },
});

// アクセストークンをメモリに保持（localStorage 禁止: BSD-001 9.1）
let _accessToken: string | null = null;

export const setAccessToken = (token: string | null) => { _accessToken = token; };
export const getAccessToken = () => _accessToken;

// リクエスト: Authorization ヘッダーを自動付与
apiClient.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers['Authorization'] = `Bearer ${_accessToken}`;
  }
  return config;
});

export default apiClient;

// レスポンス: 401 → リフレッシュトークンで自動再取得 → 失敗時はログイン画面へ
let _refreshing = false;
let _waitQueue: Array<(token: string | null) => void> = [];

apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config!;

    if (error.response?.status !== 401 || (original as { _retry?: boolean })._retry) {
      return Promise.reject(error);
    }

    (original as { _retry?: boolean })._retry = true;

    if (_refreshing) {
      // 他のリクエストがリフレッシュ中の場合はキューで待機
      return new Promise((resolve, reject) => {
        _waitQueue.push((token) => {
          if (token) {
            original.headers!['Authorization'] = `Bearer ${token}`;
            resolve(apiClient(original));
          } else {
            reject(error);
          }
        });
      });
    }

    _refreshing = true;
    try {
      const res = await axios.post<{ access_token: string }>(
        `${BASE_URL}/api/v1/auth/refresh`,
        {},
        { withCredentials: true },
      );
      const newToken = res.data.access_token;
      setAccessToken(newToken);
      _waitQueue.forEach((cb) => cb(newToken));
      _waitQueue = [];
      original.headers!['Authorization'] = `Bearer ${newToken}`;
      return apiClient(original);
    } catch {
      setAccessToken(null);
      _waitQueue.forEach((cb) => cb(null));
      _waitQueue = [];
      window.location.href = '/login';
      return Promise.reject(error);
    } finally {
      _refreshing = false;
    }
  },
);
