"use client";

import { useRef, useState } from "react";

import {
  formatAttachmentSize,
  validateMessageFile,
} from "../../../lib/messageAttachments";

type Props = {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
};

export default function MessageAttachmentPicker({ files, onChange, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  function addFiles(nextFiles: File[]) {
    setError("");
    const invalid = nextFiles.map(validateMessageFile).find(Boolean);
    if (invalid) {
      setError(invalid);
      return;
    }
    const merged = [...files, ...nextFiles];
    if (merged.length > 10) {
      setError("You can attach up to 10 files.");
      return;
    }
    onChange(merged);
  }

  return (
    <div
      className={`message-attachment-picker${dragging ? " is-dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled) addFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          addFiles(Array.from(event.target.files || []));
          event.target.value = "";
        }}
        disabled={disabled}
      />
      <button
        type="button"
        className="message-attachment-button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        Attach files
      </button>
      <span className="message-attachment-hint">or drag files here</span>
      {files.length > 0 && (
        <ul className="message-attachment-list" aria-label="Selected attachments">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${index}`}>
              <span>
                <strong>{file.name}</strong>
                <small>{file.type || "Unknown type"} · {formatAttachmentSize(file.size)}</small>
              </span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))}
                disabled={disabled}
                aria-label={`Remove ${file.name}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="message-attachment-error" role="alert">{error}</p>}
    </div>
  );
}
