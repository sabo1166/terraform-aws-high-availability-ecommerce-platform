import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { seedStore } from "../src/seed/seed.js";
import { MemoryStore } from "../src/store/memory.js";

export const ADMIN = { email: "admin@example.test", password: "an-admin-password-for-tests" };

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    env: "test",
    host: "127.0.0.1",
    port: 0,
    logLevel: "silent",
    store: "memory",
    jwtSecret: "test-secret-test-secret-test-secret-1234",
    corsOrigins: ["http://localhost:5173"],
    trustProxy: 0,
    cookieSecure: false,
    db: { host: "", port: 3306, name: "", user: "", password: "", sslCaPath: undefined, sslDisabled: true },
    ...overrides,
  };
}

export async function makeApp(overrides: Partial<Config> = {}) {
  const store = new MemoryStore();
  await seedStore(store, { adminEmail: ADMIN.email, adminPassword: ADMIN.password });
  const app = await buildApp({ config: testConfig(overrides), store }, { logger: false });
  return { app, store };
}

export const ORIGIN = { origin: "http://localhost:5173" };

export function cookieFrom(response: LightMyRequestResponse): string {
  const header = response.headers["set-cookie"];
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) throw new Error("No session cookie was set");
  return raw.split(";")[0] as string;
}

export async function signIn(app: FastifyInstance, email: string, password: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password },
    headers: ORIGIN,
  });
  if (response.statusCode !== 200) throw new Error(`Sign-in failed: ${response.statusCode} ${response.body}`);
  return cookieFrom(response);
}

export async function register(app: FastifyInstance, email: string, password = "customer-password-1") {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email, name: "Test Customer", password },
    headers: ORIGIN,
  });
  return { response, cookie: response.statusCode === 201 ? cookieFrom(response) : "" };
}

export const validCheckout = (items: { variantId: number; quantity: number }[]) => ({
  items,
  email: "buyer@example.test",
  customerName: "Alex Buyer",
  address: { line1: "1 Example Street", city: "Exampleton", region: "EX", postalCode: "12345", country: "us" },
  paymentMethod: "demo",
});
