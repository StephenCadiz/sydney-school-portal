"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getTeacherClassSyllabus,
  openTeacherSyllabusMaterial,
  type Syllabus,
  type SyllabusMaterial,
} from "../../../lib/syllabuses";
import { formatTeacherResourceFileSize } from "../../../lib/teacherResourceValidation";

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.valueOf())) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid",
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Not available";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Madrid",
  }).format(date);
}

function MaterialAction({
  classId,
  material,
}: {
  classId: string;
  material: SyllabusMaterial;
}) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  async function openFile() {
    if (opening) return;
    setOpening(true);
    setError("");
    const popup = window.open("about:blank", "_blank");
    try {
      const signedUrl = await openTeacherSyllabusMaterial(classId, material.id);
      if (!signedUrl) throw new Error("Signed URL missing.");
      if (popup) {
        popup.opener = null;
        popup.location.href = signedUrl;
      } else {
        window.open(signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch (openError) {
      console.error("Unable to open syllabus material:", openError);
      popup?.close();
      setError("This file could not be opened. Please try again.");
    } finally {
      setOpening(false);
    }
  }

  const fileSize = formatTeacherResourceFileSize(material.file_size);
  return (
    <article className="teacher-syllabus-material">
      <div>
        <strong>{material.label}</strong>
        {material.description && <p>{material.description}</p>}
        {material.material_type === "file" && (
          <small>
            {[material.original_filename, fileSize].filter(Boolean).join(" · ") ||
              "Private file"}
          </small>
        )}
      </div>
      {material.external_url ? (
        <a
          className="teacher-syllabus-material-action"
          href={material.external_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open link
        </a>
      ) : (
        <button
          className="teacher-syllabus-material-action"
          type="button"
          disabled={opening || !material.has_private_file}
          onClick={() => void openFile()}
        >
          {opening ? "Opening…" : "Open file"}
        </button>
      )}
      {error && <p className="teacher-syllabus-material-error">{error}</p>}
    </article>
  );
}

export default function SyllabusTab({ classId }: { classId: string }) {
  const [syllabus, setSyllabus] = useState<Syllabus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSyllabus = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await getTeacherClassSyllabus(classId);
      setSyllabus(payload.syllabus);
    } catch (loadError) {
      console.error("Unable to load class syllabus:", loadError);
      setSyllabus(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load the class syllabus."
      );
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadSyllabus(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadSyllabus]);

  if (loading) {
    return <div className="teacher-syllabus-state">Loading syllabus…</div>;
  }
  if (error) {
    return (
      <div className="teacher-syllabus-state teacher-syllabus-state-error" role="alert">
        <p>{error}</p>
        <button type="button" onClick={() => void loadSyllabus()}>
          Try again
        </button>
      </div>
    );
  }
  if (!syllabus) {
    return (
      <div className="teacher-syllabus-state">
        A syllabus has not been published for this class yet.
      </div>
    );
  }

  return (
    <section className="teacher-syllabus">
      <header className="teacher-syllabus-header">
        <div>
          <span className="teacher-syllabus-eyebrow">Published syllabus</span>
          <h2>{syllabus.title}</h2>
          <p>
            {syllabus.level.name} · {syllabus.academic_year.label}
          </p>
        </div>
        <div className="teacher-syllabus-meta">
          <span>Published {formatDateTime(syllabus.published_at)}</span>
          <span>Updated {formatDateTime(syllabus.updated_at)}</span>
        </div>
      </header>

      <div className="teacher-syllabus-unit-list">
        {syllabus.units.map((unit, index) => (
          <article className="teacher-syllabus-unit" key={unit.id}>
            <header>
              <span>Unit {index + 1}</span>
              <h3>{unit.title}</h3>
            </header>
            <div className="teacher-syllabus-unit-grid">
              <div>
                <span>Pages to cover</span>
                <p>{unit.pages_text || "No specific pages listed."}</p>
              </div>
              <div>
                <span>Target completion</span>
                <p>{formatDate(unit.target_completion_date)}</p>
              </div>
            </div>
            <div className="teacher-syllabus-content">
              <span>Content and topics</span>
              <p>{unit.content_text}</p>
            </div>
            {(unit.exam_week_start_date ||
              unit.exam_week_end_date ||
              unit.exam_information) && (
              <section className="teacher-syllabus-exam">
                <strong>Exam week</strong>
                {(unit.exam_week_start_date || unit.exam_week_end_date) && (
                  <p>
                    {unit.exam_week_start_date && unit.exam_week_end_date
                      ? `${formatDate(unit.exam_week_start_date)} – ${formatDate(
                          unit.exam_week_end_date
                        )}`
                      : unit.exam_week_start_date
                        ? `From ${formatDate(unit.exam_week_start_date)}`
                        : `Until ${formatDate(unit.exam_week_end_date)}`}
                  </p>
                )}
                {unit.exam_information && <p>{unit.exam_information}</p>}
              </section>
            )}
            {unit.materials.length > 0 && (
              <section className="teacher-syllabus-materials">
                <h4>Additional materials</h4>
                <div>
                  {unit.materials.map((material) => (
                    <MaterialAction
                      classId={classId}
                      key={material.id}
                      material={material}
                    />
                  ))}
                </div>
              </section>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
