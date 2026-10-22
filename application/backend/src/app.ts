import { randomBytes, randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { COOKIE_NAME, HttpError, type AppDeps } from "./http.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { catalogRoutes } from "./routes/catalog.js";
import { healthRoutes } from "./routes/health.js";
import { shopRoutes } from "./routes/shop.js";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function buildApp(deps: AppDeps, options: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: config.logLevel,
            // Cookies and authorization headers are never logged.
            redact: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
          },
    // Trust only the configured number of proxy hops when reading X-Forwarded-For.
    trustProxy: config.trustProxy > 0 ? (_address: string, hop: number) => hop < config.trustProxy : false,
    requestIdHeader: false,
    genReqId: (request) => {
      const incoming = request.headers["x-request-id"];
      return typeof incoming === "string" && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    },
    bodyLimit: 100 * 1024,
  });

  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(cookie);

  let secret = config.jwtSecret;
  if (!secret) {
    // Only reachable outside production (config validation requires it there). Sessions reset on restart.
    secret = randomBytes(32).toString("hex");
    app.log.warn("JWT_SECRET is not set; using an ephemeral secret, so sessions end when the server restarts");
  }
  await app.register(jwt, { secret, cookie: { cookieName: COOKIE_NAME, signed: false } });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });

  // State-changing requests from a browser carry an Origin header. Reject any that is not a known
  // site origin, so another website cannot make a signed-in customer's browser change data.
  const allowedOrigins = new Set(config.corsOrigins);
  app.addHook("onRequest", async (request) => {
    const origin = request.headers.origin;
    if (UNSAFE_METHODS.has(request.method) && origin && allowedOrigins.size > 0 && !allowedOrigins.has(origin)) {
      throw new HttpError(403, "forbidden_origin", "This request origin is not allowed.");
    }
  });

  app.setErrorHandler((error: unknown, request, reply) => {
    const requestId = request.id;
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: "validation_error",
          message: "Some of the information provided is not valid.",
          details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
          requestId,
        },
      });
    }
    if (error instanceof HttpError) {
      return reply.code(error.status).send({
        error: { code: error.code, message: error.message, details: error.details, requestId },
      });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      const code = status === 429 ? "rate_limited" : "bad_request";
      const message = status === 429 ? "Too many requests. Please slow down and try again shortly." : "The request could not be processed.";
      return reply.code(status).send({ error: { code, message, requestId } });
    }
    request.log.error({ err: error }, "unhandled error");
    return reply
      .code(500)
      .send({ error: { code: "internal_error", message: "Something went wrong on our side. Please try again.", requestId } });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({ error: { code: "not_found", message: "Not found.", requestId: request.id } }),
  );

  await app.register(healthRoutes, deps);
  await app.register(catalogRoutes, deps);
  await app.register(shopRoutes, deps);
  await app.register(authRoutes, deps);
  await app.register(adminRoutes, deps);
  return app;
}
