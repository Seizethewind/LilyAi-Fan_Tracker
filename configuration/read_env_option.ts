export function readEnvOption(env: NodeJS.ProcessEnv, name: string): string | null {
  const raw = env[name];
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
