/** Settle promptly on cancellation, even when an injected adapter ignores its signal. */
export function abortable<T>(task: Promise<T>, signal: AbortSignal, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const finish = (value: T) => {
      signal.removeEventListener("abort", abort);
      resolve(value);
    };
    const abort = () => finish(fallback);
    task.then(finish, () => finish(fallback));
    if (signal.aborted) {
      resolve(fallback);
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}
