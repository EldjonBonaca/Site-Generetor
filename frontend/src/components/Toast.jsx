/** Lightweight toast notifications. */
import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = (id) => setToasts((ts) => ts.filter((t) => t.id !== id));
  const push = useCallback((message, kind = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((ts) => [...ts.slice(-3), { id, message: String(message), kind }]);
    setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 3500);
  }, []);

  const icons = { success: [CheckCircle2, 'text-emerald-500'], error: [XCircle, 'text-red-500'], info: [Info, 'text-brand-500'] };
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-full max-w-sm flex-col gap-2" aria-live="polite">
        {toasts.map((t) => {
          const [Icon, cls] = icons[t.kind] || icons.info;
          return (
            <div key={t.id} className="pointer-events-auto flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-lg">
              <Icon className={`mt-0.5 size-4 shrink-0 ${cls}`} />
              <p className="flex-1 text-slate-700">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-600" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
