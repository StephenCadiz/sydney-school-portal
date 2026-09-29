"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { getTeacherResourceSignedUrl } from "../../../lib/teacherResources";

type ClassDocument = {
  id: string;
  title: string;
  description: string;
  original_filename: string | null;
  mime_type: string | null;
  file_size: number | null;
  created_by: string | null;
  created_at: string;
  storage_path?: string | null;
};

type Props = { classId: string; canManage: boolean };

function fileSize(value: number | null) {
  if (!value || value <= 0) return "";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

async function token() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("You must be logged in to manage class resources.");
  return session.access_token;
}

export default function ClassDocumentResources({ classId, canManage }: Props) {
  const [documents, setDocuments] = useState<ClassDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<ClassDocument | null>(null);
  const [editingFile, setEditingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const accessToken = await token();
      const response = await fetch(`/api/teacher/classes/${encodeURIComponent(classId)}/resource-documents`, {
        headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to load class documents.");
      setDocuments(Array.isArray(payload?.documents) ? payload.documents : []);
    } catch (loadError) {
      setDocuments([]);
      setError(loadError instanceof Error ? loadError.message : "Unable to load class documents.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [classId]);

  function chooseFile(next: File | undefined) {
    setError("");
    if (next) setFile(next);
  }

  async function upload() {
    if (!file || busy) return;
    setBusy(true); setProgress(0); setError(""); setMessage("");
    try {
      const accessToken = await token();
      const data = new FormData();
      data.append("title", title || file.name);
      data.append("description", description || "Uploaded class document.");
      data.append("file", file);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/teacher/classes/${encodeURIComponent(classId)}/resource-documents`);
        xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(JSON.parse(xhr.responseText || "{}").error || "Upload failed."));
        xhr.onerror = () => reject(new Error("Upload failed. Please try again."));
        xhr.send(data);
      });
      setTitle(""); setDescription(""); setFile(null); setProgress(100);
      if (inputRef.current) inputRef.current.value = "";
      await load();
      setMessage("Document uploaded successfully.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed. Please try again.");
    } finally { setBusy(false); }
  }

  async function updateDocument(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || busy) return;
    setBusy(true); setError("");
    try {
      const accessToken = await token();
      const data = new FormData();
      data.append("title", editing.title);
      data.append("description", editing.description || "Uploaded class document.");
      if (editingFile) data.append("file", editingFile);
      const response = await fetch(`/api/teacher/classes/${encodeURIComponent(classId)}/resource-documents/${encodeURIComponent(editing.id)}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${accessToken}` }, body: data,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to update document.");
      setEditing(null); setEditingFile(null); await load();
    } catch (updateError) { setError(updateError instanceof Error ? updateError.message : "Unable to update document."); }
    finally { setBusy(false); }
  }

  async function removeDocument(document: ClassDocument) {
    if (busy || !window.confirm(`Delete ${document.title}?`)) return;
    setBusy(true); setError("");
    try {
      const accessToken = await token();
      const response = await fetch(`/api/teacher/classes/${encodeURIComponent(classId)}/resource-documents/${encodeURIComponent(document.id)}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to delete document.");
      setDocuments((current) => current.filter((item) => item.id !== document.id));
    } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "Unable to delete document."); }
    finally { setBusy(false); }
  }

  async function openDocument(document: ClassDocument) {
    try {
      const signedUrl = await getTeacherResourceSignedUrl(document.id);
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (openError) { setError(openError instanceof Error ? openError.message : "Unable to open document."); }
  }

  return <section className="teacher-class-document-resources" aria-label="Class documents">
    <div className="teacher-class-resource-form-heading"><h4>Add Document</h4><p>Upload a private document for this Cambridge class. Students can view it from their class resources.</p></div>
    {canManage && <div className={`teacher-class-document-dropzone${dragging ? " is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0]); }}>
      <input ref={inputRef} id="class-document-file" type="file" onChange={(event) => chooseFile(event.target.files?.[0])} disabled={busy} />
      <label htmlFor="class-document-file">Drag and drop a document here, or choose a file</label>
      {file && <p>{file.name} · {file.type || "File"} · {fileSize(file.size)}</p>}
      <input aria-label="Document title" placeholder="Document title" value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy} />
      <textarea aria-label="Document description" placeholder="Description (optional)" value={description} onChange={(event) => setDescription(event.target.value)} disabled={busy} rows={2} />
      <button type="button" onClick={() => void upload()} disabled={!file || busy}>{busy ? `Uploading${progress ? ` ${progress}%` : "…"}` : error ? "Retry upload" : "Upload document"}</button>
      {busy && <progress value={progress} max={100} aria-label="Upload progress" />}
    </div>}
    {message && <p role="status" className="teacher-class-resource-message teacher-class-resource-message-success">{message}</p>}
    {error && <p role="alert" className="teacher-class-resource-message teacher-class-resource-message-error">{error}</p>}
    {loading ? <p className="teacher-class-resource-empty">Loading class documents...</p> : documents.length === 0 ? <p className="teacher-class-resource-empty">No class documents have been added yet.</p> : <div className="teacher-class-document-list">{documents.map((document) => editing?.id === document.id ? <form className="teacher-class-document-card" key={document.id} onSubmit={updateDocument}>
      <input aria-label="Edit document title" value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} disabled={busy} />
      <textarea aria-label="Edit document description" value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} disabled={busy} />
      <input type="file" onChange={(event) => setEditingFile(event.target.files?.[0] || null)} disabled={busy} />
      <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button><button type="button" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
    </form> : <article className="teacher-class-document-card" key={document.id}>
      <strong>{document.title}</strong><span>{document.original_filename || "Uploaded document"}</span><small>{document.mime_type || "File"} · {fileSize(document.file_size)}</small>{document.description && <p>{document.description}</p>}
      <div className="teacher-class-resource-actions"><button type="button" onClick={() => void openDocument(document)}>Open document</button>{canManage && <><button type="button" onClick={() => setEditing({ ...document })}>Replace</button><button type="button" onClick={() => void removeDocument(document)}>Delete</button></>}</div>
    </article>)}</div>}
  </section>;
}
