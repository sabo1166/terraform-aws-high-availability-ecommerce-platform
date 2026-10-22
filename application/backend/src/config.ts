import { z } from "zod";

const bool = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  STORE: z.enum(["memory", "mysql"]).default("memory"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters").optional(),
  CORS_ORIGINS: z.string().default(""),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  COOKIE_SECURE: bool,
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_NAME: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_SSL_CA_PATH: z.string().optional(),
  DB_SSL_DISABLED: bool,
});

export interface Config {
  env: "development" | "test" | "production";
  host: string;
  port: number;
  logLevel: string;
  store: "memory" | "mysql";
  /** Undefined only outside production; the app then generates an ephemeral secret. */
  jwtSecret: string | undefined;
  corsOrigins: string[];
  trustProxy: number;
  cookieSecure: boolean;
  db: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    sslCaPath: string | undefined;
    sslDisabled: boolean;
  };
}

export class ConfigError extends Error {}

/** Parses and validates environment variables. Error messages never include the offending values. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Treat empty strings (as in .env.example placeholders) as unset.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`);
    throw new ConfigError(`Invalid configuration:\n- ${issues.join("\n- ")}`);
  }
  const e = parsed.data;
  const problems: string[] = [];
  const corsOrigins = e.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  for (const origin of corsOrigins) {
    try {
      const url = new URL(origin);
      if (url.origin !== origin) problems.push(`CORS_ORIGINS entry "${origin}" must be a bare origin (no path or trailing slash)`);
    } catch {
      problems.push(`CORS_ORIGINS entry "${origin}" is not a valid origin`);
    }
  }

  if (e.STORE === "mysql") {
    for (const key of ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"] as const) {
      if (!e[key]) problems.push(`${key} is required when STORE=mysql`);
    }
  }
  if (e.NODE_ENV === "production") {
    if (!e.JWT_SECRET) problems.push("JWT_SECRET is required in production");
    if (e.STORE !== "mysql") problems.push("STORE must be mysql in production");
    if (!e.COOKIE_SECURE) problems.push("COOKIE_SECURE must be true in production");
    if (corsOrigins.length === 0) problems.push("CORS_ORIGINS must list the public site origin in production");
    if (e.DB_SSL_DISABLED) problems.push("DB_SSL_DISABLED is not allowed in production");
    if (e.STORE === "mysql" && !e.DB_SSL_CA_PATH) problems.push("DB_SSL_CA_PATH is required in production");
  }
  if (problems.length > 0) {
    throw new ConfigError(`Invalid configuration:\n- ${problems.join("\n- ")}`);
  }

  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    store: e.STORE,
    jwtSecret: e.JWT_SECRET,
    corsOrigins,
    trustProxy: e.TRUST_PROXY,
    cookieSecure: e.COOKIE_SECURE,
    db: {
      host: e.DB_HOST ?? "",
      port: e.DB_PORT,
      name: e.DB_NAME ?? "",
      user: e.DB_USER ?? "",
      password: e.DB_PASSWORD ?? "",
      sslCaPath: e.DB_SSL_CA_PATH,
      sslDisabled: e.DB_SSL_DISABLED,
    },
  };
}
