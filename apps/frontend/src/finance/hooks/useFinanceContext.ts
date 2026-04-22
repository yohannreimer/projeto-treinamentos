import { useEffect, useState } from 'react';
import { INTERNAL_AUTH_CHANGED_EVENT } from '../../auth/session';
import { financeApi, type FinanceContext } from '../api';

export function useFinanceContext() {
  const [context, setContext] = useState<FinanceContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const handleAuthChanged = () => {
      setReloadKey((current) => current + 1);
    };

    window.addEventListener(INTERNAL_AUTH_CHANGED_EVENT, handleAuthChanged);
    return () => {
      window.removeEventListener(INTERNAL_AUTH_CHANGED_EVENT, handleAuthChanged);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);

    financeApi
      .getContext()
      .then((response) => {
        if (cancelled) return;
        setContext(response);
        setError(null);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setContext(null);
        setError((loadError as Error).message || 'Falha ao carregar o contexto financeiro.');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return {
    context,
    loading,
    error
  };
}
