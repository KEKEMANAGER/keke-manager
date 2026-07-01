/** Attach a catch handler so fire-and-forget promises cannot crash the app. */
export function voidSafe(promise: Promise<unknown>, label?: string): void {
  promise.catch((err: unknown) => {
    if (__DEV__) {
      console.warn(label ?? '[voidSafe]', err);
    }
  });
}

/** Run async work; return fallback on throw (network, native module, etc.). */
export async function safeAsync<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (__DEV__) {
      console.warn('[safeAsync]', err);
    }
    return fallback;
  }
}
