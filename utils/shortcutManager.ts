import { useEffect, useRef } from 'react';

export interface ShortcutHandlers {
  onSave?: () => void | Promise<void>;
  onPrint?: () => void | Promise<void>;
  onSaveAndNew?: () => void | Promise<void>;
  onClose?: () => void;
  priority?: number; // Higher number = higher priority
}

interface RegisteredHandler {
  id: string;
  handlers: ShortcutHandlers;
  priority: number;
  timestamp: number;
}

const handlerStack: RegisteredHandler[] = [];

// Lightweight visual feedback toast
let toastTimeout: any = null;
export function showShortcutFeedback(message: string, type: 'save' | 'print' | 'info' = 'save') {
  if (typeof document === 'undefined') return;

  let toast = document.getElementById('app-shortcut-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-shortcut-toast';
    toast.className = 'fixed bottom-5 right-5 z-[99999] pointer-events-none transition-all duration-200 transform translate-y-2 opacity-0';
    document.body.appendChild(toast);
  }

  const bgColor = type === 'save' ? 'bg-slate-900 dark:bg-slate-800 text-white border-slate-700' : 'bg-[#0f3460] text-white border-blue-900';
  const icon = type === 'save' 
    ? '<svg class="w-4 h-4 text-emerald-400 inline mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
    : '<svg class="w-4 h-4 text-sky-400 inline mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>';

  toast.innerHTML = `
    <div class="flex items-center px-3.5 py-2 rounded-lg shadow-xl border text-xs font-medium ${bgColor} tracking-wide">
      ${icon}
      <span>${message}</span>
    </div>
  `;

  // Show
  toast.classList.remove('translate-y-2', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    if (toast) {
      toast.classList.remove('translate-y-0', 'opacity-100');
      toast.classList.add('translate-y-2', 'opacity-0');
    }
  }, 1800);
}

export function registerShortcutHandlers(id: string, handlers: ShortcutHandlers): () => void {
  const priority = handlers.priority ?? 0;
  const entry: RegisteredHandler = {
    id,
    handlers,
    priority,
    timestamp: Date.now()
  };

  // Remove any existing entry with the same id
  const existingIdx = handlerStack.findIndex(h => h.id === id);
  if (existingIdx !== -1) {
    handlerStack.splice(existingIdx, 1);
  }

  handlerStack.push(entry);

  return () => {
    const idx = handlerStack.findIndex(h => h.id === id);
    if (idx !== -1) {
      handlerStack.splice(idx, 1);
    }
  };
}

function getActiveHandler(): ShortcutHandlers | null {
  if (handlerStack.length === 0) return null;

  // Sort descending by priority, then by timestamp (most recent)
  const sorted = [...handlerStack].sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return b.timestamp - a.timestamp;
  });

  return sorted[0].handlers;
}

// Global Keydown Listener initialized once
let isGlobalListenerInitialized = false;

export function initGlobalShortcutListener() {
  if (isGlobalListenerInitialized || typeof window === 'undefined') return;
  isGlobalListenerInitialized = true;

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    const isCtrl = e.ctrlKey || e.metaKey;
    const isAlt = e.altKey;
    const isShift = e.shiftKey;
    const key = (e.key || '').toLowerCase();

    // 1. SAVE: Ctrl+S or Cmd+S or Alt+S (or Ctrl+Shift+S for Save & New)
    if ((isCtrl && key === 's') || (isAlt && key === 's')) {
      e.preventDefault();
      e.stopPropagation();

      // Flush any currently focused text input or textarea
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      const active = getActiveHandler();
      if (isShift && active?.onSaveAndNew) {
        active.onSaveAndNew();
        showShortcutFeedback('Save & New (Ctrl+Shift+S)', 'save');
        return;
      }

      if (active?.onSave) {
        active.onSave();
        showShortcutFeedback('Saving changes (Ctrl+S)...', 'save');
        return;
      }

      // Fallback: Check if there is an active form on the page with submit button
      const activeForm = document.querySelector('form');
      if (activeForm) {
        activeForm.requestSubmit();
        showShortcutFeedback('Submitting form (Ctrl+S)...', 'save');
        return;
      }

      // Inform user shortcut is intercepted
      showShortcutFeedback('No active form to save', 'info');
      return;
    }

    // 2. PRINT: Ctrl+P or Cmd+P
    if (isCtrl && key === 'p') {
      e.preventDefault();
      e.stopPropagation();

      const active = getActiveHandler();
      if (active?.onPrint) {
        active.onPrint();
        showShortcutFeedback('Opening Print (Ctrl+P)...', 'print');
        return;
      }

      // Check if invoice print modal or preview button exists on screen
      const printBtn = document.querySelector<HTMLButtonElement>('button[data-shortcut-print="true"]');
      if (printBtn) {
        printBtn.click();
        showShortcutFeedback('Opening Print (Ctrl+P)...', 'print');
        return;
      }

      // Dispatch global print event for ledger lists or pages
      window.dispatchEvent(new CustomEvent('app:print'));
    }
  }, { capture: true });
}

// React Hook to easily register shortcuts in components
export function useKeyboardShortcuts(handlers: ShortcutHandlers, deps: any[] = []) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    initGlobalShortcutListener();
    const id = 'handler_' + Math.random().toString(36).slice(2, 9);

    const unregister = registerShortcutHandlers(id, {
      onSave: () => handlersRef.current.onSave?.(),
      onPrint: () => handlersRef.current.onPrint?.(),
      onSaveAndNew: () => handlersRef.current.onSaveAndNew?.(),
      onClose: () => handlersRef.current.onClose?.(),
      priority: handlers.priority ?? 10
    });

    return unregister;
  }, deps);
}
