// Copies the SQL migration files next to the compiled migration runner (tsc does not copy .sql files).
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(join(root, "dist", "db", "migrations"), { recursive: true });
await cp(join(root, "src", "db", "migrations"), join(root, "dist", "db", "migrations"), { recursive: true });
console.log("Copied SQL migrations to dist/db/migrations");
