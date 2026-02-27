import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/render";
import { makeSessionDetail, makeSessionSummary } from "../test/factories";

const appHomeMocks = vi.hoisted(() => ({
  listSessions: vi.fn(),
  getSession: vi.fn(),
  renameSession: vi.fn(),
  deleteSession: vi.fn(),
  streamChat: vi.fn(),
  usePermission: vi.fn(),
  sessionListPropsHistory: [] as any[],
  chatViewPropsHistory: [] as any[]
}));

vi.mock("../components/layout/Topbar", () => ({
  default: ({ onSignOut, onOpenUserPanel }: { onSignOut: () => void; onOpenUserPanel: () => void }) => (
    <div>
      <button onClick={onSignOut}>signout</button>
      <button onClick={onOpenUserPanel}>open-user-panel</button>
    </div>
  )
}));

vi.mock("../components/ConfigPanel", () => ({
  default: () => <div data-testid="config-panel" />
}));

vi.mock("../components/UserManagement", () => ({
  default: () => <div data-testid="user-management" />
}));

vi.mock("../components/SessionList", () => ({
  default: (props: any) => {
    appHomeMocks.sessionListPropsHistory.push(props);
    return <div data-testid="session-list-mock" />;
  }
}));

vi.mock("../components/ChatView", () => ({
  default: (props: any) => {
    appHomeMocks.chatViewPropsHistory.push(props);
    return <div data-testid="chat-view-mock" />;
  }
}));

vi.mock("../hooks/usePermission", () => ({
  usePermission: (...args: any[]) => appHomeMocks.usePermission(...args)
}));

vi.mock("../services/sessions", () => ({
  listSessions: (...args: any[]) => appHomeMocks.listSessions(...args),
  getSession: (...args: any[]) => appHomeMocks.getSession(...args),
  renameSession: (...args: any[]) => appHomeMocks.renameSession(...args),
  deleteSession: (...args: any[]) => appHomeMocks.deleteSession(...args)
}));

vi.mock("../services/chat", () => ({
  streamChat: (...args: any[]) => appHomeMocks.streamChat(...args)
}));

import AppHome from "./AppHome";

const lastSessionListProps = () => appHomeMocks.sessionListPropsHistory.at(-1);
const lastChatViewProps = () => appHomeMocks.chatViewPropsHistory.at(-1);

