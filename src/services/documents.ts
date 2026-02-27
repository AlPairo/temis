import { apiConfig } from "./http";
import { FRONTEND_TEXT } from "../text";

const authToken = import.meta.env.VITE_AUTH_TOKEN ?? "";

export type ResolvedDocumentLink = {
  doc_id: string;
  url: string;
  display_name?: string | null;
  source_label?: string | null;
  mime_type?: string | null;
};

const buildResolvePath = (docId: string): string =>
  `${FRONTEND_TEXT.services.documents.resolvePathPrefix}${encodeURIComponent(docId)}${FRONTEND_TEXT.services.documents.resolvePathSuffix}`;

const buildDownloadPath = (docId: string): string =>
  `${FRONTEND_TEXT.services.documents.resolvePathPrefix}${encodeURIComponent(docId)}/download`;

const ensureDownloadExtension = (docId: string): string => {
  const trimmed = docId.trim();
  if (!trimmed) {
    return "document.pdf";
  }
  return /\.[a-z0-9]{2,8}$/i.test(trimmed) ? trimmed : `${trimmed}.pdf`;
};

const parseFilenameFromDisposition = (value: string | null): string | null => {
  if (!value) return null;

  const utf8Match = value.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const quotedMatch = value.match(/filename\s*=\s*"([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const simpleMatch = value.match(/filename\s*=\s*([^;]+)/i);
  return simpleMatch?.[1]?.trim() ?? null;
};

export async function resolveDocumentLink(docId: string): Promise<ResolvedDocumentLink> {
  const path = buildResolvePath(docId);
  const res = await fetch(`${apiConfig.baseUrl}${path}`, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as ResolvedDocumentLink;
}

export async function downloadDocumentFile(docId: string): Promise<void> {
  const path = buildDownloadPath(docId);
  const res = await fetch(`${apiConfig.baseUrl}${path}`, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const fileName =
    parseFilenameFromDisposition(res.headers.get("content-disposition")) ??
    ensureDownloadExtension(docId);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noreferrer noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
