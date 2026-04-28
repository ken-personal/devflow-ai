import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout      from './components/Layout';
import Login       from './pages/Login';
import Callback    from './pages/Callback';
import Dashboard   from './pages/Dashboard';
import Projects    from './pages/Projects';
import Tasks       from './pages/Tasks';
import Chat        from './pages/Chat';
import Reports     from './pages/Reports';
import Members     from './pages/Members';
import Settings    from './pages/Settings';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex h-screen items-center justify-center text-gray-400">読み込み中...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireRole({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { fetchMe } = useAuth();

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  return (
    <Routes>
      {/* 公開ルート */}
      <Route path="/login"    element={<Login />} />
      <Route path="/callback" element={<Callback />} />

      {/* 認証必須ルート */}
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index                element={<Dashboard />} />
        <Route path="projects"      element={<Projects />} />
        <Route path="tasks"         element={<Tasks />} />
        <Route path="chat"          element={<Chat />} />
        <Route path="reports"       element={<RequireRole roles={['admin','manager']}><Reports /></RequireRole>} />
        <Route path="members"       element={<RequireRole roles={['admin']}><Members /></RequireRole>} />
        <Route path="settings"      element={<RequireRole roles={['admin']}><Settings /></RequireRole>} />
      </Route>
    </Routes>
  );
}