describe("pages/AppHome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appHomeMocks.sessionListPropsHistory.length = 0;
    appHomeMocks.chatViewPropsHistory.length = 0;
    appHomeMocks.usePermission.mockReturnValue(false);
    appHomeMocks.listSessions.mockResolvedValue([]);
    appHomeMocks.getSession.mockResolvedValue(makeSessionDetail({ session_id: "unused", history: [] }));
    appHomeMocks.renameSession.mockResolvedValue(undefined);
    appHomeMocks.deleteSession.mockResolvedValue({ deleted: true });
    appHomeMocks.streamChat.mockResolvedValue(undefined);
  });

  it("loads sessions and hydrates chat messages after selecting a session", async () => {
    const session = makeSessionSummary({
      session_id: "s-1",
      title: "Sesion remota",
      turns: 2,
      last_message: "ultimo"
    });
    const detail = makeSessionDetail({
      session_id: "s-1",
      title: "Sesion remota",
      history: [
        { role: "user", content: "Pregunta" },
        { role: "assistant", content: "Respuesta" }
      ]
    });
    appHomeMocks.listSessions.mockResolvedValue([session]);
    appHomeMocks.getSession.mockResolvedValue(detail);

    renderWithProviders(<AppHome />, { route: "/app" });

    await waitFor(() =>
      expect(appHomeMocks.listSessions).toHaveBeenCalledWith({
        includeDeleted: false,
        scope: "mine"
      })
    );
    await waitFor(() => expect(lastSessionListProps()?.sessions).toEqual([session]));

    act(() => {
      lastSessionListProps().onSelect("s-1");
    });

    await waitFor(() =>
      expect(appHomeMocks.getSession).toHaveBeenCalledWith("s-1", {
        includeDeleted: false
      })
    );
    await waitFor(() => expect(lastChatViewProps().messages).toEqual(detail.history));
    expect(lastChatViewProps().sessionTitle).toBe("Sesion remota");
  });

  it("sends a message and commits the streamed assistant response", async () => {
    appHomeMocks.streamChat.mockImplementation(async (_input: any, handlers: any) => {
      handlers.onStart?.();
      handlers.onMeta?.({ sessionTitle: "Titulo sugerido" });
      handlers.onToken?.("Hola ");
      handlers.onToken?.("mundo");
      handlers.onEnd?.({
        content: "Hola mundo",
        messageId: "m-1",
        citations: [{ id: "d1:c1", doc_id: "d1", chunk_id: "c1", score: 0.8 }],
        lowConfidence: false
      });
    });

    renderWithProviders(<AppHome />, { route: "/app" });

    await waitFor(() => expect(lastChatViewProps()).toBeTruthy());

    await act(async () => {
      await lastChatViewProps().onSend("consulta");
    });

    expect(appHomeMocks.streamChat).toHaveBeenCalledTimes(1);
    expect(appHomeMocks.streamChat.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        message: "consulta",
        sessionId: expect.stringMatching(/^local-/),
        analysisEnabled: false
      })
    );
    expect(appHomeMocks.streamChat.mock.calls[0]?.[2]).toBeInstanceOf(AbortSignal);

    await waitFor(() => {
      const props = lastChatViewProps();
      expect(props.streaming).toBe(false);
      expect(props.assistantDraft).toBe("");
      expect(props.messages).toEqual([
        { role: "user", content: "consulta" },
        {
          role: "assistant",
          content: "Hola mundo",
          citations: [{ id: "d1:c1", doc_id: "d1", chunk_id: "c1", score: 0.8 }],
          lowConfidence: false
        }
      ]);
    });
  });

  it("appends an assistant error message when streaming fails", async () => {
    appHomeMocks.streamChat.mockImplementation(async (_input: any, handlers: any) => {
      handlers.onStart?.();
      handlers.onError?.("fallo controlado");
    });

    renderWithProviders(<AppHome />, { route: "/app" });

    await waitFor(() => expect(lastChatViewProps()).toBeTruthy());

    await act(async () => {
      await lastChatViewProps().onSend("consulta");
    });

    await waitFor(() => {
      const props = lastChatViewProps();
      expect(props.streaming).toBe(false);
      expect(props.assistantDraft).toBe("");
      expect(props.messages).toEqual([
        { role: "user", content: "consulta" },
        { role: "assistant", content: "fallo controlado" }
      ]);
    });
  });

  it("tracks Analysis mode per session and passes it to streamChat", async () => {
    const sessionA = makeSessionSummary({ session_id: "s-a", title: "A" });
    const sessionB = makeSessionSummary({ session_id: "s-b", title: "B" });
    appHomeMocks.listSessions.mockResolvedValue([sessionA, sessionB]);
    appHomeMocks.getSession.mockResolvedValue(makeSessionDetail({ session_id: "s-a", history: [] }));
    appHomeMocks.streamChat.mockImplementation(async (_input: any, handlers: any) => {
      handlers.onStart?.();
      handlers.onEnd?.({ content: "ok" });
    });

    renderWithProviders(<AppHome />, { route: "/app" });

    await waitFor(() => expect(lastChatViewProps()).toBeTruthy());
    expect(lastChatViewProps().analysisEnabled).toBe(false);

    act(() => {
      lastSessionListProps().onSelect("s-a");
    });
    await waitFor(() => expect(lastChatViewProps().analysisEnabled).toBe(false));

    act(() => {
      lastChatViewProps().onToggleAnalysis(true);
    });
    await waitFor(() => expect(lastChatViewProps().analysisEnabled).toBe(true));

    await act(async () => {
      await lastChatViewProps().onSend("consulta A");
    });
    expect(appHomeMocks.streamChat.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ sessionId: "s-a", analysisEnabled: true })
    );

    act(() => {
      lastSessionListProps().onSelect("s-b");
    });
    await waitFor(() => expect(lastChatViewProps().analysisEnabled).toBe(false));

    act(() => {
      lastChatViewProps().onToggleAnalysis(true);
    });
    await waitFor(() => expect(lastChatViewProps().analysisEnabled).toBe(true));

    act(() => {
      lastSessionListProps().onSelect("s-a");
    });
    await waitFor(() => expect(lastChatViewProps().analysisEnabled).toBe(true));
  });

  it("deletes local unsaved drafts without calling the delete session service", async () => {
    const { queryClient } = renderWithProviders(<AppHome />, { route: "/app" });

    await waitFor(() => expect(lastSessionListProps()).toBeTruthy());

    const localId = String(lastSessionListProps().activeSessionId);
    act(() => {
      queryClient.setQueryData(
        ["sessions", { includeDeleted: false, scope: "mine" }],
        [
          makeSessionSummary({
            session_id: localId,
            title: null,
            turns: 0,
            last_message: null
          })
        ]
      );
    });

    await waitFor(() => expect(lastSessionListProps().sessions).toHaveLength(1));

    await act(async () => {
      await lastSessionListProps().onDeleteSession(localId);
    });

    expect(appHomeMocks.deleteSession).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(lastSessionListProps().activeSessionId).not.toBe(localId);
      expect(String(lastSessionListProps().activeSessionId)).toMatch(/^local-/);
    });
  });
});
