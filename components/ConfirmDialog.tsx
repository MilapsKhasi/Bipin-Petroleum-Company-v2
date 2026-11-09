import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import Modal from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'danger'
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-sm">
      <div className="flex flex-col items-center text-center py-2">
        <div className={`p-4 rounded-full mb-4 ${variant === 'danger' ? 'bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-500 dark:text-amber-400'}`}>
          <AlertTriangle className="w-8 h-8" />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
          {message}
        </p>
        <div className="flex w-full space-x-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium text-xs rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex-1 px-4 py-2 text-white font-medium text-xs rounded transition-all cursor-pointer ${
              variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmDialog;