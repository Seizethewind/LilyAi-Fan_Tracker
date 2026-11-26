export function startSelfPing(url: string, intervalSeconds: number): () => void {
  let reportedOk = false;
  const timer = setInterval(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "lilyai-fan-tracker-self-ping" },
          signal: controller.signal,
        });
        if (res.status >= 400) {
          console.warn(`Self-ping got HTTP ${res.status}`);
        } else if (!reportedOk) {
          console.info(`Self-ping is working (HTTP ${res.status})`);
          reportedOk = true;
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      const name = err instanceof Error ? err.name : "Error";
      console.warn(`Self-ping failed (${name})`);
    }
  }, intervalSeconds * 1000);
  timer.unref();

  return () => clearInterval(timer);
}
