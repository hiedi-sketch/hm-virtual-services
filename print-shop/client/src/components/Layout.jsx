import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ScanProvider, useScanner } from './ScanContext';
import PrintingPanel from './PrintingPanel';
import BinsPanel from './BinsPanel';
import printApi from '../api/print';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '▦', end: true },
  { to: '/orders', label: 'Orders', icon: '🧾' },
  { to: '/catalog', label: 'Catalog', icon: '📦' },
  { to: '/filament', label: 'Filament', icon: '🧵' },
  { to: '/materials', label: 'Materials', icon: '🔩' },
  { to: '/in-queue', label: 'In Queue', icon: '☰' },
  { to: '/queue', label: 'Print jobs', icon: '🖨' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

function ScanButton({ className = '' }) {
  const { scan } = useScanner();
  return (
    <button onClick={() => scan()} className={`btn-primary flex items-center gap-2 ${className}`}>
      <span aria-hidden>⌗</span> Scan
    </button>
  );
}

/**
 * The three questions a print shop asks all day, in the chrome of every page:
 * what is on the printer, what is on the bench waiting to be finished, and
 * what is still to be printed. Each carries its own number, so the answer is
 * there without opening anything.
 */
function ProductionButtons({ refreshKey, onChanged, dark = false }) {
  const navigate = useNavigate();
  const [board, setBoard] = useState(null);
  const [panel, setPanel] = useState(null);
  const [binsOpen, setBinsOpen] = useState(false);

  const load = useCallback(() => {
    printApi.productionBoard().then(setBoard).catch(() => setBoard(null));
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const base = dark
    ? 'bg-white/10 text-white hover:bg-white/20'
    : 'bg-white text-primary border border-greige hover:bg-linen';
  const chip = (tone) => `ml-1.5 px-1.5 py-0.5 rounded text-[11px] font-bold ${tone}`;
  const names = (part, fallback) => (part?.now?.length
    ? part.now.map((j) => `${j.quantity}× ${j.item_name}`).join(', ')
    : fallback);

  const printing = board?.printing;
  const bench = board?.bench;
  const queue = board?.queue;
  const binsInUse = board?.bins;

  return (
    <>
      <button
        onClick={() => setPanel('printing')}
        className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${base}`}
        title={names(printing, 'Nothing is printing')}
      >
        <span aria-hidden>🖨</span>
        <span>Printing</span>
        {printing && !printing.idle && (
          <span className={chip(dark ? 'bg-amber-300 text-amber-900' : 'bg-amber-100 text-amber-800')}>
            {printing.units}
          </span>
        )}
      </button>

      {/* Off the plate, being finished by hand. A different job in a different
          place, so it gets its own button rather than sharing the printer's. */}
      <button
        onClick={() => setPanel('bench')}
        className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${base}`}
        title={names(bench, 'Nothing is waiting to be finished')}
      >
        <span aria-hidden>🛠</span>
        <span>On the Bench</span>
        {bench && !bench.idle && (
          <span className={chip(dark ? 'bg-violet-300 text-violet-900' : 'bg-violet-100 text-violet-800')}>
            {bench.units}
          </span>
        )}
      </button>

      <button
        onClick={() => navigate('/in-queue')}
        className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${base}`}
        title={queue ? `${queue.products} product(s) still to print` : 'What still has to be printed'}
      >
        <span aria-hidden>☰</span>
        <span>In Queue</span>
        {queue?.units > 0 && (
          <span className={chip(dark ? 'bg-white text-primary' : 'bg-primary text-white')}>{queue.units}</span>
        )}
      </button>

      {/* Where the orders themselves are sitting while they are being made. */}
      <button
        onClick={() => setBinsOpen(true)}
        className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${base}`}
        title={binsInUse
          ? `${binsInUse.used} of ${binsInUse.total} bins in use`
            + (binsInUse.mail ? `, ${binsInUse.mail} waiting for the post` : '')
          : 'Which order is in which basket'}
      >
        <span aria-hidden>🧺</span>
        <span>Bins</span>
        {binsInUse?.used > 0 && (
          <span className={chip(dark ? 'bg-teal-300 text-teal-900' : 'bg-teal-100 text-teal-800')}>
            {binsInUse.used}/{binsInUse.total}
          </span>
        )}
        {/* Parcels standing by the door are worth their own count: they are
            done, and only waiting on someone else. */}
        {binsInUse?.mail > 0 && (
          <span className={chip(dark ? 'bg-amber-300 text-amber-900' : 'bg-amber-100 text-amber-800')}>
            ✉ {binsInUse.mail}
          </span>
        )}
      </button>

      <BinsPanel
        open={binsOpen}
        onClose={() => setBinsOpen(false)}
        onChanged={() => { load(); onChanged?.(); }}
      />

      <PrintingPanel
        open={!!panel}
        mode={panel || 'printing'}
        onClose={() => setPanel(null)}
        onChanged={() => { load(); onChanged?.(); }}
      />
    </>
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
      {/*
        On a home-screen install the page runs under the status bar. Painting
        that strip the same teal as the rest of the chrome keeps iOS's white
        clock and battery readable over it. It collapses to nothing in a
        browser tab and on every other platform.
      */}
      <div
        className="fixed top-0 inset-x-0 z-40 bg-primary pointer-events-none"
        style={{ height: 'var(--safe-top)' }}
        aria-hidden="true"
      />

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col bg-primary w-56 shrink-0 sticky top-0 h-screen pad-safe-top">
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
          <button onClick={handleLogout} className="sidebar-link w-full justify-start">
            <span aria-hidden>↩</span><span>Logout</span>
          </button>
        </div>
        <p className="px-4 pb-4 text-white/40 text-[11px] truncate">{user?.email}</p>
      </aside>

      {/* iPad / phone header + tab strip */}
      <div className="lg:hidden sticky top-0 z-30 bg-primary pad-safe-top">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-white font-bold text-sm leading-tight">Print Shop</p>
            <p className="text-white/60 text-[11px]">Inventory &amp; production</p>
          </div>
          <ScanButton className="!bg-white !text-primary !py-2" />
        </div>
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          <ProductionButtons refreshKey={refreshKey} onChanged={refresh} dark />
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

      <main className="flex-1 min-w-0 lg-pad-safe-top pad-safe-bottom">
        {/* Desktop production bar */}
        <div className="hidden lg:flex justify-end items-center gap-2 px-6 pt-6">
          <ProductionButtons refreshKey={refreshKey} onChanged={refresh} />
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
