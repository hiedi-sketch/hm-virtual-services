const VARIANTS = {
  // Invoice status
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
  // Task status
  todo: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-yellow-100 text-yellow-700',
  in_review: 'bg-purple-100 text-purple-700',
  done: 'bg-green-100 text-green-700',
  // Priority
  high: 'bg-red-100 text-red-600',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-500',
  // Client status
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
  // BK Package
  no_bk: 'bg-gray-100 text-gray-400',
  essentials: 'bg-primary-50 text-primary-600',
  growth: 'bg-accent/10 text-primary',
  scale: 'bg-primary/10 text-primary-700',
  full_service: 'bg-primary-900/10 text-primary-900',
  // VA Package
  time_saver: 'bg-blue-50 text-blue-700',
  time_multiplier: 'bg-violet-50 text-violet-700',
  time_freedom: 'bg-emerald-50 text-emerald-700',
  agency: 'bg-orange-50 text-orange-700',
};

const LABELS = {
  in_progress: 'In Progress',
  in_review: 'In Review',
  full_service: 'Full Service',
  no_bk: 'No BK Package',
  time_saver: 'Time Saver',
  time_multiplier: 'Time Multiplier',
  time_freedom: 'Time Freedom',
  agency: 'Agency',
};

export default function Badge({ status, className = '' }) {
  const variant = VARIANTS[status] || 'bg-gray-100 text-gray-600';
  const label = LABELS[status] || status?.charAt(0).toUpperCase() + status?.slice(1) || '';
  return (
    <span className={`badge ${variant} ${className}`}>
      {label}
    </span>
  );
}
