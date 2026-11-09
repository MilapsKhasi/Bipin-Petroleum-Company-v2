// Universal lightweight toast notification utility
export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

type ToastListener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners: Set<ToastListener> = new Set();

const notify = () => {
  listeners.forEach((listener) => listener([...toasts]));
};

export const toast = {
  show: (message: string, type: ToastType = 'info', duration = 3000) => {
    const id = Math.random().toString(36).substring(2, 9);
    const item: ToastItem = { id, message, type, duration };
    toasts = [...toasts, item];
    notify();

    if (duration > 0) {
      setTimeout(() => {
        toast.dismiss(id);
      }, duration);
    }
    return id;
  },
  success: (message: string, duration = 2800) => toast.show(message, 'success', duration),
  error: (message: string, duration = 4000) => toast.show(message, 'error', duration),
  info: (message: string, duration = 3000) => toast.show(message, 'info', duration),
  warning: (message: string, duration = 3500) => toast.show(message, 'warning', duration),
  dismiss: (id: string) => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  },
  clear: () => {
    toasts = [];
    notify();
  },
  subscribe: (listener: ToastListener) => {
    listeners.add(listener);
    listener([...toasts]);
    return () => {
      listeners.delete(listener);
    };
  }
};
