import React, { useEffect, useState } from 'react';
import { toast, ToastItem } from '../utils/toast';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsubscribe = toast.subscribe(setToasts);
    return () => unsubscribe();
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[99999] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((t) => {
        let icon = <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />;
        let borderClass = 'border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95';

        if (t.type === 'error') {
          icon = <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />;
          borderClass = 'border-rose-200 dark:border-rose-900/40 bg-white/95 dark:bg-slate-900/95';
        } else if (t.type === 'warning') {
          icon = <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />;
          borderClass = 'border-amber-200 dark:border-amber-900/40 bg-white/95 dark:bg-slate-900/95';
        } else if (t.type === 'info') {
          icon = <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />;
          borderClass = 'border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95';
        }

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2.5 p-3 rounded-lg border shadow-lg text-xs backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-150 text-slate-800 dark:text-slate-100 ${borderClass}`}
          >
            {icon}
            <div className="flex-1 font-medium leading-relaxed">{t.message}</div>
            <button
              onClick={() => toast.dismiss(t.id)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ToastContainer;
