import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: '▦' },
  { to: '/admin/clients', label: 'Clients', icon: '👥' },
  { to: '/admin/time', label: 'Time Tracking', icon: '⏱' },
  { to: '/admin/tasks', label: 'Tasks', icon: '✓' },
  { to: '/admin/invoices', label: 'Invoices', icon: '📄' },
  { to: '/admin/documents', label: 'Documents', icon: '📁' },
  { to: '/admin/messages', label: 'Messages', icon: '✉' },
  { to: '/admin/reports', label: 'Reports', icon: '📊' },
  { to: '/admin/settings', label: 'Settings', icon: '⚙' },
];

export default function AdminSidebar({ collapsed, setCollapsed }) {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    toast.success('Logged out');
    navigate('/login');
  }

  return (
    <aside
      className={`flex flex-col bg-primary h-screen sticky top-0 transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'} shrink-0`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0">
          HM
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-white font-bold text-sm leading-tight">HM Virtual</p>
            <p className="text-white/60 text-xs">Services</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto text-white/60 hover:text-white transition-colors text-lg"
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/admin'}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
            title={collapsed ? label : undefined}
          >
            <span className="text-base shrink-0">{icon}</span>
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User + Logout */}
      <div className="border-t border-white/10 px-3 py-4">
        {!collapsed && (
          <p className="text-white/60 text-xs mb-2 truncate">{user?.email}</p>
        )}
        <button
          onClick={handleLogout}
          className="sidebar-link w-full justify-start"
          title={collapsed ? 'Logout' : undefined}
        >
          <span className="shrink-0">↩</span>
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
