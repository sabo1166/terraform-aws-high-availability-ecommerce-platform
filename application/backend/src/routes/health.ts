import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../http.js";

const READY_TIMEOUT_MS = 2000;

/**
 * Health endpoints for load balancer target groups (not under /api so proxies can route them directly):
 * - GET /healthz: liveness. Never touches the database, so a database outage cannot make the load
 *   balancer replace healthy API instances.
 * - GET /readyz: readiness. Verifies the store with a bounded timeout and returns no internals.
 */
export async function healthRoutes(app: FastifyInstance, { store }: AppDeps): Promise<void> {
  app.get("/healthz", { config: { rateLimit: false } }, async () => ({ status: "ok" }));

  // The ALB module's default health-check path is "/". Answering it (database-free, like /healthz)
  // keeps the current Terraform defaults working; /healthz is still the recommended explicit path.
  app.get("/", { config: { rateLimit: false } }, async () => ({ service: "oriel-api", status: "ok" }));

  app.get("/readyz", { config: { rateLimit: false } }, async (_request, reply) => {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        store.ping(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("timeout")), READY_TIMEOUT_MS);
        }),
      ]);
      return { status: "ready" };
    } catch (error) {
      app.log.warn({ err: error }, "readiness check failed");
      return reply.code(503).send({ status: "unavailable" });
    } finally {
      clearTimeout(timer);
    }
  });
}
