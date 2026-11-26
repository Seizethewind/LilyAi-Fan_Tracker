import { ConfigError } from "./config_types.js";
import { readEnvOption } from "./read_env_option.js";

export function readEnvInt(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number
): number {
  const raw = readEnvOption(env, name);
  if (raw === null) return fallback;
  if (!/^-?\d+$/.test(raw)) {
    throw new ConfigError(`${name} must be an integer`);
  }
  const value = Number.parseInt(raw, 10);
  if (value < minimum) {
    throw new ConfigError(`${name} must be at least ${minimum}`);
  }
  return value;
}
