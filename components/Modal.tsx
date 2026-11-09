
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  preventBackdropClose?: boolean;
}

const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  maxWidth = 'max-w-5xl',
  preventBackdropClose = false
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const hasFocusedRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onCloseRef.current();
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
          e.preventDefault();
          e.stopPropagation();
          if (modalRef.current) {
            const form = modalRef.current.querySelector('form');
            if (form) {
              if (typeof form.requestSubmit === 'function') {
                form.requestSubmit();
              } else {
                const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
                if (submitBtn) submitBtn.click();
                else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
              }
            } else {
              const primaryBtn = modalRef.current.querySelector('button[type="submit"], button.bg-primary') as HTMLButtonElement | null;
              if (primaryBtn) primaryBtn.click();
            }
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);

      // Auto focus once when modal opens
      let timer: NodeJS.Timeout | null = null;
      if (!hasFocusedRef.current) {
        hasFocusedRef.current = true;
        timer = setTimeout(() => {
          if (modalRef.current) {
            const focusableInputs = modalRef.current.querySelectorAll<
              HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
            >('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])');

            if (focusableInputs.length > 0) {
              const firstInput = focusableInputs[0];
              firstInput.focus();
            } else {
              const focusableBtns = modalRef.current.querySelectorAll<HTMLButtonElement>(
                'button:not([disabled]):not([aria-label="Close"])'
              );
              if (focusableBtns.length > 0) {
                focusableBtns[0].focus();
              }
            }
          }
        }, 50);
      }

      return () => {
        document.body.style.overflow = 'unset';
        window.removeEventListener('keydown', handleKeyDown);
        if (timer) clearTimeout(timer);
      };
    } else {
      hasFocusedRef.current = false;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div 
        className="absolute inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-xs transition-opacity" 
        onClick={() => !preventBackdropClose && onClose()} 
      />
      <div 
        ref={modalRef}
        className={`relative bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 w-full ${maxWidth} flex flex-col overflow-hidden rounded-md max-h-[90vh] shadow-2xl animate-in fade-in zoom-in-95 duration-150`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <h3 className="text-[18px] font-medium text-slate-900 dark:text-slate-100 capitalize">{title}</h3>
          <button 
            type="button" 
            aria-label="Close"
            onClick={onClose} 
            className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors active:scale-95 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900 custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
