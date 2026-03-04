import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import type { ToastMessage } from '../types';

interface ToastContextValue {
  showToast: (type: ToastMessage['type'], message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((type: ToastMessage['type'], message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const remove = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  const iconMap = {
    success: <CheckCircle size={18} className="text-green-400 flex-shrink-0" />,
    error: <XCircle size={18} className="text-red-400 flex-shrink-0" />,
    warning: <AlertCircle size={18} className="text-amber-400 flex-shrink-0" />,
    info: <Info size={18} className="text-blue-400 flex-shrink-0" />,
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map(t => (
          <div
            key={t.id}
            className="flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg bg-gray-900 border border-gray-700 text-gray-100 text-sm animate-slide-in"
          >
            {iconMap[t.type]}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => remove(t.id)} className="text-gray-500 hover:text-gray-300 transition-colors ml-1">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
