import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";

describe("health route", () => {
  const appPromise = buildApp();

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
  });

  it("returns ok status", async () => {
    const app = await appPromise;
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
