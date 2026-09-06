"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AdminLayout from "../../components/layout/AdminLayout";
import {
  createSyllabus,
  createSyllabusMaterial,
  createSyllabusUnit,
  deleteSyllabus,
  deleteSyllabusMaterial,
  deleteSyllabusUnit,
  getAdminSyllabuses,
  reorderSyllabusMaterials,
  reorderSyllabusUnits,
  updateSyllabus,
  updateSyllabusMaterial,
  updateSyllabusUnit,
  type Syllabus,
  type SyllabusMaterial,
  type SyllabusReferenceData,
  type SyllabusUnit,
} from "../../../lib/syllabuses";
import styles from "./Syllabuses.module.css";

type Notice = { text: string; error: boolean };
type MutationResult = {
  syllabus: Syllabus;
  message?: string;
  storageCleanupFailed?: boolean;
};

type UnitDraft = {
  title: string;
  pages_text: string;
  content_text: string;
  target_completion_date: string;
  exam_week_start_date: string;
  exam_week_end_date: string;
  exam_information: string;
};

type MaterialDraft = {
  materialType: "file" | "link";
  label: string;
  description: string;
  externalUrl: string;
};

const emptyReferences: SyllabusReferenceData = {
  academic_years: [],
  levels: [],
};

const emptyUnit: UnitDraft = {
  title: "",
  pages_text: "",
  content_text: "",
  target_completion_date: "",
  exam_week_start_date: "",
  exam_week_end_date: "",
  exam_information: "",
};

const emptyMaterial: MaterialDraft = {
  materialType: "link",
  label: "",
  description: "",
  externalUrl: "",
};

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

function unitDraft(unit: SyllabusUnit): UnitDraft {
  return {
    title: unit.title,
    pages_text: unit.pages_text,
    content_text: unit.content_text,
    target_completion_date: unit.target_completion_date,
    exam_week_start_date: unit.exam_week_start_date || "",
    exam_week_end_date: unit.exam_week_end_date || "",
    exam_information: unit.exam_information,
  };
}

