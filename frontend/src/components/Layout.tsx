import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const NAV_ITEMS = [
  { to: '/',        label: 'ダッシュボード', roles: ['admin','manager','member'] },
  { to: '/projects',label: '案件',          roles: ['admin','manager','member'] },
  { to: '/tasks',   label: 'タスク',        roles: ['admin','manager','member'] },
  { to: '/chat',    label: 'AIチャット',    roles: ['admin','manager','member'] },
  { to: '/reports', label: 'レポート',      roles: ['admin','manager'] },
  { to: '/members',  label: 'メンバー管理',  roles: ['admin'] },
  { to: '/settings', label: 'システム設定',  roles: ['admin'] },
];

export default function Layout() {
  const { user, logout } = useAuth();

  const visibleItems = NAV_ITEMS.filter(item => user && item.roles.includes(user.role));

  return (
    <div className="flex h-screen bg-gray-50">
      {/* サイドバー */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <span className="text-lg font-bold text-blue-600">DevFlow AI</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {visibleItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        {/* ユーザー情報 */}
        <div className="p-3 border-t border-gray-200">
          <div className="text-xs text-gray-500 mb-1 truncate">{user?.name}</div>
          <div className="text-xs text-gray-400 mb-2">{user?.role}</div>
          <button
            onClick={() => { void logout(); }}
            className="w-full text-xs text-gray-500 hover:text-red-500 text-left"
          >
            ログアウト
          </button>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
