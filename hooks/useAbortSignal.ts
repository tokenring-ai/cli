import {useEffect} from 'react';

export function useAbortSignal(signal: AbortSignal | undefined, onAbort: () => void) {
  useEffect(() => {
    if (signal) {
      const handler = () => onAbort();
      signal.addEventListener('abort', handler);
      return () => signal.removeEventListener('abort', handler);
    }
  }, [signal, onAbort]);
}
