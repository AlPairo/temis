import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatView from "./ChatView";

const chatViewMocks = vi.hoisted(() => ({
  downloadDocumentFile: vi.fn(),
  resolveDocumentLink: vi.fn()
}));

vi.mock("./MarkdownContent", () => ({
  default: ({ content }: { content: string }) => <div data-testid="markdown-content">{content}</div>
}));

vi.mock("../services/documents", () => ({
  downloadDocumentFile: (...args: unknown[]) => chatViewMocks.downloadDocumentFile(...args),
  resolveDocumentLink: (...args: unknown[]) => chatViewMocks.resolveDocumentLink(...args)
}));

describe("components/ChatView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatViewMocks.downloadDocumentFile.mockResolvedValue(undefined);
  });

  it("renders the session title, messages and assistant draft", () => {
    render(
      <ChatView
        sessionId="sess-1"
        sessionTitle="Titulo demo"
        messages={[
          { role: "user", content: "Hola" },
          { role: "assistant", content: "Respuesta" }
        ]}
        streaming={false}
        assistantDraft="borrador"
        analysisEnabled={false}
        onToggleAnalysis={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
      />
    );

    expect(screen.getByText(/Sesión: Titulo demo/i)).toBeInTheDocument();
    expect(screen.getByText("Hola")).toBeInTheDocument();
    expect(screen.getByText("Respuesta")).toBeInTheDocument();
    expect(screen.getByText("borrador |")).toBeInTheDocument();
  });

  it("renders assistant references, low-confidence badge, and deduped referenced documents", () => {
    render(
      <ChatView
        sessionId="sess-1"
        messages={[
          {
            role: "assistant",
            content: "Respuesta con fuentes",
            lowConfidence: true,
            citations: [
              { id: "cita-1", doc_id: "doc-9", chunk_id: "ch-2", score: 0.812, source: "jurisprudencia" },
              { id: "cita-2", doc_id: "doc-9", chunk_id: "ch-3", score: 0.701, source: "jurisprudencia" }
            ]
          }
        ]}
        streaming={false}
        analysisEnabled={false}
        onToggleAnalysis={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
      />
    );

    expect(screen.getByText("Referencias")).toBeInTheDocument();
    expect(screen.getByText(/Documentos referenciados/i)).toBeInTheDocument();
    expect(screen.getByText("Baja confianza")).toBeInTheDocument();
    expect(screen.queryByText("cita-1")).not.toBeInTheDocument();
    expect(screen.queryByText(/doc-9 \/ ch-2/i)).not.toBeInTheDocument();
    expect(screen.getByText("doc-9")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Descargar documento/i })).toBeInTheDocument();
  });

  it("renders reasoning trace collapsed for completed assistant messages", async () => {
    const user = userEvent.setup();
    render(
      <ChatView
        sessionId="sess-1"
        messages={[
          {
            role: "assistant",
            content: "Respuesta analitica",
            reasoningTrace: [
              {
                step: "Recuperacion completada",
                detail: "chunks=2",
                stage: "retrieval_completed",
                ts: "2026-02-27T00:00:00.000Z"
              }
            ]
          }
        ]}
        streaming={false}
        analysisEnabled={false}
        onToggleAnalysis={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
      />
    );

    expect(screen.getByText("Razonamiento")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mostrar/i })).toBeInTheDocument();
    expect(screen.queryByText("Recuperacion completada")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Mostrar/i }));
    expect(screen.getByText("Recuperacion completada")).toBeInTheDocument();
    expect(screen.getByText("chunks=2")).toBeInTheDocument();
  });

  it("renders streaming reasoning trace expanded by default", () => {
    render(
      <ChatView
        sessionId="sess-1"
        messages={[]}
        streaming
        assistantReasoningDraft={[
          {
            step: "Generacion iniciada",
            stage: "model_generation_started",
            ts: "2026-02-27T00:00:00.000Z"
          }
        ]}
        analysisEnabled
        onToggleAnalysis={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
      />
    );

    expect(screen.getByText("Razonamiento")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ocultar/i })).toBeInTheDocument();
    expect(screen.getByText("Generacion iniciada")).toBeInTheDocument();
  });

  it("opens a referenced document via the resolver service", async () => {
    const user = userEvent.setup();
    render(
      <ChatView
        sessionId="sess-1"
        messages={[
          {
            role: "assistant",
            content: "Respuesta con fuentes",
            citations: [{ id: "cita-1", doc_id: "doc-9", chunk_id: "ch-2" }]
          }
        ]}
        streaming={false}
        analysisEnabled={false}
        onToggleAnalysis={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /Descargar documento/i }));

    await waitFor(() => {
      expect(chatViewMocks.downloadDocumentFile).toHaveBeenCalledWith("doc-9");
    });
  });

  it("shows an inline error when document resolution fails", async () => {
    const user = userEvent.setup();
    chatViewMocks.downloadDocumentFile.mockRejectedValue(new Error("not found"));
    chatViewMocks.resolveDocumentLink.mockRejectedValue(new Error("not found"));

    render(
      <ChatView
        sessionId="sess-1"
        messages={[
          {
            role: "assistant",
            content: "Respuesta con fuentes",
            citations: [{ id: "cita-1", doc_id: "doc-9", chunk_id: "ch-2" }]
          }
        ]}
        streaming={false}
        analysisEnabled={false}
        onToggleAnalysis={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /Descargar documento/i }));

    await waitFor(() => {
      expect(screen.getByText(/Documento no disponible/i)).toBeInTheDocument();
    });
  });

  it("falls back to resolve+open when direct download fails", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    chatViewMocks.downloadDocumentFile.mockRejectedValue(new Error("download failed"));
    chatViewMocks.resolveDocumentLink.mockResolvedValue({
      doc_id: "doc-9",
      url: "https://example.test/doc-9.pdf"
    });

    render(
      <ChatView
        sessionId="sess-1"
        messages={[
          {
            role: "assistant",
            content: "Respuesta con fuentes",
            citations: [{ id: "cita-1", doc_id: "doc-9", chunk_id: "ch-2" }]
          }
        ]}
        streaming={false}
        analysisEnabled={false}
        onToggleAnalysis={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /Descargar documento/i }));

    await waitFor(() => {
      expect(chatViewMocks.downloadDocumentFile).toHaveBeenCalledWith("doc-9");
      expect(chatViewMocks.resolveDocumentLink).toHaveBeenCalledWith("doc-9");
      expect(openSpy).toHaveBeenCalledWith("https://example.test/doc-9.pdf", "_blank", "noopener,noreferrer");
    });
  });

  it("submits trimmed text on button click", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    render(
      <ChatView
        sessionId="sess-1"
        messages={[]}
        streaming={false}
        analysisEnabled={false}
        onToggleAnalysis={vi.fn()}
        onSend={onSend}
        onAbort={vi.fn()}
      />
    );

    await user.type(screen.getByPlaceholderText(/Escribe tu consulta legal/i), "  consulta legal  ");
    await user.click(screen.getByRole("button", { name: /Enviar/i }));

    expect(onSend).toHaveBeenCalledWith("consulta legal");
  });

  it("submits on Enter and does not submit on Shift+Enter", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    render(
      <ChatView
        sessionId="sess-1"
        messages={[]}
        streaming={false}
        analysisEnabled={false}
        onToggleAnalysis={vi.fn()}
        onSend={onSend}
        onAbort={vi.fn()}
      />
    );

    const textarea = screen.getByPlaceholderText(/Escribe tu consulta legal/i);
    await user.type(textarea, "hola");
    await user.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("hola");

    onSend.mockClear();
    await user.type(textarea, "otra");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("otra\n");
  });

  it("shows cancel while streaming and calls onAbort", async () => {
    const user = userEvent.setup();
    const onAbort = vi.fn();

    render(
      <ChatView
        sessionId="sess-1"
        messages={[]}
        streaming
        analysisEnabled={false}
        onToggleAnalysis={vi.fn()}
        onSend={vi.fn()}
        onAbort={onAbort}
      />
    );

    await user.click(screen.getByRole("button", { name: /Cancelar/i }));
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Respondiendo/i })).toBeInTheDocument();
  });

  it("toggles the session id badge", async () => {
    const user = userEvent.setup();

    render(
      <ChatView
        sessionId="sess-xyz"
        messages={[]}
        streaming={false}
        analysisEnabled={false}
        onToggleAnalysis={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
      />
    );

    expect(screen.queryByText("sess-xyz")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Ver ID de sesi[oó]n/i }));
    expect(screen.getByText("sess-xyz")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Ver ID de sesi[oó]n/i }));
    expect(screen.queryByText("sess-xyz")).not.toBeInTheDocument();
  });

  it("renders and toggles analysis mode, and disables it while streaming", async () => {
    const user = userEvent.setup();
    const onToggleAnalysis = vi.fn();
    const { rerender } = render(
      <ChatView
        sessionId="sess-1"
        messages={[]}
        streaming={false}
        analysisEnabled={false}
        onToggleAnalysis={onToggleAnalysis}
        onSend={vi.fn()}
        onAbort={vi.fn()}
      />
    );

    const toggle = screen.getByRole("checkbox", { name: /An[aá]lisis|Analizar|Analysis/i });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(onToggleAnalysis).toHaveBeenCalledWith(true);

    rerender(
      <ChatView
        sessionId="sess-1"
        messages={[]}
        streaming
        analysisEnabled
        onToggleAnalysis={onToggleAnalysis}
        onSend={vi.fn()}
        onAbort={vi.fn()}
      />
    );
    expect(screen.getByRole("checkbox", { name: /An[aá]lisis|Analizar|Analysis/i })).toBeDisabled();
  });
});
