import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { CardSkeleton } from '../../components/common/LoadingSkeleton';
import ClientGoalCard from '../../components/common/ClientGoalCard';
import MRRGoalCard from '../../components/common/MRRGoalCard';

function StatCard({ label, value, sub, sub2, to, icon }) {
  const content = (
    <div className="card hover:shadow-card-hover transition-shadow h-full min-h-[120px] border-t-4 border-primary">
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className="text-xl">{icon}</span>}
        <p className="text-sm text-black font-medium">{label}</p>
      </div>
      <p className="text-5xl font-bold text-primary text-center mt-1">{value ?? '—'}</p>
      {sub && <p className="text-xs text-black text-center mt-2 italic">{sub}</p>}
      {sub2 && <p className="text-xs text-red-400 mt-1 italic">{sub2}</p>}
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clientGoal, setClientGoal] = useState(10);
  const [mrrGoal, setMrrGoal] = useState(5000);
  const [now, setNow] = useState(new Date());
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/reports/dashboard')
      .then(r => setData(r.data.data))
      .finally(() => setLoading(false));

    api.get('/settings/goals')
      .then(r => {
        setClientGoal(r.data.active_clients_goal);
        setMrrGoal(r.data.mrr_goal);
      });

    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="p-8 min-h-screen bg-linen">

      {/* Header */}
      <div className="mb-8">
        <p className="text-silver text-sm uppercase tracking-widest mb-1">Welcome back</p>
        <h1 className="text-4xl font-bold text-primary">{greeting}, Hiedi 👋</h1>
        <p className="text-black text-md mt-0.5">
          {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          {' · '}
          {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Create Invoice', icon: '🧾', to: '/admin/invoices/new' },
          { label: 'Add Client',     icon: '👤', to: '/admin/clients/new' },
          { label: 'New Task',       icon: '✅', to: '/admin/tasks' },
          { label: 'Log Time',       icon: '⏱', to: '/admin/time' },
        ].map(({ label, icon, to }) => (
          <button key={to} onClick={() => navigate(to)}
            className="bg-white border border-greige hover:border-primary hover:bg-teal-50 rounded-xl text-center text-primary font-semibold text-sm py-4 transition-all cursor-pointer shadow-sm hover:shadow-md">
            <div className="text-2xl mb-1">{icon}</div>
            {label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {loading ? (
          [1,2,3,4,5].map(i => <CardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              icon="💰"
              label="Monthly Recurring Revenue"
              value={fmt(data?.monthlyRecurringRevenue || 0)}
              sub="across all clients" />
            <StatCard
              icon="👥"
              label="Active Clients"
              value={data?.activeClients - 1}
              to="/admin/clients" />
            <StatCard
              icon="📄"
              label="Due This Month"
              value={data?.outstandingBalance ? fmt(data.outstandingBalance) : '—'}
              sub={data?.invoicesDueThisMonth ? `${data.invoicesDueThisMonth} invoices due` : undefined}
              sub2={data?.invoicesOverdue ? `${data.invoicesOverdue} invoices overdue` : undefined}
              to="/admin/invoices" />
            <StatCard
              icon="📅"
              label="Year-to-Date Income"
              value={fmt(data?.yearToDateIncome || 0)}
              sub="from all clients" />
            <StatCard
              icon="📈"
              label="Projected Annual Income"
              value={fmt(data?.projectedAnnualIncome || 0)}
              sub="based on current packages" />
          </>
        )}
      </div>

      {/* Goals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <ClientGoalCard
          current={(data?.activeClients ?? 1) - 1}
          goal={clientGoal}
          onGoalUpdate={setClientGoal}
        />
        <MRRGoalCard
          current={data?.monthlyRecurringRevenue || 0}
          goal={mrrGoal}
          onGoalUpdate={setMrrGoal}
        />
      </div>

      {/* Tasks Overview */}
      <Link to="/admin/tasks" className="block hover:shadow-md transition">
        <div className="card">
          <h2 className="text-2xl font-bold text-white mb-6 rounded-lg p-3 bg-gradient-to-r from-primary to-accent">
            Tasks Overview
          </h2>

          {/* Overdue */}
          <div className="bg-red-50 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-red-500 mb-2">⚠️ Overdue</h3>
            {loading ? (
              <div className="space-y-3">
                {[1,2].map(i => <div key={i} className="h-10 animate-pulse bg-linen rounded" />)}
              </div>
            ) : !data?.overdueTasks?.length ? (
              <p className="text-silver text-sm">No overdue tasks. You're all caught up! 🎉</p>
            ) : (
              <div className="divide-y divide-linen">
                {data?.overdueTasks?.map((task, i) => (
                  <div key={i} className="py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
                      <p className="text-xs text-silver">{task.client_name} · Due {new Date(task.due_date).toLocaleDateString()}</p>
                    </div>
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-red-100 text-red-600">{task.priority}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Due Today */}
          <div className="bg-teal-50 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-primary mb-2">📋 Due Today</h3>
            {loading ? (
              <div className="space-y-3">
                {[1,2].map(i => <div key={i} className="h-10 animate-pulse bg-linen rounded" />)}
              </div>
            ) : !data?.tasksDueToday?.length ? (
              <p className="text-silver text-sm">Nothing due today. Enjoy it! ☀️</p>
            ) : (
              <div className="divide-y divide-linen">
                {data?.tasksDueToday?.map((task, i) => (
                  <div key={i} className="py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
                      <p className="text-xs text-silver">{task.client_name} · Due {new Date(task.due_date).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      task.priority === 'high'   ? 'bg-red-100 text-red-600' :
                      task.priority === 'medium' ? 'bg-yellow-100 text-yellow-600' :
                      'bg-gray-100 text-gray-500'
                    }`}>{task.priority}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming High Priority */}
          <div className="bg-orange-50 rounded-lg p-4">
            <h3 className="font-semibold text-orange-500 mb-2">🔥 Upcoming High Priority</h3>
            {loading ? (
              <div className="space-y-3">
                {[1,2].map(i => <div key={i} className="h-10 animate-pulse bg-linen rounded" />)}
              </div>
            ) : !data?.upcomingHighPriority?.length ? (
              <p className="text-silver text-sm">No upcoming high priority tasks. 🙌</p>
            ) : (
              <div className="divide-y divide-linen">
                {data?.upcomingHighPriority?.map((task, i) => (
                  <div key={i} className="py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
                      <p className="text-xs text-silver">{task.client_name} · Due {new Date(task.due_date).toLocaleDateString()}</p>
                    </div>
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-red-100 text-red-600">high</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </Link>

    </div>
  );
}