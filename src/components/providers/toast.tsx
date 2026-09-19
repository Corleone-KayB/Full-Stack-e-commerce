'use client';

import * as React from 'react';
import { AlertTriangle, Check, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Toasts.
 *
 * Rendered into a polite live region so screen readers announce them without
 * stealing focus. Errors use assertive, because a failed payment or a sold-out
 * item is not something to discover later.
 */

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>.');
  return ctx;
}

const ICONS: Record<ToastTone, React.ReactNode> = {
  success: <Check className="h-4 w-4" />,
  error: <XCircle className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  info: <Info className="h-4 w-4" />,
};

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'text-positive',
  error: 'text-critical',
  warning: 'text-caution',
  info: 'text-info',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = React.useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      const duration = toast.duration ?? (toast.tone === 'error' ? 7000 : 4200);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
      return id;
    },
    [dismiss],
  );

  React.useEffect(() => {
    const map = timers.current;
    return () => map.forEach((timer) => clearTimeout(timer));
  }, []);

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toasts,
      push,
      dismiss,
      success: (title, body) => void push({ tone: 'success', title, body }),
      error: (title, body) => void push({ tone: 'error', title, body }),
      info: (title, body) => void push({ tone: 'info', title, body }),
    }),
    [toasts, push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4
                   sm:bottom-auto sm:right-0 sm:top-0 sm:items-end sm:p-5"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-hairline
                       bg-elevated p-3.5 shadow-floating animate-slide-up sm:animate-scale-in"
          >
            <span className={cn('mt-0.5 shrink-0', TONE_STYLES[toast.tone])}>{ICONS[toast.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug text-ink">{toast.title}</p>
              {toast.body && <p className="mt-0.5 text-[13px] leading-snug text-muted">{toast.body}</p>}
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick();
                    dismiss(toast.id);
                  }}
                  className="mt-2 text-[13px] font-medium text-accent underline underline-offset-4"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="-mr-1 -mt-1 rounded p-1 text-faint transition-colors hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
