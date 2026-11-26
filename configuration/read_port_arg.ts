export function readPortArg(argv: readonly string[]): number | null {
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--port" && i + 1 < args.length) {
      const parsed = Number.parseInt(args[i + 1], 10);
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535) return parsed;
    } else if (arg.startsWith("--port=")) {
      const parsed = Number.parseInt(arg.slice("--port=".length), 10);
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535) return parsed;
    } else if (/^\d{1,5}$/.test(arg)) {
      const parsed = Number.parseInt(arg, 10);
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535) return parsed;
    }
  }
  return null;
}
