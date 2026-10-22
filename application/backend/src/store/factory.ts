import { readFileSync } from "node:fs";
import type { Config } from "../config.js";
import { MemoryStore } from "./memory.js";
import { MysqlStore, type MysqlConfig } from "./mysql.js";
import type { Store } from "./store.js";

export function mysqlConfigFrom(config: Config): MysqlConfig {
  const { db } = config;
  return {
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.name,
    // TLS is on unless explicitly disabled (local development). Production requires a CA bundle.
    sslCa: db.sslDisabled ? undefined : db.sslCaPath ? readFileSync(db.sslCaPath, "utf8") : undefined,
  };
}

export function createStore(config: Config): Store {
  return config.store === "mysql" ? new MysqlStore(mysqlConfigFrom(config)) : new MemoryStore();
}
