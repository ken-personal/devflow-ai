// SCR-002: ダッシュボード
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { tasksApi, type Task } from '../api/tasks';
import { projectsApi, type Project } from '../api/projects';

interface Stats {
  activeProjects: number;
  myTasks: number;
  overdueTasks: number;
  completedToday: number;
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function statusLabel(s: Task['status']): string {
  const map: Record<Task['status'], string> = {
    todo: 'TODO', in_progress: '進行中', review: 'レビュー', done: '完了',
  };
  return map[s];
}

function statusColor(s: Task['status']): string {
  const map: Record<Task['status'], string> = {
    todo: 'bg-gray-100 text-gray-600',
    in_progress: 'bg-blue-100 text-blue-700',
    review: 'bg-yellow-100 text-yellow-700',
    done: 'bg-green-100 text-green-700',
  };
  return map[s];
}

function priorityColor(p: Task['priority']): string {
  const map: Record<Task['priority'], string> = {
    low: 'text-gray-400', medium: 'text-blue-500', high: 'text-orange-500',
  };
  return map[p];
}

export default function Dashboard() {
  const { user } = useAuth();
  const [myTasks, setMyTasks]       = useState<Task[]>([]);
  const [projects, setProjects]     = useState<Project[]>([]);
  const [stats, setStats]           = useState<Stats>({ activeProjects: 0, myTasks: 0, overdueTasks: 0, completedToday: 0 });
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [tasksRes, projRes, overdueRes] = await Promise.all([
          tasksApi.list({ assignee_id: 'me', limit: 8 }),
          projectsApi.list({ status: 'active', limit: 5 }),
          tasksApi.list({ assignee_id: 'me', overdue: true, limit: 1 }),
        ]);

        setMyTasks(tasksRes.items);
        setProjects(projRes.items);

        const today = new Date().toISOString().slice(0, 10);
        const completedToday = tasksRes.items.filter(
          t => t.status === 'done' && t.updated_at.startsWith(today),
        ).length;

        setStats({
          activeProjects: projRes.count,
          myTasks: tasksRes.count,
          overdueTasks: overdueRes.count,
          completedToday,
        });
      } catch {
        // ignore — show empty state
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">読み込み中...</div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">ダッシュボード</h1>
        <p className="text-sm text-gray-500 mt-0.5">おかえりなさい、{user?.name ?? 'ユーザー'}さん</p>
      </div>

      {/* 統計カード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="進行中案件"     value={stats.activeProjects} color="text-blue-600" />
        <StatCard label="自分のタスク"   value={stats.myTasks}        color="text-gray-900" />
        <StatCard label="期限超過"       value={stats.overdueTasks}   color="text-red-500" />
        <StatCard label="今日の完了"     value={stats.completedToday} color="text-green-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 自分のタスク */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">自分のタスク</h2>
            <Link to="/tasks?assignee=me" className="text-xs text-blue-600 hover:underline">
              すべて見る
            </Link>
          </div>
          {myTasks.length === 0 ? (
            <p className="text-sm text-gray-400 p-5">タスクはありません</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {myTasks.map(task => (
                <li key={task.task_id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50">
                  <span className={`text-base ${priorityColor(task.priority)}`}>●</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
                    <p className="text-xs text-gray-400">{task.due_date} 締切</p>
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(task.status)}`}>
                    {statusLabel(task.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 進行中案件 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">進行中案件</h2>
            <Link to="/projects" className="text-xs text-blue-600 hover:underline">
              すべて見る
            </Link>
          </div>
          {projects.length === 0 ? (
            <p className="text-sm text-gray-400 p-5">案件はありません</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {projects.map(p => (
                <li key={p.project_id} className="px-5 py-3 hover:bg-gray-50">
                  <Link to={`/projects/${p.project_id}`}>
                    <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.end_date} 完了予定</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
