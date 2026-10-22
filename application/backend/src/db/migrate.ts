import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import type { MysqlConfig } from "../store/mysql.js";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

/**
 * Applies pending SQL migrations in filename order and records them in schema_migrations. A MySQL
 * advisory lock prevents two instances from migrating at once. DDL statements auto-commit in MySQL,
 * so a failed migration can leave partial changes: keep each migration small and fix forward.
 */
export async function runMigrations(config: MysqlConfig, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    multipleStatements: true,
    ...(config.sslCa ? { ssl: { ca: config.sslCa, rejectUnauthorized: true } } : {}),
  });
  const applied: string[] = [];
  try {
    const [lockRows] = await connection.query<mysql.RowDataPacket[]>("SELECT GET_LOCK('oriel_migrate', 30) AS acquired");
    if (lockRows[0]?.acquired !== 1) throw new Error("Could not acquire the migration lock");

    await connection.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version VARCHAR(100) NOT NULL PRIMARY KEY,
         applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
       ) ENGINE=InnoDB`,
    );
    const [rows] = await connection.query<mysql.RowDataPacket[]>("SELECT version FROM schema_migrations");
    const done = new Set(rows.map((r) => r.version as string));

    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      await connection.query(await readFile(join(dir, file), "utf8"));
      await connection.query("INSERT INTO schema_migrations (version) VALUES (?)", [file]);
      applied.push(file);
    }
    await connection.query("SELECT RELEASE_LOCK('oriel_migrate')");
  } finally {
    await connection.end();
  }
  return applied;
}
