import { beforeEach, describe, expect, it, vi } from "vitest";
import { createJsonResponse, createTextResponse } from "../test/fetch-mocks";

async function importHttpModule(env?: { baseUrl?: string; authToken?: string }) {
  vi.resetModules();
  vi.unstubAllEnvs();

  if (env?.baseUrl !== undefined) {
    vi.stubEnv("VITE_BACKEND_URL", env.baseUrl);
  }
  if (env?.authToken !== undefined) {
    vi.stubEnv("VITE_AUTH_TOKEN", env.authToken);
  }

  return import("./http");
}

describe("services/http", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("uses the default backend URL and omits content-type without a body", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(createJsonResponse({ ok: true }));
    const mod = await importHttpModule();

    const result = await mod.http("/health");

    expect(result).toEqual({ ok: true });
    expect(mod.apiConfig.baseUrl).toBe("http://localhost:3000");
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3000/health",
      expect.objectContaining({
        headers: {}
      })
    );
  });

  it("adds auth and content-type headers while preserving caller headers", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(createJsonResponse({ id: 1 }));
    const mod = await importHttpModule({
      baseUrl: "https://api.example.test",
      authToken: "token-123"
    });

    await mod.http("/sessions", {
      method: "POST",
      body: JSON.stringify({ title: "x" }),
      headers: {
        "X-Trace": "abc"
      }
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.test/sessions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "x" }),
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token-123",
          "X-Trace": "abc"
        }
      })
    );
  });

  it("throws a formatted error when the response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createTextResponse("backend exploded", { status: 503, statusText: "Service Unavailable" })
    );
    const mod = await importHttpModule();

    await expect(mod.http("/sessions")).rejects.toThrow("Request failed (503): backend exploded");
  });

  it("falls back to status text when the error response body is empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(createTextResponse("", { status: 404, statusText: "Not Found" }));
    const mod = await importHttpModule();

    await expect(mod.http("/missing")).rejects.toThrow("Request failed (404): Not Found");
  });
});
