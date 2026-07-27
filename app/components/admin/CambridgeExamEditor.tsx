"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  CAMBRIDGE_EXAM_PARTS,
  CAMBRIDGE_EXAM_URL_MAX_LENGTH,
  CambridgeExamFormParts,
  CambridgeExamPartType,
  CambridgeExamRecord,
  CambridgeExamResourceType,
  CambridgeExamSavePayload,
  createEmptyExamParts,
  getExamCompleteness,
  getExamPartLabel,
  isValidExternalUrl,
  REQUIRED_RESOURCES,
  RESOURCE_LABELS,
} from "../../../lib/cambridgeExamBank";
import { supabase } from "../../../lib/supabase";

type LevelOption = { id: number; name: string };

function partsFromExam(exam?: CambridgeExamRecord) {
  const parts = createEmptyExamParts();
  exam?.parts.forEach((part) => {
    part.resources.forEach((resource) => {
      parts[part.part_type][resource.resource_type] = resource.external_url;
    });
  });
  return parts;
}

async function bearerHeaders() {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("Your session has expired.");
  return {
    Authorization: `Bearer ${data.session.access_token}`,
    "Content-Type": "application/json",
  };
}

export default function CambridgeExamEditor({
  exam,
}: {
  exam?: CambridgeExamRecord;
}) {
  const router = useRouter();
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [levelId, setLevelId] = useState(String(exam?.level.id || ""));
  const [examNumber, setExamNumber] = useState(String(exam?.exam_number || ""));
  const [title, setTitle] = useState(exam?.title || "");
  const [parts, setParts] = useState<CambridgeExamFormParts>(() =>
    partsFromExam(exam)
  );
  const [openParts, setOpenParts] = useState<Record<CambridgeExamPartType, boolean>>({
    reading: true,
    listening: true,
    writing: true,
    speaking: true,
  });
  const [baseline, setBaseline] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pageError, setPageError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [levelsLoading, setLevelsLoading] = useState(true);
  const [levelsError, setLevelsError] = useState("");
  const selectedLevel =
    levels.find((level) => String(level.id) === levelId)?.name ||
    exam?.level.name ||
    "";
  const completeness = useMemo(
    () => getExamCompleteness(selectedLevel, parts),
    [selectedLevel, parts]
  );
  const snapshot = JSON.stringify({ levelId, examNumber, title, parts });
  const dirty = Boolean(baseline) && snapshot !== baseline;

  const loadLevels = useCallback(async () => {
    setLevelsLoading(true);
    setLevelsError("");

    try {
      const { data, error } = await supabase
        .from("levels")
        .select("id, name");

      if (error) {
        setLevels([]);
        setLevelsError("Unable to load eligible Cambridge levels.");
        return;
      }

      const eligible = (data || [])
        .map((level) => ({
          id: Number(level.id),
          name: String(level.name).trim().toUpperCase(),
        }))
        .filter((level) => ["B1", "B2", "C1", "C2"].includes(level.name))
        .sort((a, b) => a.name.localeCompare(b.name));

      setLevels(eligible);
      if (eligible.length === 0) {
        setLevelsError("No eligible Cambridge levels are available.");
      }
    } catch {
      setLevels([]);
      setLevelsError("Unable to load eligible Cambridge levels.");
    } finally {
      setLevelsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLevels();
  }, [loadLevels]);

  useEffect(() => {
    if (!baseline) setBaseline(snapshot);
  }, [baseline, snapshot]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function updateResource(
    partType: CambridgeExamPartType,
    resourceType: CambridgeExamResourceType,
    value: string
  ) {
    setParts((current) => ({
      ...current,
      [partType]: { ...current[partType], [resourceType]: value },
    }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[`${partType}.${resourceType}`];
      return next;
    });
  }

  function validate() {
    const errors: Record<string, string> = {};
    if (!levelId) errors.level_id = "Choose a Cambridge level.";
    const number = Number(examNumber);
    if (!Number.isInteger(number) || number <= 0) {
      errors.exam_number = "Enter a positive whole number.";
    }
    if (title.trim().length > 120) errors.title = "Use 120 characters or fewer.";
    CAMBRIDGE_EXAM_PARTS.forEach((partType) => {
      REQUIRED_RESOURCES[partType].forEach((resourceType) => {
        const value = parts[partType][resourceType]?.trim() || "";
        if (value.length > CAMBRIDGE_EXAM_URL_MAX_LENGTH) {
          errors[`${partType}.${resourceType}`] =
            `URL must contain no more than ${CAMBRIDGE_EXAM_URL_MAX_LENGTH} characters.`;
        } else if (value && !isValidExternalUrl(value)) {
          errors[`${partType}.${resourceType}`] =
            "Enter a valid HTTP or HTTPS URL.";
        }
      });
    });
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSuccess("");
    setPageError("");
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: CambridgeExamSavePayload = {
        level_id: Number(levelId),
        exam_number: Number(examNumber),
        title: title.trim(),
        parts,
      };
      const response = await fetch(
        exam ? `/api/admin/exam-bank/${exam.id}` : "/api/admin/exam-bank",
        {
          method: exam ? "PATCH" : "POST",
          headers: await bearerHeaders(),
          body: JSON.stringify(payload),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save the exam.");
      const saved = result.exam as CambridgeExamRecord;
      const savedParts = partsFromExam(saved);
      setLevelId(String(saved.level.id));
      setExamNumber(String(saved.exam_number));
      setTitle(saved.title || "");
      setParts(savedParts);
      setBaseline(
        JSON.stringify({
          levelId: String(saved.level.id),
          examNumber: String(saved.exam_number),
          title: saved.title || "",
          parts: savedParts,
        })
      );
      setSuccess(exam ? "Changes saved." : "Exam saved.");
      if (!exam) router.replace(`/admin/exam-bank/${saved.id}`);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to save the exam.");
    } finally {
      setSaving(false);
    }
  }

  function cancel(event: React.MouseEvent<HTMLAnchorElement>) {
    if (dirty && !window.confirm("Leave this page and discard your unsaved changes?")) {
      event.preventDefault();
    }
  }

  return (
    <form className="exam-bank-editor" onSubmit={save} noValidate>
      {pageError && <div className="exam-bank-notice is-error" role="alert">{pageError}</div>}
      {success && <div className="exam-bank-notice is-success" role="status">{success}</div>}
      {levelsError && (
        <div className="exam-bank-notice is-error" role="alert">
          <span>{levelsError}</span>
          <button type="button" onClick={() => void loadLevels()} disabled={levelsLoading}>
            {levelsLoading ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      <section className="exam-bank-meta-grid" aria-label="Exam details">
        <div className="exam-bank-field">
          <label htmlFor="exam-level">Level</label>
          <select id="exam-level" value={levelId} onChange={(e) => setLevelId(e.target.value)} disabled={levelsLoading || levels.length === 0} aria-describedby={fieldErrors.level_id ? "exam-level-error" : undefined}>
            <option value="">{levelsLoading ? "Loading levels…" : "Choose level"}</option>
            {levels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}
          </select>
          {fieldErrors.level_id && <span id="exam-level-error" className="exam-bank-field-error">{fieldErrors.level_id}</span>}
        </div>
        <div className="exam-bank-field">
          <label htmlFor="exam-number">Exam number</label>
          <input id="exam-number" type="number" min="1" step="1" value={examNumber} onChange={(e) => setExamNumber(e.target.value)} aria-describedby={fieldErrors.exam_number ? "exam-number-error" : undefined} />
          {fieldErrors.exam_number && <span id="exam-number-error" className="exam-bank-field-error">{fieldErrors.exam_number}</span>}
        </div>
        <div className="exam-bank-field is-wide">
          <label htmlFor="exam-title">Optional internal title</label>
          <input id="exam-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} aria-describedby={fieldErrors.title ? "exam-title-error" : undefined} />
          {fieldErrors.title && <span id="exam-title-error" className="exam-bank-field-error">{fieldErrors.title}</span>}
        </div>
      </section>

      <section className={`exam-bank-readiness ${completeness.ready ? "is-ready" : ""}`} aria-live="polite">
        <div>
          <h2>Exam readiness</h2>
          <strong>{completeness.complete_parts} of {completeness.total_parts} parts complete</strong>
        </div>
        <span>{completeness.ready ? "Ready" : `Incomplete · ${completeness.missing.length} resources missing`}</span>
        {!completeness.ready && (
          <ul>{completeness.missing.map((item) => <li key={item}>{item}</li>)}</ul>
        )}
      </section>

      <div className="exam-bank-parts">
        {CAMBRIDGE_EXAM_PARTS.map((partType) => {
          const summary = completeness.parts.find((part) => part.part_type === partType);
          const panelId = `exam-part-${partType}`;
          return (
            <section className="exam-bank-part" key={partType}>
              <button type="button" className="exam-bank-part-toggle" aria-expanded={openParts[partType]} aria-controls={panelId} onClick={() => setOpenParts((current) => ({ ...current, [partType]: !current[partType] }))}>
                <span>{getExamPartLabel(selectedLevel, partType)}</span>
                <span>{summary?.complete ? "Complete" : `${summary?.missing_resources.length || 0} missing`} <b aria-hidden="true">{openParts[partType] ? "−" : "+"}</b></span>
              </button>
              {openParts[partType] && (
                <div id={panelId} className="exam-bank-resource-grid">
                  {REQUIRED_RESOURCES[partType].map((resourceType) => {
                    const key = `${partType}.${resourceType}`;
                    const value = parts[partType][resourceType] || "";
                    return (
                      <div className="exam-bank-field" key={resourceType}>
                        <div className="exam-bank-field-label-row">
                          <label htmlFor={key}>{RESOURCE_LABELS[resourceType]} URL</label>
                          {isValidExternalUrl(value) && <a href={value.trim()} target="_blank" rel="noopener noreferrer">Open Link</a>}
                        </div>
                        <input id={key} type="url" placeholder="https://example.com/resource" value={value} onChange={(e) => updateResource(partType, resourceType, e.target.value)} aria-describedby={fieldErrors[key] ? `${key}-error` : undefined} />
                        {fieldErrors[key] && <span id={`${key}-error`} className="exam-bank-field-error">{fieldErrors[key]}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="exam-bank-editor-actions">
        <div><strong>{completeness.ready ? "Ready" : "Incomplete draft"}</strong><span>{dirty ? "Unsaved changes" : "All changes saved"}</span></div>
        <Link href="/admin/exam-bank" className="exam-bank-button is-secondary" onClick={cancel}>Cancel</Link>
        <button className="exam-bank-button" type="submit" disabled={saving || levelsLoading || levels.length === 0}>{saving ? "Saving…" : exam ? "Save Changes" : "Save Exam"}</button>
      </div>
    </form>
  );
}
