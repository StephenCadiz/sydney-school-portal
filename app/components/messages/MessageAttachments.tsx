"use client";

import { useState } from "react";

import {
  formatAttachmentSize,
  type MessageAttachment,
} from "../../../lib/messageAttachments";
import { supabase } from "../../../lib/supabase";

export default function MessageAttachments({
  messageId,
  attachments,
}: {
  messageId: string;
  attachments?: MessageAttachment[] | null;
}) {
  const [loadingId, setLoadingId] = useState("");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  if (!attachments?.length) return null;

  async function openAttachment(attachment: MessageAttachment) {
    setError("");
    setLoadingId(attachment.id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your session has expired.");
      const response = await fetch(
        `/api/messages/attachments/${encodeURIComponent(messageId)}/${encodeURIComponent(attachment.id)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.signedUrl) throw new Error(payload.error || "Unable to open attachment.");
      setUrls((current) => ({ ...current, [attachment.id]: payload.signedUrl }));
      window.open(payload.signedUrl, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to open attachment.");
    } finally {
      setLoadingId("");
    }
  }

  return (
    <div className="message-attachments" aria-label="Message attachments">
      {attachments.map((attachment) => (
        <div className="message-attachment-item" key={attachment.id}>
          <span>
            <strong>{attachment.name}</strong>
            <small>{attachment.type} · {formatAttachmentSize(attachment.size)}</small>
          </span>
          {urls[attachment.id] ? (
            <a href={urls[attachment.id]} target="_blank" rel="noopener noreferrer" download>
              Open / download
            </a>
          ) : (
            <button type="button" onClick={() => void openAttachment(attachment)} disabled={loadingId === attachment.id}>
              {loadingId === attachment.id ? "Opening..." : "Open / download"}
            </button>
          )}
        </div>
      ))}
      {error && <p className="message-attachment-error" role="alert">{error}</p>}
    </div>
  );
}
