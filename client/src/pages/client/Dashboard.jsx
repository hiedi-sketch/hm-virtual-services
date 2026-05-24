import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import Badge from '../../components/common/Badge';
import { CardSkeleton } from '../../components/common/LoadingSkeleton';

const TIER_LABELS = { essentials: 'Essentials', growth: 'Growth', scale: 'Scale', full_service: 'Full Service' };
const TIER_PRICES = { essentials: 250, growth: 350, scale: 500, full_service: 800 };

export default function ClientDashboard() {
  const { clientData } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/invoices'),
      api.get('/tasks'),
      api.get('/messages/unread-count'),
    ]).then(([inv, t, u]) => {
      setInvoices(inv.data.data);
      setTasks(t.data.data);
      setUnread(u.data.data.count);
    }).finally(() => setLoading(false));
  }, []);

  const nextInvoice = invoices.filter(i => ['sent', 'overdue'].includes(i.status)).sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary">
          Welcome back{clientData ? `, ${clientData.business_name}` : ''}!
        </h1>
        <p className="text-silver text-sm mt-0.5">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {loading ? [1,2,3].map(i => <CardSkeleton key={i} />) : (
          <>
            <div className="card">
              <p className="label">Current Package</p>
              {clientData ? (
                <>
                  <p className="text-xl font-bold text-primary mt-1">{TIER_LABELS[clientData.package_tier]}</p>
                  <p className="text-sm text-silver mt-0.5">${TIER_PRICES[clientData.package_tier]}/month</p>
                </>
              ) : <p className="text-silver text-sm">—</p>}
            </div>
            <div className="card">
              <p className="label">Next Invoice</p>
              {nextInvoice ? (
                <Link to={`/client/invoices/${nextInvoice.id}`} className="block mt-1">
                  <p className="text-xl font-bold text-primary">${Number(nextInvoice.total).toFixed(2)}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge status={nextInvoice.status} />
                    {nextInvoice.due_date && <p className="text-sm text-silver">Due {nextInvoice.due_date}</p>}
                  </div>
                </Link>
              ) : <p className="text-silver text-sm mt-1">No outstanding invoices</p>}
            </div>
            <Link to="/client/messages" className="card hover:shadow-card-hover transition-shadow">
              <p className="label">Messages</p>
              <p className="text-xl font-bold text-primary mt-1">{unread}</p>
              <p className="text-sm text-silver mt-0.5">{unread === 1 ? '1 unread message' : `${unread} unread messages`}</p>
            </Link>
          </>
        )}
      </div>

      {/* Task updates visible to client */}
      {tasks.length > 0 && (
        <div className="card">
          <h2 className="font-bold text-primary mb-4">Project Updates</h2>
          <div className="space-y-3">
            {tasks.map(t => (
              <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg bg-linen/50">
                <Badge status={t.status} />
                <div className="flex-1">
                  <p className="text-sm font-medium">{t.title}</p>
                  {t.due_date && <p className="text-xs text-silver">Due {t.due_date}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
