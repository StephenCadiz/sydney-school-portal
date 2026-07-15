export const TEACHER_RESOURCE_TITLE_MAX_LENGTH = 120;
export const TEACHER_RESOURCE_DESCRIPTION_MAX_LENGTH = 500;
export const TEACHER_RESOURCE_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export const TEACHER_RESOURCE_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
];

const dangerousFileExtensions = [
  ".ade",
  ".adp",
  ".apk",
  ".app",
  ".bat",
  ".cmd",
  ".com",
  ".cpl",
  ".dll",
  ".dmg",
  ".exe",
  ".hta",
  ".ins",
  ".iso",
  ".jar",
  ".js",
  ".jse",
  ".lib",
  ".lnk",
  ".mde",
  ".msc",
  ".msi",
  ".msp",
  ".mst",
  ".nsh",
  ".pif",
  ".ps1",
  ".scr",
  ".sh",
  ".sys",
  ".vb",
  ".vbe",
  ".vbs",
  ".vxd",
  ".wsc",
  ".wsf",
  ".wsh",
];

export type TeacherResourceType = "file" | "link";

export type ResourceFileValidationInput = {
  name?: string | null;
  type?: string | null;
  size?: number | null;
};

export function validateTeacherResourceTitle(value: unknown) {
  const title = String(value || "").trim();

  if (!title) {
    return { value: title, error: "Title is required." };
  }

  if (title.length > TEACHER_RESOURCE_TITLE_MAX_LENGTH) {
    return {
      value: title,
      error: `Title must be ${TEACHER_RESOURCE_TITLE_MAX_LENGTH} characters or fewer.`,
    };
  }

  return { value: title, error: "" };
}

export function validateTeacherResourceDescription(value: unknown) {
  const description = String(value || "").trim();

  if (!description) {
    return { value: description, error: "Short description is required." };
  }

  if (description.length > TEACHER_RESOURCE_DESCRIPTION_MAX_LENGTH) {
    return {
      value: description,
      error: `Short description must be ${TEACHER_RESOURCE_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
    };
  }

  return { value: description, error: "" };
}

export function validateTeacherResourceType(value: unknown) {
  const resourceType = String(value || "").trim();

  if (resourceType !== "file" && resourceType !== "link") {
    return {
      value: "",
      error: "Choose whether this resource is a file upload or an external link.",
    };
  }

  return { value: resourceType as TeacherResourceType, error: "" };
}

export function validateTeacherResourceLevelId(value: unknown) {
  const levelId = Number(String(value || "").trim());

  if (!Number.isFinite(levelId) || levelId <= 0) {
    return { value: 0, error: "A valid class level is required." };
  }

  return { value: levelId, error: "" };
}

export function validateTeacherResourceExternalUrl(value: unknown) {
  const externalUrl = String(value || "").trim();

  if (!externalUrl) {
    return { value: externalUrl, error: "External link is required." };
  }

  try {
    const parsedUrl = new URL(externalUrl);

    if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname) {
      return {
        value: externalUrl,
        error: "External link must be a valid HTTPS URL.",
      };
    }

    return { value: parsedUrl.toString(), error: "" };
  } catch {
    return {
      value: externalUrl,
      error: "External link must be a valid HTTPS URL.",
    };
  }
}

export function hasDangerousResourceFilename(filename: string) {
  const lowerName = filename.toLowerCase();

  return (
    !filename.trim() ||
    filename.includes("..") ||
    filename.includes("/") ||
    filename.includes("\\") ||
    /[\x00-\x1f\x7f]/.test(filename) ||
    dangerousFileExtensions.some((extension) => lowerName.endsWith(extension))
  );
}

export function sanitizeTeacherResourceFilename(filename: string) {
  const fallbackName = "resource-file";
  const baseName = filename
    .trim()
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 100);

  return baseName || fallbackName;
}

export function validateTeacherResourceFile(file: ResourceFileValidationInput) {
  const filename = String(file.name || "").trim();
  const mimeType = String(file.type || "").trim();
  const fileSize = Number(file.size || 0);

  if (!filename) {
    return { error: "Please choose a file to upload." };
  }

  if (hasDangerousResourceFilename(filename)) {
    return { error: "Please choose a file with a safe filename." };
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return { error: "The selected file is empty." };
  }

  if (fileSize > TEACHER_RESOURCE_MAX_FILE_SIZE_BYTES) {
    return { error: "The selected file must be 50 MB or smaller." };
  }

  if (!TEACHER_RESOURCE_ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { error: "This file type is not supported." };
  }

  return { error: "" };
}

export function formatTeacherResourceFileSize(value: number | null | undefined) {
  const fileSize = Number(value || 0);

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return "";
  }

  if (fileSize < 1024 * 1024) {
    return `${Math.max(1, Math.round(fileSize / 1024))} KB`;
  }

  return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
}
