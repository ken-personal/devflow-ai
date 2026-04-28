// Cognito HostedUI からのコールバック処理
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Callback() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const called    = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const params = new URLSearchParams(window.location.search);
    const code   = params.get('code');
    const error  = params.get('error');

    if (error || !code) {
      navigate('/login', { replace: true });
      return;
    }

    const redirectUri = `${window.location.origin}/callback`;
    login(code, redirectUri)
      .then(() => navigate('/', { replace: true }))
      .catch(() => navigate('/login', { replace: true }));
  }, [login, navigate]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-gray-500">認証処理中...</div>
    </div>
  );
}
