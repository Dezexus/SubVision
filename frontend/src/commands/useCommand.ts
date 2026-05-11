import { useState, useCallback } from 'react';
import { useUIStore } from '../store/uiStore';

type Status = 'idle' | 'loading' | 'success' | 'error';

interface UseCommandOptions {
  errorToast?: boolean;
  successToast?: string | false;
}

interface CommandState<TResult = unknown> {
  execute: (...args: any[]) => Promise<TResult | undefined>;
  status: Status;
  isLoading: boolean;
  error: Error | null;
  reset: () => void;
}

export function useCommand<TResult = void>(
  fn: (...args: any[]) => Promise<TResult>,
  options: UseCommandOptions = {}
): CommandState<TResult> {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<Error | null>(null);
  const addToast = useUIStore((s) => s.addToast);

  const execute = useCallback(
    async (...args: any[]) => {
      setStatus('loading');
      setError(null);
      try {
        const result = await fn(...args);
        setStatus('success');
        if (options.successToast) {
          addToast(options.successToast, 'success');
        }
        return result as TResult;
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        setStatus('error');
        if (options.errorToast !== false) {
          const defaultMessage = errorObj.message || 'Operation failed';
          addToast(defaultMessage, 'error');
        }
        throw errorObj;
      }
    },
    [fn, addToast, options.errorToast, options.successToast]
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  return {
    execute,
    status,
    isLoading: status === 'loading',
    error,
    reset,
  };
}