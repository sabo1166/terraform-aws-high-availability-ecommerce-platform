import { loadConfig } from "../config.js";
import { mysqlConfigFrom } from "../store/factory.js";
import { runMigrations } from "./migrate.js";

const config = loadConfig();
if (config.store !== "mysql") {
  console.error("Migrations apply to MySQL only. Set STORE=mysql and the DB_* variables.");
  process.exit(1);
}
const applied = await runMigrations(mysqlConfigFrom(config));
console.log(applied.length ? `Applied: ${applied.join(", ")}` : "No pending migrations.");
