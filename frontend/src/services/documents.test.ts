import { beforeEach, describe, expect, it, vi } from "vitest";

describe("services/documents", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    if (!("createObjectURL" in URL)) {
      Object.defineProperty(URL, "createObjectURL", {
        value: vi.fn(),
        writable: true,
        configurable: true
      });
    }

    if (!("revokeObjectURL" in URL)) {
      Object.defineProperty(URL, "revokeObjectURL", {
        value: vi.fn(),
        writable: true,
        configurable: true
      });
    }
  });

  it("resolves document links through the backend endpoint using encoded doc ids", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ doc_id: "doc 1/abc", url: "https://example.test/doc-1.pdf" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const { resolveDocumentLink } = await import("./documents");
    const result = await resolveDocumentLink("doc 1/abc");

    expect(result).toEqual({
      doc_id: "doc 1/abc",
      url: "https://example.test/doc-1.pdf"
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3000/documents/doc%201%2Fabc/resolve",
      expect.any(Object)
    );
  });

  it("downloads a document file from the backend download endpoint", async () => {
    const blob = new Blob(["pdf-bytes"], { type: "application/pdf" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(blob, {
        status: 200,
        headers: {
          "Content-Disposition": `attachment; filename="doc-1.pdf"`
        }
      })
    );
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    const { downloadDocumentFile } = await import("./documents");
    await downloadDocumentFile("doc-1");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3000/documents/doc-1/download",
      expect.any(Object)
    );
    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("does not duplicate the extension when content-disposition is unavailable", async () => {
    const blob = new Blob(["pdf-bytes"], { type: "application/pdf" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(blob, { status: 200 }));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const createdAnchors: HTMLAnchorElement[] = [];
    const createElementSpy = vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      const element = document.createElementNS("http://www.w3.org/1999/xhtml", tagName);
      if (tagName.toLowerCase() === "a") {
        vi.spyOn(element as HTMLAnchorElement, "click").mockImplementation(() => undefined);
        createdAnchors.push(element as HTMLAnchorElement);
      }
      return element as HTMLElement;
    }) as typeof document.createElement);

    const { downloadDocumentFile } = await import("./documents");
    await downloadDocumentFile("doc-1.pdf");

    expect(createElementSpy).toHaveBeenCalledWith("a");
    expect(createdAnchors[0]?.download).toBe("doc-1.pdf");
  });
});
