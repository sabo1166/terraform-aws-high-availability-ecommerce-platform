import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.js";

const production = {
  NODE_ENV: "production",
  STORE: "mysql",
  JWT_SECRET: "x".repeat(40),
  COOKIE_SECURE: "true",
  CORS_ORIGINS: "https://shop.example.test",
  DB_HOST: "db.internal.example",
  DB_NAME: "appdb",
  DB_USER: "app",
  DB_PASSWORD: "placeholder-password",
  DB_SSL_CA_PATH: "/etc/ssl/rds-ca.pem",
};

describe("loadConfig", () => {
  it("uses safe development defaults", () => {
    const config = loadConfig({});
    expect(config).toMatchObject({ env: "development", store: "memory", port: 3000, cookieSecure: false });
    expect(config.jwtSecret).toBeUndefined();
  });

  it("treats empty placeholder values as unset", () => {
    expect(loadConfig({ DB_HOST: "", JWT_SECRET: "", CORS_ORIGINS: "" }).corsOrigins).toEqual([]);
  });

  it("accepts a complete production configuration", () => {
    const config = loadConfig(production);
    expect(config.store).toBe("mysql");
    expect(config.corsOrigins).toEqual(["https://shop.example.test"]);
  });

  it("rejects insecure or incomplete production settings without echoing values", () => {
    for (const [key, value] of [
      ["JWT_SECRET", ""],
      ["STORE", "memory"],
      ["COOKIE_SECURE", "false"],
      ["CORS_ORIGINS", ""],
      ["DB_SSL_DISABLED", "true"],
      ["DB_SSL_CA_PATH", ""],
      ["DB_PASSWORD", ""],
    ] as const) {
      expect(() => loadConfig({ ...production, [key]: value }), key).toThrow(ConfigError);
    }
    try {
      loadConfig({ ...production, JWT_SECRET: "short-secret-value" });
    } catch (error) {
      expect(String(error)).not.toContain("short-secret-value");
    }
  });

  it("rejects malformed origins and short secrets", () => {
    expect(() => loadConfig({ CORS_ORIGINS: "https://shop.example.test/path" })).toThrow(ConfigError);
    expect(() => loadConfig({ JWT_SECRET: "too-short" })).toThrow(ConfigError);
  });
});
