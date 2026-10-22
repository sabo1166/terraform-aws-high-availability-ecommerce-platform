import type { FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import type { OrderRecord, User } from "./domain/types.js";
import type { Config } from "./config.js";
import type { Store } from "./store/store.js";

export interface AppDeps {
  config: Config;
  store: Store;
}

/** An error with a safe, client-visible message and a stable machine-readable code. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const COOKIE_NAME = "oriel_session";
export const SESSION_SECONDS = 7 * 24 * 60 * 60;

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  return schema.parse(data);
}

export function publicUser(user: User) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/** Orders sent to clients never include the internal user id. */
export function publicOrder(order: OrderRecord) {
  const { userId: _userId, ...rest } = order;
  return rest;
}

/** Loads the signed-in user from the session cookie, re-reading the role from the database every time. */
export async function currentUser(request: FastifyRequest, store: Store): Promise<User | null> {
  try {
    const payload = await request.jwtVerify<{ sub: string }>({ onlyCookie: true });
    const id = Number(payload.sub);
    return Number.isInteger(id) ? await store.findUserById(id) : null;
  } catch {
    return null;
  }
}

export async function requireUser(request: FastifyRequest, store: Store): Promise<User> {
  const user = await currentUser(request, store);
  if (!user) throw new HttpError(401, "unauthenticated", "Please sign in to continue.");
  return user;
}

/** Authorization is enforced here, on the server, from the stored role; the browser's view is irrelevant. */
export async function requireAdmin(request: FastifyRequest, store: Store): Promise<User> {
  const user = await requireUser(request, store);
  if (user.role !== "admin") throw new HttpError(403, "forbidden", "You do not have access to this resource.");
  return user;
}

export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
  reply.setCookie(COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: SESSION_SECONDS,
  });
}
