export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-greige rounded ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="card">
      <Skeleton className="h-4 w-1/3 mb-3" />
      <Skeleton className="h-8 w-1/2 mb-2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="p-8 space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <CardSkeleton key={i} />)}
      </div>
      <TableSkeleton />
    </div>
  );
}
