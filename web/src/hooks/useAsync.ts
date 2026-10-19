import { useCallback, useEffect, useState, type DependencyList } from 'react';

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

/**
 * 非同期の読み込み。deps が変わると読み直し、古い読み込みの結果は捨てる。
 * fn が null のときは読み込まない（loading のまま）。
 */
export function useAsync<T>(fn: (() => Promise<T>) | null, deps: DependencyList) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!fn) return;
    let active = true;
    setState({ status: 'loading' });
    fn().then(
      (data) => active && setState({ status: 'success', data }),
      (error: unknown) => active && setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) }),
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, reload };
}
