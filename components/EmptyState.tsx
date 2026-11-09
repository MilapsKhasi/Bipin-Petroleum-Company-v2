
import React from 'react';
import { Plus, FolderSearch, LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: LucideIcon;
}

const EmptyState: React.FC<EmptyStateProps> = ({ 
  title = "No Data Found", 
  message = "Start creating by clicking the button below!", 
  actionLabel, 
  onAction,
  icon: Icon = FolderSearch
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-in fade-in duration-200">
      <div className="relative mb-6">
        {/* Soft radial glow */}
        <div className="absolute inset-0 bg-primary/10 dark:bg-primary/20 rounded-full blur-2xl transform scale-125" />
        
        {/* Refined contextual emblem */}
        <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-850 border border-slate-200/80 dark:border-slate-700/80 shadow-sm flex items-center justify-center">
          <Icon className="w-9 h-9 text-slate-400 dark:text-slate-500" strokeWidth={1.5} />
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary/10 dark:bg-primary/30 border border-primary/20 flex items-center justify-center text-primary">
            <Plus className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
      
      <h3 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1.5 capitalize tracking-tight">
        {title}
      </h3>
      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-6 font-normal leading-relaxed">
        {message}
      </p>
      
      {onAction && actionLabel && (
        <button 
          type="button"
          onClick={onAction}
          className="px-4 py-2 bg-primary text-white font-medium text-xs rounded capitalize hover:bg-primary-dark active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm transition-all duration-150 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span>{actionLabel}</span>
        </button>
      )}
    </div>
  );
};

export default EmptyState;
