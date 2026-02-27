import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { registerClientLifecycle } from "./clients/lifecycle.js";
import { registerHealthRoute } from "./api/routes/health.js";
import { registerInfrastructureHealthRoute } from "./api/routes/infrastructure-health.js";
import { registerApiRoutes, type ApiRoutesDependencies } from "./api/routes/index.js";
import { registerMetricsRoutes, registerRequestMetricsHooks } from "./observability/metrics.js";
import { registerRequestTraceHooks } from "./observability/request-tracing.js";

export interface BuildAppOptions {
  apiDependencies?: ApiRoutesDependencies;
  registerInfrastructureHealth?: boolean;
}

export function buildAllowedFrontendOrigins(rawOrigin: string | undefined): string[] {
  const configured = rawOrigin
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const origins = new Set<string>(
    configured && configured.length > 0
      ? configured
      : ["http://localhost:5173", "http://127.0.0.1:5173"]
  );

  for (const origin of [...origins]) {
    try {
      const url = new URL(origin);
      if (url.hostname === "localhost") {
        url.hostname = "127.0.0.1";
        origins.add(url.toString().replace(/\/$/, ""));
      } else if (url.hostname === "127.0.0.1") {
        url.hostname = "localhost";
        origins.add(url.toString().replace(/\/$/, ""));
      }
    } catch {
      // Ignore invalid configured origins and let explicit entries pass through as-is.
    }
  }

  return [...origins];
}

export async function buildApp(options?: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const frontendOrigins = buildAllowedFrontendOrigins(process.env.FRONTEND_ORIGIN);

  await app.register(cors, {
    origin: frontendOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"]
  });

  registerRequestMetricsHooks(app);
  registerRequestTraceHooks(app);
  registerClientLifecycle(app);
  await registerHealthRoute(app);
  await registerMetricsRoutes(app);
  if (options?.registerInfrastructureHealth !== false) {
    await registerInfrastructureHealthRoute(app);
  }
  await registerApiRoutes(app, options?.apiDependencies);

  return app;
}
