import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Send, Loader2, ShieldCheck, Info } from "lucide-react";
import Textarea from "./ui/Textarea";
import Button from "./ui/Button";
import MarkdownContent from "./MarkdownContent";
import { cn } from "../utils/cn";
import type { ChatCitation, ChatMessage } from "../types/chat";
import { FRONTEND_TEXT } from "../text";
import { downloadDocumentFile, resolveDocumentLink } from "../services/documents";

type Props = {
  sessionId: string | null;
  sessionTitle?: string | null;
  messages: ChatMessage[];
  streaming: boolean;
  assistantDraft?: string;
  analysisEnabled: boolean;
  onToggleAnalysis: (next: boolean) => void;
  onSend: (text: string) => void;
  onAbort: () => void;
};

type ReferencedDocument = {
  docId: string;
  source?: string;
};

export default function ChatView({
  sessionId,
  sessionTitle,
  messages,
  streaming,
  assistantDraft,
  analysisEnabled,
  onToggleAnalysis,
  onSend,
  onAbort
}: Props) {
  const [text, setText] = useState("");
  const [showSessionId, setShowSessionId] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const uiText = FRONTEND_TEXT.chatView;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, assistantDraft]);

  useEffect(() => {
    setShowSessionId(false);
  }, [sessionId]);

  const submitCurrentText = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitCurrentText();
  };

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    if (event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    submitCurrentText();
  };

  const sessionLabelTitle = sessionTitle?.trim() || uiText.newSessionTitle;
  const sessionIdTitle = sessionId ? `${uiText.sessionIdTitlePrefix}${sessionId}` : uiText.sessionIdMissingTitle;
  const sessionIdAria = sessionId ? `${uiText.sessionIdShowAriaPrefix}${sessionId}` : uiText.sessionIdMissingAria;

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 md:gap-4">
      <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-border-subtle)] bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex min-w-0 items-center gap-2 text-sm text-[var(--color-ink-soft)]">
          <ShieldCheck size={16} className="text-[var(--color-accent)]" />
          <span className="truncate">
            {uiText.sessionPrefix}
            {sessionLabelTitle}
          </span>
        </div>
        <div className="flex items-center gap-1 self-start sm:self-auto">
          {showSessionId && sessionId ? (
            <span className="max-w-[42ch] truncate rounded-md border border-[var(--color-border-subtle)] bg-[#f6f8fb] px-2 py-1 text-xs text-[var(--color-ink)]">
              {sessionId}
            </span>
          ) : null}
          <button
            type="button"
            disabled={!sessionId}
            title={sessionIdTitle}
            aria-label={sessionIdAria}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-ink-soft)] transition hover:bg-[var(--color-border-subtle)] hover:text-[var(--color-ink)] disabled:cursor-default disabled:opacity-50"
            onClick={() => setShowSessionId((prev) => !prev)}
          >
            <Info size={14} />
          </button>
          {streaming ? (
            <Button variant="ghost" size="sm" onClick={onAbort}>
              {uiText.cancel}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 min-h-0 space-y-3 overflow-y-auto rounded-lg border border-[var(--color-border-subtle)] bg-white p-3 md:p-4">
        {messages.map((msg, idx) => (
          <MessageBubble key={idx} message={msg} />
        ))}
        {assistantDraft ? <MessageBubble message={{ role: "assistant", content: assistantDraft + " |" }} /> : null}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Textarea
          placeholder={uiText.textareaPlaceholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          disabled={streaming}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border-subtle)] bg-[#f6f8fb] px-2 py-1 text-xs text-[var(--color-ink)]">
            <span>{uiText.analysisLabel}</span>
            <input
              type="checkbox"
              aria-label={uiText.analysisLabel}
              checked={analysisEnabled}
              disabled={streaming}
              onChange={(event) => onToggleAnalysis(event.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--color-accent)]"
            />
          </label>
          <div className="flex justify-end">
            <Button type="submit" disabled={!sessionId && !text} size="md" className="w-full sm:w-auto">
              {streaming ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              {streaming ? uiText.sending : uiText.send}
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const hasReferences = !isUser && ((message.citations?.length ?? 0) > 0 || message.lowConfidence);
  return (
    <div
      className={cn(
        "max-w-[88%] break-words rounded-2xl px-4 py-3 text-sm shadow-sm sm:max-w-[75%]",
        isUser
          ? "ml-auto bg-[var(--color-accent)] text-white"
          : "mr-auto border border-[var(--color-border-subtle)] bg-[#eef1f6] text-[var(--color-ink)]"
      )}
    >
      {isUser ? (
        message.content
      ) : (
        <div className="space-y-3">
          <MarkdownContent content={message.content} className="space-y-2 text-sm leading-6" />
          {hasReferences ? <MessageReferences citations={message.citations} lowConfidence={message.lowConfidence} /> : null}
        </div>
      )}
    </div>
  );
}

const buildReferencedDocuments = (citations?: ChatCitation[]): ReferencedDocument[] => {
  const byDocId = new Map<string, ReferencedDocument>();
  for (const citation of citations ?? []) {
    if (!citation.doc_id) {
      continue;
    }
    const current = byDocId.get(citation.doc_id);
    if (current) {
      if (!current.source && citation.source) {
        current.source = citation.source;
      }
      continue;
    }
    byDocId.set(citation.doc_id, {
      docId: citation.doc_id,
      source: citation.source
    });
  }
  return Array.from(byDocId.values());
};

function MessageReferences({
  citations,
  lowConfidence
}: {
  citations?: ChatCitation[];
  lowConfidence?: boolean;
}) {
  const text = FRONTEND_TEXT.chatView;
  const referencedDocuments = buildReferencedDocuments(citations);
  const [resolvingDocId, setResolvingDocId] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);

  const handleOpenDocument = async (docId: string) => {
    setDocumentError(null);
    setResolvingDocId(docId);

    try {
      try {
        await downloadDocumentFile(docId);
      } catch {
        const resolved = await resolveDocumentLink(docId);
        if (!resolved.url || typeof resolved.url !== "string") {
          throw new Error("missing url");
        }
        window.open(resolved.url, "_blank", "noopener,noreferrer");
      }
    } catch {
      setDocumentError(text.documentUnavailableMessage);
    } finally {
      setResolvingDocId((current) => (current === docId ? null : current));
    }
  };

  return (
    <div className="rounded-xl border border-[var(--color-border-subtle)] bg-white/80 px-3 py-2 text-xs text-[var(--color-ink-soft)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium text-[var(--color-ink)]">{text.referencesTitle}</span>
        {lowConfidence ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
            {text.lowConfidenceBadge}
          </span>
        ) : null}
      </div>

      <div className="mb-3 rounded-md bg-[#f6f8fb] px-2 py-2">
        <div className="mb-1 font-medium text-[var(--color-ink)]">{text.referencedDocumentsTitle}</div>
        {referencedDocuments.length > 0 ? (
          <ul className="space-y-1">
            {referencedDocuments.map((doc) => {
              const isResolving = resolvingDocId === doc.docId;
              return (
                <li key={doc.docId} className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-[var(--color-ink)]">{doc.docId}</div>
                    {doc.source ? <div className="truncate">{doc.source}</div> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleOpenDocument(doc.docId)}
                    disabled={isResolving}
                    className="shrink-0 rounded-md border border-[var(--color-border-subtle)] bg-white px-2 py-1 text-[11px] text-[var(--color-accent)] hover:bg-[#eef1f6] disabled:opacity-60"
                  >
                    {isResolving ? text.resolvingDocumentAction : text.openDocumentAction}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>{text.noDocumentLinksAvailable}</p>
        )}
        {documentError ? <p className="mt-1 text-red-700">{documentError}</p> : null}
      </div>

      {referencedDocuments.length === 0 && !documentError ? <p>{text.noReferencesReturned}</p> : null}
    </div>
  );
}
