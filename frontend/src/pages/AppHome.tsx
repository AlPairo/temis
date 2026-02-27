import { useEffect, useRef, useState, type ReactNode } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, PanelsTopLeft, SlidersHorizontal, X } from "lucide-react";
import Button from "../components/ui/Button";
import Topbar from "../components/layout/Topbar";
import SessionList from "../components/SessionList";
import ChatView from "../components/ChatView";
import ConfigPanel from "../components/ConfigPanel";
import UserManagement from "../components/UserManagement";
import {
  deleteSession,
  getSession,
  listSessions,
  renameSession,
  type SessionListParams,
  type SessionSummary
} from "../services/sessions";
import { streamChat } from "../services/chat";
import type { ChatMessage } from "../types/chat";
import { usePermission } from "../hooks/usePermission";
import { FRONTEND_TEXT } from "../text";

const APP_HOME_TEXT = FRONTEND_TEXT.appHome;
const STREAM_PROGRESS_STEPS = APP_HOME_TEXT.streamProgressSteps;
const SERVICE_ERROR_MESSAGE = FRONTEND_TEXT.shared.serviceErrorMessage;
type MobilePanel = "chat" | "sessions" | "config";
type SnackbarState = { message: string; tone: "success" | "error" } | null;

export default function AppHome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => `local-${Date.now()}`);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("chat");
  const [sessionFilters, setSessionFilters] = useState<Required<Pick<SessionListParams, "includeDeleted" | "scope">>>({
    includeDeleted: false,
    scope: "mine"
  });
  const [analysisEnabledBySessionId, setAnalysisEnabledBySessionId] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [assistantDraft, setAssistantDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [userPanelOpen, setUserPanelOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<SnackbarState>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const progressTimeoutsRef = useRef<number[]>([]);
  const canSeeUserManagement = usePermission("users", "read");

  const { data: sessions, isFetching: sessionsFetching } = useQuery<SessionSummary[]>({
    queryKey: ["sessions", sessionFilters],
    queryFn: () => listSessions(sessionFilters)
  });

  const activeSessionSummary = sessions?.find((session) => session.session_id === activeSessionId);
  const canFetchActiveSession =
    Boolean(activeSessionId) &&
    (!activeSessionId?.startsWith("local-") ||
      Boolean(activeSessionSummary && (activeSessionSummary.turns > 0 || activeSessionSummary.last_message)));

  useEffect(() => {
    if (!sessions || !activeSessionId) {
      return;
    }
    if (activeSessionId.startsWith("local-") && !sessions.some((session) => session.session_id === activeSessionId)) {
      return;
    }
    if (!sessions.some((session) => session.session_id === activeSessionId)) {
      setActiveSessionId(sessions[0]?.session_id ?? null);
      if (sessions.length === 0) {
        setMessages([]);
        setAssistantDraft("");
      }
    }
  }, [sessions, activeSessionId]);

  const { data: sessionDetail } = useQuery({
    queryKey: ["session", activeSessionId, sessionFilters.includeDeleted],
    queryFn: () => getSession(activeSessionId!, { includeDeleted: sessionFilters.includeDeleted }),
    enabled: canFetchActiveSession
  });

  const activeSessionTitle =
    sessionDetail?.title?.trim() ||
    activeSessionSummary?.title?.trim() ||
    activeSessionSummary?.last_message?.trim() ||
    APP_HOME_TEXT.fallbackSessionTitle;
  const activeAnalysisEnabled = activeSessionId ? (analysisEnabledBySessionId[activeSessionId] ?? false) : false;

  useEffect(() => {
    if (sessionDetail) {
      setMessages(sessionDetail.history);
    }
  }, [sessionDetail]);

  useEffect(
    () => () => {
      for (const timeoutId of progressTimeoutsRef.current) {
        window.clearTimeout(timeoutId);
      }
      progressTimeoutsRef.current = [];
    },
    []
  );

  useEffect(() => {
    if (!userPanelOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUserPanelOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [userPanelOpen]);
  useEffect(() => {
    if (!snackbar) {
      return;
    }

    const timeoutId = window.setTimeout(() => setSnackbar(null), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [snackbar]);

  const stopProgressUpdates = () => {
    for (const timeoutId of progressTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }
    progressTimeoutsRef.current = [];
  };

  const startProgressUpdates = () => {
    stopProgressUpdates();
    progressTimeoutsRef.current = STREAM_PROGRESS_STEPS.map(({ delayMs, text }) =>
      window.setTimeout(() => {
        setAssistantDraft(text);
      }, delayMs)
    );
  };

  const pushAssistantErrorMessage = (message?: string) => {
    const content = message?.trim() || SERVICE_ERROR_MESSAGE;
    setAssistantDraft("");
    setMessages((prev) => [...prev, { role: "assistant", content }]);
  };

  const showSnackbar = (message: string, tone: "success" | "error" = "success") => {
    setSnackbar({ message, tone });
  };

  const handleCreateNew = () => {
    const newId = `local-${Date.now()}`;
    setActiveSessionId(newId);
    setMobilePanel("chat");
    setMessages([]);
    setAssistantDraft("");
  };

  const handleSelect = (id: string) => {
    setActiveSessionId(id);
    setMobilePanel("chat");
    queryClient.invalidateQueries({ queryKey: ["session", id] });
  };

  const handleToggleAnalysis = (next: boolean) => {
    const sessionId = activeSessionId ?? `local-${Date.now()}`;
    if (!activeSessionId) {
      setActiveSessionId(sessionId);
    }
    setAnalysisEnabledBySessionId((prev) => ({
      ...prev,
      [sessionId]: next
    }));
  };

  const refreshSessions = () => {
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
  };

  const handleSend = async (text: string) => {
    const sessionId = activeSessionId ?? `local-${Date.now()}`;
    const analysisEnabled = analysisEnabledBySessionId[sessionId] ?? false;
    if (!activeSessionId) {
      setActiveSessionId(sessionId);
      setMessages([]);
    }

    queryClient.setQueryData<SessionSummary[] | undefined>(["sessions", sessionFilters], (prev) => {
      const next = prev ? [...prev] : [];
      if (!next.find((s) => s.session_id === sessionId)) {
        next.unshift({
          session_id: sessionId,
          title: null,
          turns: 0,
          last_message: null,
          is_deleted: false,
          deleted_at: null,
          owner_user_id: null,
          can_rename: true,
          can_delete: true
        });
      }
      return next;
    });

    setMessages((prev) => [...prev, { role: "user" as const, content: text }]);
    setAssistantDraft("");
    setStreaming(true);
    stopProgressUpdates();
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();

    try {
      let receivedToken = false;
      await streamChat(
        { sessionId, message: text, analysisEnabled },
        {
          onStart: () => startProgressUpdates(),
          onMeta: ({ sessionTitle }) => {
            if (!sessionTitle) return;
            queryClient.setQueryData<SessionSummary[] | undefined>(["sessions", sessionFilters], (prev) =>
              (prev ?? []).map((s) => (s.session_id === sessionId ? { ...s, title: sessionTitle } : s))
            );
          },
          onToken: (token) => {
            if (!receivedToken) {
              receivedToken = true;
              stopProgressUpdates();
              setAssistantDraft(token);
              return;
            }
            setAssistantDraft((prev) => prev + token);
          },
          onEnd: ({ content, citations, lowConfidence }) => {
            stopProgressUpdates();
            setMessages((prev) => [...prev, { role: "assistant", content, citations, lowConfidence }]);
            setAssistantDraft("");
            setStreaming(false);
            queryClient.invalidateQueries({ queryKey: ["sessions"] });
            queryClient.setQueryData<SessionSummary[] | undefined>(["sessions", sessionFilters], (prev) =>
              (prev ?? []).map((s) =>
                s.session_id === sessionId ? { ...s, turns: (s.turns ?? 0) + 1, last_message: text } : s
              )
            );
          },
          onError: (error) => {
            stopProgressUpdates();
            pushAssistantErrorMessage(error);
            setStreaming(false);
            queryClient.invalidateQueries({ queryKey: ["sessions"] });
          }
        },
        controllerRef.current.signal
      );
    } catch (error) {
      stopProgressUpdates();
      pushAssistantErrorMessage(error instanceof Error ? error.message : SERVICE_ERROR_MESSAGE);
      setStreaming(false);
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    }
  };

  const handleAbort = () => {
    controllerRef.current?.abort();
    stopProgressUpdates();
    setAssistantDraft("");
    setStreaming(false);
  };

  const handleRenameSession = async (sessionId: string, title: string) => {
    try {
      await renameSession(sessionId, title);
      refreshSessions();
    } catch {
      showSnackbar(APP_HOME_TEXT.sessionMessages.renameSnackbarError, "error");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: APP_HOME_TEXT.sessionMessages.renameAssistantError }
      ]);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    const sessionToDelete = sessions?.find((session) => session.session_id === sessionId);
    const isUnsavedLocalDraft =
      sessionId.startsWith("local-") &&
      Boolean(sessionToDelete) &&
      (sessionToDelete?.turns ?? 0) === 0 &&
      !sessionToDelete?.last_message;

    if (isUnsavedLocalDraft) {
      queryClient.setQueryData<SessionSummary[] | undefined>(["sessions", sessionFilters], (prev) =>
        (prev ?? []).filter((session) => session.session_id !== sessionId)
      );
      if (activeSessionId === sessionId) {
        controllerRef.current?.abort();
        stopProgressUpdates();
        setStreaming(false);
        setActiveSessionId(`local-${Date.now()}`);
        setMessages([]);
        setAssistantDraft("");
      }
      showSnackbar(APP_HOME_TEXT.sessionMessages.deleteSuccess);
      return;
    }

    try {
      await deleteSession(sessionId);
      if (activeSessionId === sessionId) {
        setActiveSessionId(`local-${Date.now()}`);
        setMessages([]);
        setAssistantDraft("");
      }
      refreshSessions();
      showSnackbar(APP_HOME_TEXT.sessionMessages.deleteSuccess);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: APP_HOME_TEXT.sessionMessages.deleteAssistantError }
      ]);
    }
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Topbar onSignOut={() => navigate("/")} onOpenUserPanel={() => setUserPanelOpen(true)} />
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="flex h-full flex-col md:hidden">
          <div className="border-b border-[var(--color-border-subtle)] bg-white px-3 py-2">
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#eef1f6] p-1">
              <MobileNavButton
                active={mobilePanel === "sessions"}
                icon={<PanelsTopLeft size={15} />}
                label={APP_HOME_TEXT.mobileNav.sessions}
                onClick={() => setMobilePanel("sessions")}
              />
              <MobileNavButton
                active={mobilePanel === "chat"}
                icon={<MessageSquare size={15} />}
                label={APP_HOME_TEXT.mobileNav.chat}
                onClick={() => setMobilePanel("chat")}
              />
              <MobileNavButton
                active={mobilePanel === "config"}
                icon={<SlidersHorizontal size={15} />}
                label={APP_HOME_TEXT.mobileNav.config}
                onClick={() => setMobilePanel("config")}
              />
            </div>
          </div>
          <div className="flex-1 min-h-0">
            {mobilePanel === "sessions" ? (
              <SessionList
                activeSessionId={activeSessionId}
                sessions={sessions}
                isFetching={sessionsFetching}
                filters={sessionFilters}
                onChangeFilters={setSessionFilters}
                onRefresh={refreshSessions}
                onSelect={handleSelect}
                onCreateNew={handleCreateNew}
                onRenameSession={handleRenameSession}
                onDeleteSession={handleDeleteSession}
              />
            ) : null}

            {mobilePanel === "chat" ? (
              <div className="h-full overflow-hidden p-3">
                <ChatView
                  sessionId={activeSessionId}
                  sessionTitle={activeSessionTitle}
                  messages={messages}
                  streaming={streaming}
                  assistantDraft={assistantDraft}
                  analysisEnabled={activeAnalysisEnabled}
                  onToggleAnalysis={handleToggleAnalysis}
                  onSend={handleSend}
                  onAbort={handleAbort}
                />
              </div>
            ) : null}

            {mobilePanel === "config" ? (
              <div className="h-full overflow-y-auto">
                <ConfigPanel />
                {canSeeUserManagement ? (
                  <div className="px-4 pb-4">
                    <UserManagement />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="hidden h-full min-h-0 overflow-hidden md:grid md:grid-cols-[340px_1fr]">
          <SessionList
            activeSessionId={activeSessionId}
            sessions={sessions}
            isFetching={sessionsFetching}
            filters={sessionFilters}
            onChangeFilters={setSessionFilters}
            onRefresh={refreshSessions}
            onSelect={handleSelect}
            onCreateNew={handleCreateNew}
            onRenameSession={handleRenameSession}
            onDeleteSession={handleDeleteSession}
          />
          <div className="min-h-0 overflow-hidden p-4 md:p-6">
            <ChatView
              sessionId={activeSessionId}
              sessionTitle={activeSessionTitle}
              messages={messages}
              streaming={streaming}
              assistantDraft={assistantDraft}
              analysisEnabled={activeAnalysisEnabled}
              onToggleAnalysis={handleToggleAnalysis}
              onSend={handleSend}
              onAbort={handleAbort}
            />
          </div>
        </div>
      </div>
      {userPanelOpen ? (
        <div
          className="fixed inset-0 z-50 hidden md:block"
          role="dialog"
          aria-modal="true"
          aria-label={APP_HOME_TEXT.userPanel.dialogAriaLabel}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label={APP_HOME_TEXT.userPanel.overlayCloseAriaLabel}
            onClick={() => setUserPanelOpen(false)}
          />
          <aside className="absolute right-0 top-0 h-dvh w-[360px] max-w-[92vw] overflow-y-auto border-l border-[var(--color-border-subtle)] bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-white px-4 py-3">
              <div>
                <p className="text-xs text-[var(--color-ink-soft)]">{APP_HOME_TEXT.userPanel.headingEyebrow}</p>
                <h2 className="text-sm font-semibold text-[var(--color-ink)]">{APP_HOME_TEXT.userPanel.headingTitle}</h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={APP_HOME_TEXT.userPanel.closeButtonAriaLabel}
                onClick={() => setUserPanelOpen(false)}
              >
                <X size={16} />
              </Button>
            </div>
            <ConfigPanel />
            {canSeeUserManagement ? (
              <div className="px-4 pb-4">
                <UserManagement />
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
      {snackbar ? (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 px-4">
          <div
            role="status"
            aria-live="polite"
            className={
              snackbar.tone === "success"
                ? "rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 shadow-lg"
                : "rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 shadow-lg"
            }
          >
            {snackbar.message}
          </div>
        </div>
      ) : null}
      <Outlet />
    </div>
  );
}

function MobileNavButton({
  active,
  label,
  icon,
  onClick
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "flex items-center justify-center gap-1 rounded-lg bg-white px-2 py-2 text-xs font-medium text-[var(--color-ink)] shadow-sm"
          : "flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-[var(--color-ink-soft)]"
      }
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

