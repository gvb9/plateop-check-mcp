export interface Config {
  port: number;
  /** Base URL of the Plateop app, without trailing slash. Production: http://127.0.0.1:3105 (the app behind nginx on the same server). */
  plateopBaseUrl: string;
  /** Behind nginx: read the caller's IP from X-Real-IP / X-Forwarded-For instead of the socket. */
  trustProxy: boolean;
  /** Salt for the IP hash. Unset = random per process start, so hashes (and limits) reset on restart. */
  ipSalt?: string;
  /** Timeout for one call to the Plateop app. */
  timeoutMs: number;
  now?: () => number;
}

/** Reads the settings from the environment. */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3200),
    plateopBaseUrl: (env.PLATEOP_BASE_URL ?? "http://127.0.0.1:3105").replace(/\/+$/, ""),
    trustProxy: env.TRUST_PROXY === "1",
    ipSalt: env.IP_SALT || undefined,
    timeoutMs: 10_000,
  };
}
