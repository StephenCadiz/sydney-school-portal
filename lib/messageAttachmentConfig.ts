export const MESSAGE_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
export const MESSAGE_ATTACHMENT_MAX_COUNT = 10;

export const MESSAGE_ATTACHMENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
] as const;

export type MessageAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  path: string;
};

export function formatAttachmentSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateMessageFile(file: { name: string; type: string; size: number }) {
  if (!file || file.size <= 0) return "Choose a non-empty file.";
  if (file.size > MESSAGE_ATTACHMENT_MAX_BYTES) {
    return `${file.name} is larger than the 25 MB limit.`;
  }
  if (!MESSAGE_ATTACHMENT_TYPES.includes(file.type as (typeof MESSAGE_ATTACHMENT_TYPES)[number])) {
    return `${file.name} has an unsupported file type.`;
  }
  return null;
}
