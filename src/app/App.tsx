import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import { Spinner } from '../components/Spinner';
import { ToastProvider } from '../components/Toast';
import { ShortcutProvider } from '../hooks/useShortcut';
import { openDatabase } from '../db/db';
import { useSettings } from '../hooks/useSettings';
import { DbErrorScreen } from './DbErrorScreen';
import { PersistStorageRequester } from './PersistStorageRequester';
import { PwaUpdateNotifier } from './PwaUpdateNotifier';
import { router } from './router';
import { applyTheme } from './theme';

type DbState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; error: unknown };

function ThemeSync() {
  const { settings, ready } = useSettings();
  useEffect(() => {
    if (ready) applyTheme(settings.theme);
  }, [ready, settings.theme]);
  return null;
}

export function App() {
  const [db, setDb] = useState<DbState>({ status: 'loading' });

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    openDatabase().then(
      () => !cancelled && setDb({ status: 'ready' }),
      (error: unknown) => !cancelled && setDb({ status: 'error', error }),
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setDb({ status: 'loading' });
    setAttempt((n) => n + 1);
  };

  if (db.status === 'loading') return <Spinner />;
  if (db.status === 'error') return <DbErrorScreen error={db.error} onRetry={retry} />;

  return (
    <ToastProvider>
      <ThemeSync />
      <PersistStorageRequester />
      <PwaUpdateNotifier />
      <ShortcutProvider>
        <RouterProvider router={router} />
      </ShortcutProvider>
    </ToastProvider>
  );
}
