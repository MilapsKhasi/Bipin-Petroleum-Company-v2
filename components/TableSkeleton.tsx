import React from 'react';

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 5,
  columns = 7,
  className = ""
}) => {
  return (
    <div className={`w-full overflow-hidden border border-slate-200/80 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 shadow-xs ${className}`}>
      {/* Skeleton Header */}
      <div className="flex items-center gap-4 px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={`th-${i}`}
            className="h-3.5 bg-slate-200 dark:bg-slate-700/60 rounded animate-pulse"
            style={{ width: `${Math.max(12, 100 / columns - 2)}%` }}
          />
        ))}
      </div>

      {/* Skeleton Rows */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={`row-${r}`} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: columns }).map((_, c) => {
              // Vary widths slightly to look like authentic data
              const widthVariation = c === 0 ? 'w-8' : c === 1 ? 'w-24' : c === columns - 1 ? 'w-16' : 'flex-1';
              return (
                <div
                  key={`cell-${r}-${c}`}
                  className={`h-3 bg-slate-100 dark:bg-slate-800 rounded animate-pulse ${widthVariation}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TableSkeleton;
