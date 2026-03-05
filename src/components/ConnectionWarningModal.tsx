import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigError } from '../lib/supabase';

const CHECK_TIMEOUT_MS = 8000;

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), timeoutMs);
    }),
  ]);
}

export default function ConnectionWarningModal() {
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [open, setOpen] = useState(false);

  const initialConfigError = useMemo(() => supabaseConfigError, []);

  const checkConnection = useCallback(async () => {
    if (initialConfigError) {
      setMessage(initialConfigError);
      setOpen(true);
      return;
    }

    setChecking(true);
    try {
      const result = await runWithTimeout(supabase.auth.getSession(), CHECK_TIMEOUT_MS);
      if (result.error) throw result.error;
      setOpen(false);
      setMessage('');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Failed to connect to Supabase';
      setMessage(`Не удалось подключиться к серверу. ${text}`);
      setOpen(true);
    } finally {
      setChecking(false);
    }
  }, [initialConfigError]);

  useEffect(() => {
    void checkConnection();
  }, [checkConnection]);

  useEffect(() => {
    const onOnline = () => {
      void checkConnection();
    };
    const onOffline = () => {
      setMessage('Нет интернет-соединения.');
      setOpen(true);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [checkConnection]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1200] bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-amber-200 p-5">
        <h2 className="text-base font-semibold text-amber-800 mb-2">Проблема подключения</h2>
        <p className="text-sm text-gray-700 mb-4">{message || 'Проверьте параметры подключения и интернет.'}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => void checkConnection()}
            disabled={checking}
            className="px-3 py-2 text-sm rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white"
          >
            {checking ? 'Проверка...' : 'Проверить снова'}
          </button>
        </div>
      </div>
    </div>
  );
}
