import { createPortal } from 'react-dom';
import Barcode from './Barcode';

export function StatCard({ label, value, sub, tone = 'default', onClick }) {
  const tones = {
    default: 'text-primary',
    warn: 'text-amber-600',
    danger: 'text-red-600',
    good: 'text-emerald-600',
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`card !p-4 text-left w-full ${onClick ? 'hover:shadow-card-hover transition-shadow' : ''}`}
    >
      <p className="label !mb-0.5">{label}</p>
      <p className={`text-2xl font-bold leading-tight ${tones[tone]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </Tag>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="card text-center py-12">
      <p className="font-semibold text-primary">{title}</p>
      {children && <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadError({ message, onRetry, what = 'this page' }) {
  return (
    <div className="card border-l-4 border-red-400">
      <p className="font-bold text-primary">Could not load {what}</p>
      <p className="text-sm text-gray-600 mt-1">{message}</p>
      {onRetry && (
        <button className="btn-primary mt-4" onClick={onRetry}>Try again</button>
      )}
    </div>
  );
}

export function Field({ label, children, hint, className = '' }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

export function Pill({ children, tone = 'gray' }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-600',
    teal: 'bg-primary-50 text-primary-700',
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
    violet: 'bg-violet-100 text-violet-700',
  };
  return <span className={`badge ${tones[tone]}`}>{children}</span>;
}

/**
 * Stacked stock bar: new vs opened grams already on the shelf, what the queue
 * has spoken for, and the reorder threshold drawn as a marker.
 */
export function StockBar({ newAmount = 0, openedAmount = 0, orderedAmount = 0, committed = 0, reorderAt = 0, unit = 'g' }) {
  const onHand = newAmount + openedAmount;
  const scale = Math.max(onHand + orderedAmount, reorderAt, committed, 1);
  const pct = (n) => `${Math.max(0, Math.min(100, (n / scale) * 100))}%`;

  return (
    <div className="space-y-1">
      <div className="relative h-5 rounded-md bg-linen overflow-hidden flex">
        <div className="bg-primary-500 h-full" style={{ width: pct(newAmount) }} title={`New: ${newAmount} ${unit}`} />
        <div className="bg-accent h-full" style={{ width: pct(openedAmount) }} title={`Opened: ${openedAmount} ${unit}`} />
        <div
          className="h-full border-y border-r border-dashed border-primary/50 bg-primary/10"
          style={{ width: pct(orderedAmount) }}
          title={`On order: ${orderedAmount} ${unit}`}
        />
        {reorderAt > 0 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-red-500"
            style={{ left: pct(reorderAt) }}
            title={`Reorder at ${reorderAt} ${unit}`}
          >
            <span className="absolute -top-0.5 -left-[3px] w-[7px] h-[7px] rounded-full bg-red-500" />
          </div>
        )}
      </div>
      {committed > 0 && (
        <div className="relative h-1.5 rounded bg-linen overflow-hidden">
          <div className="h-full bg-amber-400" style={{ width: pct(committed) }} title={`Queue needs ${committed} ${unit}`} />
        </div>
      )}
    </div>
  );
}

export function StockLegend() {
  const entries = [
    ['bg-primary-500', 'New'],
    ['bg-accent', 'Opened'],
    ['bg-primary/10 border border-dashed border-primary/50', 'On order'],
    ['bg-amber-400', 'Needed by queue'],
    ['bg-red-500', 'Reorder point'],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
      {entries.map(([cls, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={`inline-block w-3 h-2 rounded-sm ${cls}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

/** Printable label sheet for a SKU — one tap to send to a label printer. */
export function LabelModal({ open, onClose, title, subtitle, code, meta }) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:p-0 print:static">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm print:hidden" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md print:max-w-none print:shadow-none print:rounded-none">
        <div className="flex items-center justify-between px-5 py-4 border-b border-linen print:hidden">
          <h2 className="text-lg font-bold text-primary">Label</h2>
          <button onClick={onClose} className="text-silver hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div id="print-label" className="p-6 text-center">
          <p className="font-bold text-gray-900 leading-tight">{title}</p>
          {subtitle && <p className="text-xs text-gray-500 mb-3">{subtitle}</p>}
          <Barcode value={code} height={56} moduleWidth={2} />
          {meta && <p className="text-[11px] text-gray-500 mt-2">{meta}</p>}
        </div>

        <div className="px-5 pb-5 flex gap-2 justify-end print:hidden">
          <button onClick={onClose} className="btn-secondary">Close</button>
          <button onClick={() => window.print()} className="btn-primary">Print</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
