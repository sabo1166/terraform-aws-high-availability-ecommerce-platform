import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  COOKIE_NAME,
  HttpError,
  currentUser,
  parse,
  publicUser,
  setSessionCookie,
  type AppDeps,
} from "../http.js";
import { getDummyHash, hashPassword, verifyPassword } from "../services/passwords.js";
import { StoreError } from "../store/store.js";

const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10, "Use at least 10 characters").max(128),
});
const registerSchema = credentials.extend({ name: z.string().trim().min(1).max(120) });
const authLimit = { rateLimit: { max: 10, timeWindow: "1 minute" } };

export async function authRoutes(app: FastifyInstance, { store, config }: AppDeps): Promise<void> {
  const issue = (userId: number) => app.jwt.sign({ sub: String(userId) }, { expiresIn: "7d" });

  app.post("/api/v1/auth/register", { config: authLimit }, async (request, reply) => {
    const input = parse(registerSchema, request.body);
    try {
      // Public registration can only ever create customers; admins come from seeding.
      const user = await store.createUser({
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
        role: "customer",
      });
      setSessionCookie(reply, issue(user.id), config.cookieSecure);
      return reply.code(201).send({ user: publicUser(user) });
    } catch (error) {
      if (error instanceof StoreError && error.code === "duplicate") {
        throw new HttpError(409, "email_taken", "An account with this email already exists.");
      }
      throw error;
    }
  });

  app.post("/api/v1/auth/login", { config: authLimit }, async (request, reply) => {
    const input = parse(credentials, request.body);
    const user = await store.findUserByEmail(input.email);
    // Always run a hash comparison so response time does not reveal whether the email exists.
    const valid = await verifyPassword(input.password, user ? user.passwordHash : await getDummyHash());
    if (!user || !valid) throw new HttpError(401, "invalid_credentials", "Invalid email or password.");
    setSessionCookie(reply, issue(user.id), config.cookieSecure);
    return { user: publicUser(user) };
  });

  app.post("/api/v1/auth/logout", async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: "/" });
    return { ok: true };
  });

  app.get("/api/v1/auth/me", async (request) => {
    const user = await currentUser(request, store);
    return { user: user ? publicUser(user) : null };
  });
}
