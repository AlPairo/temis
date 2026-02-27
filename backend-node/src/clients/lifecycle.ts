import type { FastifyInstance } from "fastify";

let processHooksRegistered = false;

type HealthCheckedClient = { healthCheck: () => Promise<unknown> };

interface ClientLifecycleModules {
  getOpenAIClient: () => Promise<HealthCheckedClient>;
  shutdownOpenAIClient: () => Promise<void>;
  getPostgresClient: () => Promise<HealthCheckedClient>;
  shutdownPostgresClient: () => Promise<void>;
  getQdrantClient: () => Promise<HealthCheckedClient>;
  shutdownQdrantClient: () => Promise<void>;
}

async function getClientModules(): Promise<ClientLifecycleModules> {
  const [openaiModule, postgresModule, qdrantModule] = await Promise.all([
    import("./openai.js"),
    import("./postgres.js"),
    import("./qdrant.js")
  ]);

  return {
    getOpenAIClient: openaiModule.getOpenAIClient,
    shutdownOpenAIClient: openaiModule.shutdownOpenAIClient,
    getPostgresClient: postgresModule.getPostgresClient,
    shutdownPostgresClient: postgresModule.shutdownPostgresClient,
    getQdrantClient: qdrantModule.getQdrantClient,
    shutdownQdrantClient: qdrantModule.shutdownQdrantClient
  };
}

async function shutdownAllClients(logPrefix: string, loadClientModules: () => Promise<ClientLifecycleModules>): Promise<void> {
  const clients = await loadClientModules();
  console.info(`${logPrefix} shutting down infrastructure clients`);
  await Promise.allSettled([
    clients.shutdownQdrantClient(),
    clients.shutdownOpenAIClient(),
    clients.shutdownPostgresClient()
  ]);
}

export interface ClientLifecycleOptions {
  enableBootstrap?: boolean;
  loadClientModules?: () => Promise<ClientLifecycleModules>;
  registerProcessSignals?: boolean;
  exit?: (code: number) => never | void;
}

export function registerClientLifecycle(app: FastifyInstance, options?: ClientLifecycleOptions): void {
  const enableBootstrap = options?.enableBootstrap ?? process.env.ENABLE_INFRA_BOOTSTRAP === "true";
  if (!enableBootstrap) {
    app.log.info("Infrastructure bootstrap disabled (set ENABLE_INFRA_BOOTSTRAP=true to enable).");
    return;
  }
  const loadClientModules = options?.loadClientModules ?? getClientModules;
  const shouldRegisterProcessSignals = options?.registerProcessSignals ?? true;
  const exit = options?.exit ?? ((code: number) => process.exit(code));

  app.addHook("onReady", async () => {
    const clients = await loadClientModules();
    await Promise.all([
      clients.getPostgresClient().then((client) => client.healthCheck()),
      clients.getOpenAIClient().then((client) => client.healthCheck()),
      clients.getQdrantClient().then((client) => client.healthCheck())
    ]);
    app.log.info("Infrastructure singletons initialized and health checked");
  });

  app.addHook("onClose", async () => {
    await shutdownAllClients("[lifecycle/onClose]", loadClientModules);
  });

  if (shouldRegisterProcessSignals && !processHooksRegistered) {
    processHooksRegistered = true;
    const handleSignal = async (signal: NodeJS.Signals): Promise<void> => {
      console.info(`[lifecycle/process] received ${signal}`);
      await shutdownAllClients("[lifecycle/process]", loadClientModules);
      exit(0);
    };

    process.once("SIGINT", async () => {
      await handleSignal("SIGINT");
    });
    process.once("SIGTERM", async () => {
      await handleSignal("SIGTERM");
    });
  }
}

export function resetClientLifecycleStateForTests(): void {
  processHooksRegistered = false;
}