function moveItem(ids: string[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function MaterialRow({
  material,
  index,
  count,
  busy,
  onMove,
  onDelete,
  onSave,
}: {
  material: SyllabusMaterial;
  index: number;
  count: number;
  busy: boolean;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    label: material.label,
    description: material.description,
    external_url: material.external_url || "",
  });

  if (editing) {
    return (
      <div className={styles.materialForm}>
        <label className={styles.field}>
          <span>Display label</span>
          <input
            value={draft.label}
            onChange={(event) =>
              setDraft((current) => ({ ...current, label: event.target.value }))
            }
          />
        </label>
        {material.material_type === "link" && (
          <label className={styles.field}>
            <span>External HTTPS link</span>
            <input
              type="url"
              value={draft.external_url}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  external_url: event.target.value,
                }))
              }
            />
          </label>
        )}
        <label className={`${styles.field} ${styles.fullWidth}`}>
          <span>Short description (optional)</span>
          <input
            value={draft.description}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </label>
        <div className={`${styles.materialActions} ${styles.fullWidth}`}>
          <button
            className={styles.primary}
            disabled={busy}
            type="button"
            onClick={async () => {
              if (await onSave(draft)) setEditing(false);
            }}
          >
            Save material
          </button>
          <button
            className={styles.quiet}
            disabled={busy}
            type="button"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.materialRow}>
      <div>
        <strong>{material.label}</strong>
        {material.description && <p>{material.description}</p>}
        <small>
          {material.material_type === "file"
            ? material.original_filename || "Private file"
            : material.external_url}
        </small>
      </div>
      <div className={styles.materialActions}>
        <button
          aria-label={`Move ${material.label} up`}
          className={styles.quiet}
          disabled={busy || index === 0}
          type="button"
          onClick={() => onMove(-1)}
        >
          Move up
        </button>
        <button
          aria-label={`Move ${material.label} down`}
          className={styles.quiet}
          disabled={busy || index === count - 1}
          type="button"
          onClick={() => onMove(1)}
        >
          Move down
        </button>
        <button
          className={styles.secondary}
          disabled={busy}
          type="button"
          onClick={() => {
            setDraft({
              label: material.label,
              description: material.description,
              external_url: material.external_url || "",
            });
            setEditing(true);
          }}
        >
          Edit
        </button>
        <button
          className={styles.danger}
          disabled={busy}
          type="button"
          onClick={onDelete}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function UnitEditor({
  syllabus,
  unit,
  index,
  busyKey,
  perform,
  onMove,
}: {
  syllabus: Syllabus;
  unit: SyllabusUnit;
  index: number;
  busyKey: string;
  perform: (
    key: string,
    operation: () => Promise<MutationResult>,
    success: string
  ) => Promise<boolean>;
  onMove: (unitIndex: number, direction: -1 | 1) => void;
}) {
  const [draft, setDraft] = useState<UnitDraft>(() => unitDraft(unit));
  const [material, setMaterial] = useState<MaterialDraft>(emptyMaterial);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = Boolean(busyKey);

  async function saveUnit() {
    await perform(
      `unit-${unit.id}`,
      () => updateSyllabusUnit(syllabus.id, unit.id, draft),
      `Unit ${index + 1} updated.`
    );
  }

  async function addMaterial() {
    const formData = new FormData();
    formData.set("materialType", material.materialType);
    formData.set("label", material.label);
    formData.set("description", material.description);
    formData.set("externalUrl", material.externalUrl);
    if (file) formData.set("file", file);
    const saved = await perform(
      `material-new-${unit.id}`,
      () => createSyllabusMaterial(syllabus.id, unit.id, formData),
      "Additional material added."
    );
    if (saved) {
      setMaterial(emptyMaterial);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function moveMaterial(materialIndex: number, direction: -1 | 1) {
    const ids = moveItem(
      unit.materials.map((item) => item.id),
      materialIndex,
      direction
    );
    await perform(
      `material-order-${unit.id}`,
      () => reorderSyllabusMaterials(syllabus.id, unit.id, ids),
      "Material order updated."
    );
  }

  return (
    <article className={styles.unitCard}>
      <header className={styles.unitHeader}>
        <div>
          <span className={styles.unitNumber}>Unit {index + 1}</span>
          <h3>{unit.title}</h3>
          <p>Last updated {formatDateTime(unit.updated_at)}</p>
        </div>
        <div className={styles.unitActions}>
          <button
            className={styles.quiet}
            disabled={busy || index === 0}
            type="button"
            onClick={() => onMove(index, -1)}
          >
            Move up
          </button>
          <button
            className={styles.quiet}
            disabled={busy || index === syllabus.units.length - 1}
            type="button"
            onClick={() => onMove(index, 1)}
          >
            Move down
          </button>
          <button
            className={styles.danger}
            disabled={busy}
            type="button"
            onClick={() => {
              if (!window.confirm(`Delete Unit ${index + 1}: ${unit.title}? Its materials will also be removed.`)) return;
              void perform(
                `unit-delete-${unit.id}`,
                () => deleteSyllabusUnit(syllabus.id, unit.id),
                "Unit deleted."
              );
            }}
          >
            Delete unit
          </button>
        </div>
      </header>

      <div className={styles.unitFields}>
        <label className={styles.field}>
          <span>Unit title</span>
          <input
            value={draft.title}
            onChange={(event) =>
              setDraft((current) => ({ ...current, title: event.target.value }))
            }
          />
        </label>
        <label className={styles.field}>
          <span>Pages to be covered</span>
          <input
            placeholder="Coursebook pages 12–25; Workbook pages 8–14"
            value={draft.pages_text}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                pages_text: event.target.value,
              }))
            }
          />
        </label>
        <label className={`${styles.field} ${styles.fullWidth}`}>
          <span>Content / topics</span>
          <textarea
            value={draft.content_text}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                content_text: event.target.value,
              }))
            }
          />
        </label>
        <label className={styles.field}>
          <span>Target date to finish</span>
          <input
            type="date"
            value={draft.target_completion_date}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                target_completion_date: event.target.value,
              }))
            }
          />
        </label>
        <div />
        <label className={styles.field}>
          <span>Exam-week start (optional)</span>
          <input
            type="date"
            value={draft.exam_week_start_date}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                exam_week_start_date: event.target.value,
              }))
            }
          />
        </label>
        <label className={styles.field}>
          <span>Exam-week end (optional)</span>
          <input
            min={draft.exam_week_start_date || undefined}
            type="date"
            value={draft.exam_week_end_date}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                exam_week_end_date: event.target.value,
              }))
            }
          />
        </label>
        <label className={`${styles.field} ${styles.fullWidth}`}>
          <span>Exam information / instructions (optional)</span>
          <textarea
            value={draft.exam_information}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                exam_information: event.target.value,
              }))
            }
          />
        </label>
      </div>
      <div className={styles.actions}>
        <span className={styles.muted}>Changes remain in the current Draft or Published state.</span>
        <button
          className={styles.primary}
          disabled={busy}
          type="button"
          onClick={() => void saveUnit()}
        >
          Save unit
        </button>
      </div>

      <section className={styles.materials}>
        <div className={styles.sectionHeader}>
          <div>
            <h4>Additional materials</h4>
            <p className={styles.muted}>Private files or secure external links for this unit.</p>
          </div>
        </div>
        {unit.materials.length > 0 ? (
          <div className={styles.materialList}>
            {unit.materials.map((item, materialIndex) => (
              <MaterialRow
                busy={busy}
                count={unit.materials.length}
                index={materialIndex}
                key={item.id}
                material={item}
                onMove={(direction) => void moveMaterial(materialIndex, direction)}
                onDelete={() => {
                  if (!window.confirm(`Remove ${item.label}?`)) return;
                  void perform(
                    `material-delete-${item.id}`,
                    () => deleteSyllabusMaterial(syllabus.id, unit.id, item.id),
                    "Material removed."
                  );
                }}
                onSave={(body) =>
                  perform(
                    `material-update-${item.id}`,
                    () => updateSyllabusMaterial(syllabus.id, unit.id, item.id, body),
                    "Material updated."
                  )
                }
              />
            ))}
          </div>
        ) : (
          <div className={styles.empty}>No additional materials have been added.</div>
        )}

        <div className={styles.materialForm}>
          <label className={styles.field}>
            <span>Material type</span>
            <select
              value={material.materialType}
              onChange={(event) => {
                setMaterial((current) => ({
                  ...current,
                  materialType: event.target.value as "file" | "link",
                  externalUrl: "",
                }));
                setFile(null);
              }}
            >
              <option value="link">External link</option>
              <option value="file">Private file upload</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Display label</span>
            <input
              value={material.label}
              onChange={(event) =>
                setMaterial((current) => ({
                  ...current,
                  label: event.target.value,
                }))
              }
            />
          </label>
          <label className={`${styles.field} ${styles.fullWidth}`}>
            <span>Short description (optional)</span>
            <input
              value={material.description}
              onChange={(event) =>
                setMaterial((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
          {material.materialType === "link" ? (
            <label className={`${styles.field} ${styles.fullWidth}`}>
              <span>External HTTPS link</span>
              <input
                placeholder="https://…"
                type="url"
                value={material.externalUrl}
                onChange={(event) =>
                  setMaterial((current) => ({
                    ...current,
                    externalUrl: event.target.value,
                  }))
                }
              />
            </label>
          ) : (
            <label className={`${styles.field} ${styles.fullWidth}`}>
              <span>Choose private file</span>
              <input
                ref={fileInputRef}
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
            </label>
          )}
          <div className={`${styles.materialActions} ${styles.fullWidth}`}>
            <button
              className={styles.secondary}
              disabled={busy}
              type="button"
              onClick={() => void addMaterial()}
            >
              Add material
            </button>
          </div>
        </div>
      </section>
    </article>
  );
}

function SyllabusEditor({
  syllabus,
  onReplace,
  onRemove,
  onNotice,
}: {
  syllabus: Syllabus;
  onReplace: (syllabus: Syllabus) => void;
  onRemove: (id: string) => void;
  onNotice: (notice: Notice) => void;
}) {
  const [title, setTitle] = useState(syllabus.title);
  const [newUnit, setNewUnit] = useState<UnitDraft>(emptyUnit);
  const [busyKey, setBusyKey] = useState("");

  async function perform(
    key: string,
    operation: () => Promise<MutationResult>,
    success: string
  ) {
    if (busyKey) return false;
    setBusyKey(key);
    onNotice({ text: "", error: false });
    try {
      const result = await operation();
      onReplace(result.syllabus);
      onNotice({
        text: result.message || success,
        error: Boolean(result.storageCleanupFailed),
      });
      return true;
    } catch (error) {
      onNotice({
        text: error instanceof Error ? error.message : "Unable to save the syllabus.",
        error: true,
      });
      return false;
    } finally {
      setBusyKey("");
    }
  }

  async function moveUnit(index: number, direction: -1 | 1) {
    const unitIds = moveItem(
      syllabus.units.map((unit) => unit.id),
      index,
      direction
    );
    await perform(
      "unit-order",
      () => reorderSyllabusUnits(syllabus.id, unitIds),
      "Unit order updated."
    );
  }

  return (
    <section className={`${styles.panel} ${styles.editor}`}>
      <header className={styles.editorHeader}>
        <div>
          <span
            className={`${styles.badge} ${
              syllabus.status === "published" ? styles.published : styles.draft
            }`}
          >
            {syllabus.status}
          </span>
          <h2>{syllabus.level.name} · {syllabus.academic_year.label}</h2>
          <p>Updated {formatDateTime(syllabus.updated_at)}</p>
        </div>
        <div className={styles.editorActions}>
          {syllabus.status === "draft" ? (
            <button
              className={styles.primary}
              disabled={Boolean(busyKey)}
              type="button"
              onClick={() =>
                void perform(
                  "publish",
                  () => updateSyllabus(syllabus.id, { action: "publish" }),
                  "Syllabus published to matching eligible classes."
                )
              }
            >
              Publish
            </button>
          ) : (
            <button
              className={styles.secondary}
              disabled={Boolean(busyKey)}
              type="button"
              onClick={() => {
                if (!window.confirm("Unpublish this syllabus? Teachers will immediately lose access until it is published again.")) return;
                void perform(
                  "unpublish",
                  () => updateSyllabus(syllabus.id, { action: "unpublish" }),
                  "Syllabus returned to Draft."
                );
              }}
            >
              Unpublish
            </button>
          )}
          <button
            className={styles.danger}
            disabled={Boolean(busyKey)}
            type="button"
            onClick={async () => {
              const warning = syllabus.status === "published"
                ? "Delete this published syllabus? Teachers will immediately lose access, and all units and materials will be removed."
                : "Delete this draft syllabus and all of its units and materials?";
              if (!window.confirm(warning)) return;
              setBusyKey("delete");
              try {
                const result = await deleteSyllabus(syllabus.id);
                onRemove(syllabus.id);
                onNotice({
                  text: result.message || "Syllabus deleted.",
                  error: Boolean(result.storageCleanupFailed),
                });
              } catch (error) {
                onNotice({
                  text: error instanceof Error ? error.message : "Unable to delete the syllabus.",
                  error: true,
                });
              } finally {
                setBusyKey("");
              }
            }}
          >
            Delete syllabus
          </button>
        </div>
      </header>

      <div className={styles.titleForm}>
        <label className={styles.field}>
          <span>Syllabus title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <button
          className={styles.secondary}
          disabled={Boolean(busyKey)}
          type="button"
          onClick={() =>
            void perform(
              "title",
              () => updateSyllabus(syllabus.id, { action: "update_details", title }),
              "Syllabus title updated."
            )
          }
        >
          Save title
        </button>
      </div>

      <div className={styles.sectionHeader}>
        <div>
          <h2>Ordered units</h2>
          <p>Published edits are reflected in the Teacher view immediately.</p>
        </div>
      </div>

      {syllabus.units.length > 0 ? (
        <div className={styles.unitList}>
          {syllabus.units.map((unit, index) => (
            <UnitEditor
              busyKey={busyKey}
              index={index}
              key={unit.id}
              onMove={(unitIndex, direction) => void moveUnit(unitIndex, direction)}
              perform={perform}
              syllabus={syllabus}
              unit={unit}
            />
          ))}
        </div>
      ) : (
        <div className={styles.empty}>No units yet. Add the first unit below before publishing.</div>
      )}

      <section className={styles.unitCard}>
        <header className={styles.unitHeader}>
          <div>
            <span className={styles.unitNumber}>New unit</span>
            <h3>Add another syllabus unit</h3>
          </div>
        </header>
        <div className={styles.unitFields}>
          <label className={styles.field}>
            <span>Unit title</span>
            <input
              value={newUnit.title}
              onChange={(event) =>
                setNewUnit((current) => ({ ...current, title: event.target.value }))
              }
            />
          </label>
          <label className={styles.field}>
            <span>Pages to be covered</span>
            <input
              placeholder="Coursebook pages 12–25; Workbook pages 8–14"
              value={newUnit.pages_text}
              onChange={(event) =>
                setNewUnit((current) => ({ ...current, pages_text: event.target.value }))
              }
            />
          </label>
          <label className={`${styles.field} ${styles.fullWidth}`}>
            <span>Content / topics</span>
            <textarea
              value={newUnit.content_text}
              onChange={(event) =>
                setNewUnit((current) => ({ ...current, content_text: event.target.value }))
              }
            />
          </label>
          <label className={styles.field}>
            <span>Target date to finish</span>
            <input
              type="date"
              value={newUnit.target_completion_date}
              onChange={(event) =>
                setNewUnit((current) => ({
                  ...current,
                  target_completion_date: event.target.value,
                }))
              }
            />
          </label>
          <div />
          <label className={styles.field}>
            <span>Exam-week start (optional)</span>
            <input
              type="date"
              value={newUnit.exam_week_start_date}
              onChange={(event) =>
                setNewUnit((current) => ({
                  ...current,
                  exam_week_start_date: event.target.value,
                }))
              }
            />
          </label>
          <label className={styles.field}>
            <span>Exam-week end (optional)</span>
            <input
              min={newUnit.exam_week_start_date || undefined}
              type="date"
              value={newUnit.exam_week_end_date}
              onChange={(event) =>
                setNewUnit((current) => ({
                  ...current,
                  exam_week_end_date: event.target.value,
                }))
              }
            />
          </label>
          <label className={`${styles.field} ${styles.fullWidth}`}>
            <span>Exam information / instructions (optional)</span>
            <textarea
              value={newUnit.exam_information}
              onChange={(event) =>
                setNewUnit((current) => ({
                  ...current,
                  exam_information: event.target.value,
                }))
              }
            />
          </label>
        </div>
        <div className={styles.unitActions}>
          <button
            className={styles.primary}
            disabled={Boolean(busyKey)}
            type="button"
            onClick={async () => {
              const saved = await perform(
                "unit-new",
                () => createSyllabusUnit(syllabus.id, newUnit),
                "Unit added."
              );
              if (saved) setNewUnit(emptyUnit);
            }}
          >
            Add unit
          </button>
        </div>
      </section>
    </section>
  );
}

export default function AdminSyllabusesPage() {
  const [syllabuses, setSyllabuses] = useState<Syllabus[]>([]);
  const [references, setReferences] = useState(emptyReferences);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<Notice>({ text: "", error: false });
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    academic_year_id: "",
    level_id: "",
    title: "",
  });
  const [yearFilter, setYearFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const payload = await getAdminSyllabuses();
      setSyllabuses(payload.syllabuses);
      setReferences(payload.reference_data);
      setSelectedId((current) =>
        payload.syllabuses.some((item) => item.id === current)
          ? current
          : payload.syllabuses[0]?.id || ""
      );
      const currentYear = payload.reference_data.academic_years.find(
        (year) => year.status === "current"
      );
      setCreateForm((current) => ({
        ...current,
        academic_year_id:
          current.academic_year_id ||
          currentYear?.id ||
          payload.reference_data.academic_years[0]?.id ||
          "",
      }));
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to load syllabuses."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const filtered = useMemo(
    () =>
      syllabuses.filter(
        (item) =>
          (yearFilter === "all" || item.academic_year_id === yearFilter) &&
          (levelFilter === "all" || String(item.level_id) === levelFilter) &&
          (statusFilter === "all" || item.status === statusFilter)
      ),
    [levelFilter, statusFilter, syllabuses, yearFilter]
  );
  const selected = filtered.find((item) => item.id === selectedId) || null;

  function replaceSyllabus(next: Syllabus) {
    setSyllabuses((current) =>
      current.map((item) => (item.id === next.id ? next : item))
    );
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const levelId = Number(createForm.level_id);
    const duplicate = syllabuses.find(
      (item) =>
        item.academic_year_id === createForm.academic_year_id &&
        item.level_id === levelId
    );
    if (duplicate) {
      setSelectedId(duplicate.id);
      setNotice({
        text: "A syllabus already exists for that academic year and level.",
        error: true,
      });
      return;
    }

    setCreating(true);
    setNotice({ text: "", error: false });
    try {
      const result = await createSyllabus({
        academic_year_id: createForm.academic_year_id,
        level_id: levelId,
        title: createForm.title,
      });
      setSyllabuses((current) => [result.syllabus, ...current]);
      setSelectedId(result.syllabus.id);
      setCreateForm((current) => ({ ...current, title: "" }));
      setNotice({ text: "Draft syllabus created.", error: false });
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : "Unable to create the syllabus.",
        error: true,
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <AdminLayout>
      <main className={styles.page}>
        <header className={styles.heading}>
          <div>
            <h1>Syllabuses</h1>
            <p>Create one annual syllabus per level and publish it to every matching eligible Teacher class.</p>
          </div>
          <div className={styles.summary}>
            <span>Published syllabuses</span>
            <strong>{syllabuses.filter((item) => item.status === "published").length}</strong>
          </div>
        </header>

        {notice.text && (
          <div
            className={`${styles.notice} ${notice.error ? styles.noticeError : ""}`}
            role={notice.error ? "alert" : "status"}
          >
            {notice.text}
          </div>
        )}

        <form className={styles.panel} onSubmit={handleCreate}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Create syllabus</h2>
              <p>New syllabuses begin as Draft and remain Admin-only until published.</p>
            </div>
          </div>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Academic year</span>
              <select
                required
                value={createForm.academic_year_id}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    academic_year_id: event.target.value,
                  }))
                }
              >
                <option value="">Choose academic year</option>
                {references.academic_years.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.label} · {year.status}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Level</span>
              <select
                required
                value={createForm.level_id}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    level_id: event.target.value,
                  }))
                }
              >
                <option value="">Choose level</option>
                {references.levels.map((level) => (
                  <option key={level.id} value={level.id}>{level.name}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Custom title (optional)</span>
              <input
                placeholder="Generated from level and year if blank"
                value={createForm.title}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            <div className={`${styles.createActions} ${styles.fullWidth}`}>
              <button className={styles.primary} disabled={creating} type="submit">
                {creating ? "Creating…" : "Create draft syllabus"}
              </button>
            </div>
          </div>
        </form>

        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Find a syllabus</h2>
              <p>Filter historical and current syllabus records.</p>
            </div>
          </div>
          <div className={styles.filters}>
            <label className={styles.field}>
              <span>Academic year</span>
              <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
                <option value="all">All academic years</option>
                {references.academic_years.map((year) => (
                  <option key={year.id} value={year.id}>{year.label}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Level</span>
              <select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}>
                <option value="all">All levels</option>
                {references.levels.map((level) => (
                  <option key={level.id} value={level.id}>{level.name}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">Draft and Published</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </label>
          </div>
        </section>

        {loading ? (
          <div className={styles.empty}>Loading syllabuses…</div>
        ) : loadError ? (
          <div className={`${styles.empty} ${styles.noticeError}`} role="alert">
            <p>{loadError}</p>
            <button className={styles.secondary} type="button" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : syllabuses.length === 0 ? (
          <div className={styles.empty}>No syllabuses have been created yet.</div>
        ) : (
          <div className={styles.workspace}>
            <aside className={styles.list} aria-label="Syllabus records">
              {filtered.length === 0 ? (
                <div className={styles.empty}>No syllabuses match these filters.</div>
              ) : (
                filtered.map((item) => (
                  <button
                    className={`${styles.listCard} ${
                      selectedId === item.id ? styles.listCardActive : ""
                    }`}
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                  >
                    <strong>{item.title}</strong>
                    <span className={styles.listMeta}>
                      <span className={`${styles.badge} ${item.status === "published" ? styles.published : styles.draft}`}>
                        {item.status}
                      </span>
                      <span>{item.units.length} {item.units.length === 1 ? "unit" : "units"}</span>
                    </span>
                    <span className={styles.listMeta}>
                      {item.level.name} · {item.academic_year.label}
                    </span>
                    <span className={styles.listMeta}>Updated {formatDateTime(item.updated_at)}</span>
                  </button>
                ))
              )}
            </aside>
            {selected ? (
              <SyllabusEditor
                key={selected.id}
                onNotice={setNotice}
                onRemove={(id) => {
                  setSyllabuses((current) => current.filter((item) => item.id !== id));
                  setSelectedId("");
                }}
                onReplace={replaceSyllabus}
                syllabus={selected}
              />
            ) : (
              <div className={styles.empty}>Choose a syllabus to manage it.</div>
            )}
          </div>
        )}
      </main>
    </AdminLayout>
  );
}
