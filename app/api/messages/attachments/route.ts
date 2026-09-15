import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  MESSAGE_ATTACHMENT_MAX_COUNT,
  validateMessageFile,
  type MessageAttachment,
} from "../../../../lib/messageAttachmentConfig";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

const BUCKET = "message-attachments";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function authenticate(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  const token = value.startsWith("Bearer ") ? value.slice(7) : "";
  if (!token) return { user: null, response: jsonError("Authentication required.", 401) };
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return { user: null, response: jsonError("Authentication required.", 401) };
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) return { user: null, response: jsonError("Unable to verify account access.", 500) };
  if (!profile || !["admin", "teacher", "student"].includes(String(profile.role))) {
    return { user: null, response: jsonError("Messaging access required.", 403) };
  }
  return { user: data.user, response: null };
}

function safeFilename(value: string) {
  const cleaned = value.normalize("NFKC").replace(/[^a-zA-Z0-9._ -]/g, "_").trim();
  return cleaned.slice(0, 120) || "attachment";
}

function hasExpectedSignature(type: string, bytes: Uint8Array) {
  if (type === "text/plain" || type === "text/csv") return true;
  if (type === "application/pdf") {
    return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  }
  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    type === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  }
  if (type === "image/png") {
    return bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  }
  if (type === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "image/webp") {
    return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  }
  if (type === "audio/mpeg") {
    return new TextDecoder().decode(bytes.slice(0, 3)) === "ID3" || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  }
  if (type === "audio/mp4" || type === "audio/x-m4a" || type === "audio/m4a") {
    return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp";
  }
  return false;
}

export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (auth.response || !auth.user) return auth.response;
  const formData = await request.formData();
  const entries = formData.getAll("files").filter((value): value is File => value instanceof File);
  if (!entries.length) return jsonError("Choose at least one file.", 400);
  if (entries.length > MESSAGE_ATTACHMENT_MAX_COUNT) {
    return jsonError(`You can attach up to ${MESSAGE_ATTACHMENT_MAX_COUNT} files.`, 400);
  }

  for (const file of entries) {
    const error = validateMessageFile({ name: file.name, type: file.type, size: file.size });
    if (error) return jsonError(error, 400);
    const bytes = new Uint8Array((await file.arrayBuffer()) as ArrayBuffer);
    const signature = bytes.slice(0, 16);
    if (!hasExpectedSignature(file.type, signature)) {
      return jsonError(`${file.name} does not match its declared file type.`, 400);
    }
  }

  const uploadedPaths: string[] = [];
  const attachments: MessageAttachment[] = [];
  try {
    for (const file of entries) {
      const id = randomUUID();
      const path = `${auth.user.id}/${id}`;
      const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      uploadedPaths.push(path);
      attachments.push({ id, name: safeFilename(file.name), type: file.type, size: file.size, path });
    }
    return NextResponse.json({ attachments }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (uploadedPaths.length) await supabaseAdmin.storage.from(BUCKET).remove(uploadedPaths).catch(() => undefined);
    console.error("Message attachment upload failed:", error);
    return jsonError("Unable to upload attachments.", 500);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticate(request);
  if (auth.response || !auth.user) return auth.response;
  const body = await request.json().catch(() => ({}));
  const entries = Array.isArray(body?.attachments) ? body.attachments : [];
  const paths = entries
    .filter((item: any) => item && typeof item.path === "string" && item.path.startsWith(`${auth.user.id}/`))
    .map((item: any) => item.path)
    .slice(0, MESSAGE_ATTACHMENT_MAX_COUNT);
  if (paths.length) await supabaseAdmin.storage.from(BUCKET).remove(paths);
  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}
