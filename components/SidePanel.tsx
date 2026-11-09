
import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

const SidePanel: React.FC<SidePanelProps> = ({ isOpen, onClose, title, children, width = 'max-w-xl' }) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150]">
      {/* 30% Opacity Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]" 
        onClick={onClose} 
      />
      <div className={`absolute top-0 right-0 h-full bg-white shadow-2xl flex flex-col ${width} w-full border-l border-slate-200`}>
        {/* Header - Compact */}
        <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white shrink-0">
          <h3 className="text-xs font-black uppercase tracking-widest">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Body - High Density */}
        <div className="flex-1 overflow-y-auto bg-[#fdfdfd]">
          {children}
        </div>
      </div>
    </div>
  );
};

export default SidePanel;
