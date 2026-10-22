import { loadConfig } from "../config.js";
import { createStore } from "../store/factory.js";
import { seedStore } from "./seed.js";

const config = loadConfig();
if (config.store !== "mysql") {
  console.error("Seeding targets MySQL. Set STORE=mysql and the DB_* variables (the memory store seeds itself on start).");
  process.exit(1);
}
const store = createStore(config);
try {
  const result = await seedStore(store, {
    adminEmail: process.env.SEED_ADMIN_EMAIL,
    adminPassword: process.env.SEED_ADMIN_PASSWORD,
  });
  console.log(
    `Seeded ${result.categories} categories and ${result.products} products` +
      (result.adminCreated ? "; admin account created." : "; no admin created."),
  );
} finally {
  await store.close();
}
