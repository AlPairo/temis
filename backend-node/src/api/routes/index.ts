import type { FastifyInstance } from "fastify";
import { registerChatRoutes, type ChatRoutesDependencies } from "./chat.js";
import { registerDocumentRoutes, type DocumentRoutesDependencies } from "./documents.js";
import { registerSessionRoutes, type SessionRoutesDependencies } from "./sessions.js";

export interface ApiRoutesDependencies {
  chat?: ChatRoutesDependencies;
  documents?: DocumentRoutesDependencies;
  sessions?: SessionRoutesDependencies;
}

export async function registerApiRoutes(app: FastifyInstance, dependencies?: ApiRoutesDependencies): Promise<void> {
  await registerChatRoutes(app, dependencies?.chat);
  await registerDocumentRoutes(app, dependencies?.documents);
  await registerSessionRoutes(app, dependencies?.sessions);
}
