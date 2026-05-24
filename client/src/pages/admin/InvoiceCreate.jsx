import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const PREPAY_DISCOUNTS = { 0: 0, 3: 5, 6: 10, 12: 20 };

export default function AdminInvoiceCreate() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [items, setItems] = useState([{ description: '', quantity: 1, unit_price: '' }]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [dueDate, setDueDate] = useState('');
  const [clientNotes, setClientNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [bpStart, setBpStart] = useState('');
  const [bpEnd, setBpEnd] = useState('');
  const [status, setStatus] = useState('draft');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/clients').then(r => setClients(r.data.data));
  }, []);

  async function onClientChange(clientId) {
    setSelectedClient(clientId);
    if (!clientId) { setItems([{ description: '', quantity: 1, unit_price: '' }]); setDiscountPercent(0); return; }

    const r = await api.post('/invoices/generate-defaults', { client_id: clientId });
    const { items: defaultItems, discount_percent } = r.data.data;
    setItems(defaultItems.map(i => ({ ...i, unit_price: String(i.unit_price) })));
    setDiscountPercent(discount_percent);
  }

  function setItem(i, field, val) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  }

  function addItem() {
    setItems(prev => [...prev, { description: '', quantity: 1, unit_price: '' }]);
  }

  function removeItem(i) {
    setItems(prev => prev.filter((_, idx) => idx !== i));
  }

  const subtotal = items.reduce((s, it) => s + (Number(it.quantity) * Number(it.unit_price) || 0), 0);
  const discountAmt = +(subtotal * (discountPercent / 100)).toFixed(2);
  const total = +(subtotal - discountAmt).toFixed(2);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedClient) { toast.error('Select a client'); return; }
    const validItems = items.filter(i => i.description && i.unit_price);
    if (!validItems.length) { toast.error('Add at least one line item'); return; }

    setLoading(true);
    try {
      const r = await api.post('/invoices', {
        client_id: selectedClient,
        items: validItems.map(i => ({ description: i.description, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
        discount_percent: Number(discountPercent),
        due_date: dueDate,
        client_notes: clientNotes,
        internal_notes: internalNotes,
        billing_period_start: bpStart,
        billing_period_end: bpEnd,
        status,
      });
      toast.success('Invoice created');
      navigate(`/admin/invoices/${r.data.data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create invoice');
    } finally {
      setLoading(false);
    }
  }

  const fmt = n => `$${Number(n).toFixed(2)}`;

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="text-silver hover:text-primary text-sm">← Back</button>
        <h1 className="text-2xl font-bold text-primary">Create Invoice</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Client selection */}
        <div className="card">
          <h2 className="font-bold text-gray-800 mb-4">Client</h2>
          <select className="input max-w-sm" value={selectedClient} onChange={e => onClientChange(e.target.value)} required>
            <option value="">Select a client…</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.business_name}</option>)}
          </select>
        </div>

        {/* Line items */}
        <div className="card">
          <h2 className="font-bold text-gray-800 mb-4">Line Items</h2>
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-silver uppercase tracking-wide pb-1 border-b border-linen">
              <div className="col-span-6">Description</div>
              <div className="col-span-2 text-right">Qty</div>
              <div className="col-span-2 text-right">Unit Price</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-1" />
            </div>
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-6">
                  <input className="input text-sm" placeholder="Service description" value={item.description} onChange={e => setItem(i, 'description', e.target.value)} />
                </div>
                <div className="col-span-2">
                  <input type="number" className="input text-sm text-right" min={0.01} step={0.01} value={item.quantity} onChange={e => setItem(i, 'quantity', e.target.value)} />
                </div>
                <div className="col-span-2">
                  <input type="number" className="input text-sm text-right" min={0} step={0.01} placeholder="0.00" value={item.unit_price} onChange={e => setItem(i, 'unit_price', e.target.value)} />
                </div>
                <div className="col-span-1 text-right text-sm font-semibold">{fmt(Number(item.quantity) * Number(item.unit_price) || 0)}</div>
                <div className="col-span-1 text-right">
                  <button type="button" onClick={() => removeItem(i)} className="text-red-300 hover:text-red-500 text-lg leading-none">×</button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addItem} className="text-sm text-primary hover:underline mt-2">+ Add line item</button>
          </div>

          {/* Totals */}
          <div className="mt-6 pt-4 border-t border-linen ml-auto max-w-xs space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-silver">Subtotal</span><span className="font-medium">{fmt(subtotal)}</span></div>
            <div className="flex justify-between items-center gap-4">
              <span className="text-silver">Prepay Discount</span>
              <div className="flex items-center gap-1">
                <select className="input w-28 text-xs" value={discountPercent} onChange={e => setDiscountPercent(Number(e.target.value))}>
                  <option value={0}>None</option>
                  <option value={5}>5% (3-mo)</option>
                  <option value={10}>10% (6-mo)</option>
                  <option value={20}>20% (Annual)</option>
                </select>
                <span className="text-red-500 font-medium">-{fmt(discountAmt)}</span>
              </div>
            </div>
            <div className="flex justify-between font-bold text-base border-t border-linen pt-2">
              <span>Total Due</span><span className="text-primary">{fmt(total)}</span>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="card">
          <h2 className="font-bold text-gray-800 mb-4">Invoice Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Due Date</label>
              <input type="date" className="input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="draft">Draft</option>
                <option value="sent">Sent (publish to client)</option>
              </select>
            </div>
            <div>
              <label className="label">Billing Period Start</label>
              <input type="date" className="input" value={bpStart} onChange={e => setBpStart(e.target.value)} />
            </div>
            <div>
              <label className="label">Billing Period End</label>
              <input type="date" className="input" value={bpEnd} onChange={e => setBpEnd(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Client-Facing Notes</label>
              <textarea className="input min-h-16" value={clientNotes} onChange={e => setClientNotes(e.target.value)} placeholder="Visible on the invoice sent to client" />
            </div>
            <div className="col-span-2">
              <label className="label">Internal Notes (admin only)</label>
              <textarea className="input min-h-16" value={internalNotes} onChange={e => setInternalNotes(e.target.value)} placeholder="Never shown to client" />
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Creating…' : 'Create Invoice'}</button>
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
