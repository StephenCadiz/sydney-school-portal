import { supabase } from "./supabase";
export {
  MESSAGE_ATTACHMENT_MAX_BYTES,
  MESSAGE_ATTACHMENT_MAX_COUNT,
  MESSAGE_ATTACHMENT_TYPES,
  formatAttachmentSize,
  validateMessageFile,
  type MessageAttachment,
} from "./messageAttachmentConfig";

import {
  MESSAGE_ATTACHMENT_MAX_COUNT,
  type MessageAttachment,
  validateMessageFile,
} from "./messageAttachmentConfig";

export async function uploadMessageAttachments(files: File[]) {
  if (!files.length) return [] as MessageAttachment[];
  if (files.length > MESSAGE_ATTACHMENT_MAX_COUNT) {
    throw new Error(`You can attach up to ${MESSAGE_ATTACHMENT_MAX_COUNT} files.`);
  }
  for (const file of files) {
    const error = validateMessageFile(file);
    if (error) throw new Error(error);
  }

  const { data, error: sessionError } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (sessionError || !token) throw new Error("Your session has expired.");

  const formData = new FormData();
  files.forEach((file) => formData.append("files", file, file.name));
  const response = await fetch("/api/messages/attachments", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Unable to upload attachments.");
  return (payload.attachments || []) as MessageAttachment[];
}

export async function cleanupMessageAttachments(attachments: MessageAttachment[]) {
  if (!attachments.length) return;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  await fetch("/api/messages/attachments", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ attachments: attachments.map((attachment) => ({ id: attachment.id, path: attachment.path })) }),
  }).catch(() => undefined);
}
