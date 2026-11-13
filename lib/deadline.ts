export class TimedOut extends Error {}

export async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>, ms: number, parent?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const relay = () => controller.abort();
  if (parent?.aborted) relay(); else parent?.addEventListener("abort", relay, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new TimedOut("Operation timed out")); }, ms);
  });
  try { return await Promise.race([work(controller.signal), expired]); }
  finally { clearTimeout(timer); parent?.removeEventListener("abort", relay); }
}
