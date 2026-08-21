import { useCallback, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ScanProvider, useScanner } from '../print/ScanContext';

const NAV = [
  { to: '/print', label: 'Dashboard', icon: '▦', end: true },
  { to: '/print/orders', label: 'Orders', icon: '🧾' },
  { to: '/print/catalog', label: 'Catalog', icon: '📦' },
  { to: '/print/filament', label: 'Filament', icon: '🧵' },
  { to: '/print/materials', label: 'Materials', icon: '🔩' },
  { to: '/print/queue', label: 'Queue', icon: '🖨' },
  { to: '/print/settings', label: 'Settings', icon: '⚙' },
];

function ScanButton({ className = '' }) {
  const { scan } = useScanner();
  return (
    <button onClick={() => scan()} className={`btn-primary flex items-center gap-2 ${className}`}>
      <span aria-hidden>⌗</span> Scan
    </button>
  );
}

function Shell({ refreshKey, refresh }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="lg:flex min-h-screen bg-linen">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col bg-primary w-56 shrink-0 sticky top-0 h-screen">
        <div className="px-4 py-5 border-b border-white/10">
          <p className="text-white font-bold text-sm leading-tight">Print Shop</p>
          <p className="text-white/60 text-xs">Inventory &amp; production</p>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, label, icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <span className="text-base shrink-0">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-3 py-4 space-y-1">
          <NavLink to="/admin" className="sidebar-link">
            <span aria-hidden>↗</span><span>HM Virtual</span>
          </NavLink>
          <button onClick={handleLogout} className="sidebar-link w-full justify-start">
            <span aria-hidden>↩</span><span>Logout</span>
          </button>
        </div>
        <p className="px-4 pb-4 text-white/40 text-[11px] truncate">{user?.email}</p>
      </aside>

      {/* iPad / phone header + tab strip */}
      <div className="lg:hidden sticky top-0 z-30 bg-primary">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-white font-bold text-sm leading-tight">Print Shop</p>
            <p className="text-white/60 text-[11px]">Inventory &amp; production</p>
          </div>
          <div className="flex items-center gap-2">
            <ScanButton className="!bg-white !text-primary !py-2" />
            <NavLink to="/admin" className="text-white/70 text-xs px-2 py-2">HM ↗</NavLink>
          </div>
        </div>
        <nav className="flex gap-1 px-2 pb-2 overflow-x-auto">
          {NAV.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-white text-primary' : 'text-white/80 hover:bg-white/10'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      <main className="flex-1 min-w-0">
        {/* Desktop scan bar */}
        <div className="hidden lg:flex justify-end px-6 pt-6">
          <ScanButton />
        </div>
        <div className="p-4 lg:px-6 lg:pt-4 lg:pb-10">
          <Outlet context={{ refreshKey, refresh }} />
        </div>
      </main>
    </div>
  );
}

export default function PrintLayout() {
  // Scanning from anywhere in the shop should refresh whatever page is open.
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  return (
    <ScanProvider onStockChange={refresh}>
      <Shell refreshKey={refreshKey} refresh={refresh} />
    </ScanProvider>
  );
}
