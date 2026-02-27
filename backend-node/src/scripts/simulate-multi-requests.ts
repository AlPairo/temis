process.env.MOCK_INFRA_CLIENTS = "1";
process.env.PORT ??= "3000";
process.env.OPENAI_API_KEY ??= "sk-mock";
process.env.OPENAI_MODEL ??= "gpt-4o-mini";
process.env.POSTGRES_URL ??= "postgres://mock:mock@localhost:5432/mock";
process.env.QDRANT_URL ??= "http://localhost:6333";
process.env.QDRANT_COLLECTION ??= "jurisprudencia";

const { buildApp } = await import("../app.js");
const app = await buildApp();

try {
  await app.ready();

  for (let index = 1; index <= 5; index += 1) {
    const response = await app.inject({ method: "GET", url: "/infra/health" });
    console.info(`simulate: request_${index} status=${response.statusCode}`);
  }

  console.info("simulate: completed 5 infra health requests");
} finally {
  await app.close();
}
