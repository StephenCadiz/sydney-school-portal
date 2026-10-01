"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "../../../lib/supabase";

type ExamPart = {
  id: string | null;
  type: string;
  skill?: string;
  skill_label?: string;
  label: string;
  part_number?: number | null;
  subparts?: Array<{ id: string; part_number: number; label: string; sort_order?: number }>;
  resources: Array<{ type: string; label: string; url: string }>;
};
type Exam = { id: string; exam_number: number; title: string | null; parts: ExamPart[] };
type CoursePlanItem = {
  id: string;
  exam_set_id: string;
  exam_part_id: string | null;
  exam_subpart_id?: string | null;
  purpose: "class_practice" | "homework";
  selection_scope: "full_exam" | "skill" | "part";
};
type CoursePlanResource = {
  id: string;
  resource_type: "pdf" | "audio" | "external_link" | "class_resource";
  label: string;
  external_url: string | null;
  class_resource_id: string | null;
  url: string | null;
};
type PlannedDay = {
  id: string;
  lesson_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  pages_to_cover: string | null;
  other_activities: string | null;
  homework_instructions: string | null;
  homework_due_date: string | null;
  exam_items: CoursePlanItem[];
  resources: CoursePlanResource[];
  closure: {
    id: string;
    name: string;
    closure_type: string;
    start_date: string;
    end_date: string;
  } | null;
};
type CoursePlanSnapshot = {
  class: {
    id: string;
    name: string;
    level: string;
    course_type: string;
    teacher: string;
    days: string;
    scheduled_start_time: string;
    scheduled_end_time: string;
    start_date: string | null;
    end_date: string | null;
  };
  blocked: boolean;
  blocked_message: string | null;
  plan: { id: string; book_name: string; status: "draft" | "published"; updated_at: string; days: PlannedDay[] } | null;
  exams: Exam[];
  class_resources: Array<{ id: string; title: string; resource_url: string }>;
};
type FormExamItem = {
  exam_set_id: string;
  exam_part_id: string | null;
  exam_subpart_id?: string | null;
  purpose: "class_practice" | "homework";
  selection_scope: "full_exam" | "skill" | "part";
};
type FormResource = {
  resource_type: "external_link" | "class_resource";
  label: string;
  external_url: string;
  class_resource_id: string;
};
type DayForm = {
  pagesToCover: string;
  otherActivities: string;
  homeworkInstructions: string;
  homeworkDueDate: string;
  examItems: FormExamItem[];
  resources: FormResource[];
};

const EMPTY_FORM: DayForm = {
  pagesToCover: "",
  otherActivities: "",
  homeworkInstructions: "",
  homeworkDueDate: "",
  examItems: [],
  resources: [],
};

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value + "T12:00:00Z"));
}

function displayTime(value: string) {
  return value.slice(0, 5);
}

function closureTypeLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ClosureLessonCard({
  closure,
  lessonDate,
  startTime,
  endTime,
}: {
  closure: NonNullable<PlannedDay["closure"]>;
  lessonDate: string;
  startTime: string;
  endTime: string;
}) {
  return (
    <section className="course-planning-closure-card" role="status" aria-label="School closed">
      <p className="course-planning-closure-eyebrow">School closed</p>
      <h4>{closure.name}</h4>
      <dl>
        <div><dt>Type</dt><dd>{closureTypeLabel(closure.closure_type)}</dd></div>
        <div><dt>Lesson date</dt><dd>{displayDate(lessonDate)}</dd></div>
        <div><dt>Scheduled time</dt><dd>{displayTime(startTime)} – {displayTime(endTime)}</dd></div>
      </dl>
      <p className="course-planning-closure-note">No planning required for this date.</p>
    </section>
  );
}

function formFromDay(day: PlannedDay | null, nextDay: PlannedDay | null): DayForm {
  if (!day) return EMPTY_FORM;
  return {
    pagesToCover: day.pages_to_cover || "",
    otherActivities: day.other_activities || "",
    homeworkInstructions: day.homework_instructions || "",
    homeworkDueDate: day.homework_due_date || nextDay?.lesson_date || "",
    examItems: day.exam_items.map((item) => ({
      exam_set_id: item.exam_set_id,
      exam_part_id: item.exam_part_id,
      exam_subpart_id: item.exam_subpart_id || null,
      purpose: item.purpose,
      selection_scope: item.selection_scope,
    })),
    resources: day.resources
      .filter((item) => item.resource_type === "external_link" || item.resource_type === "class_resource")
      .map((item) => ({
        resource_type: item.resource_type as "external_link" | "class_resource",
        label: item.label,
        external_url: item.external_url || "",
        class_resource_id: item.class_resource_id || "",
      })),
  };
}

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Authentication required.");
  return session.access_token;
}

async function readResponse(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    throw new Error(payload?.error || "Course Planning could not be updated.");
  }
  return payload as CoursePlanSnapshot & { message?: string };
}

export default function CoursePlanningTab({
  classId,
  adminMode = false,
}: {
  classId: string;
  adminMode?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<CoursePlanSnapshot | null>(null);
  const [selectedDayId, setSelectedDayId] = useState("");
  const [form, setForm] = useState<DayForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [examSetId, setExamSetId] = useState("");
  const [examPartId, setExamPartId] = useState("");
  const [examPurpose, setExamPurpose] = useState<"class_practice" | "homework">("class_practice");
  const [resourceKind, setResourceKind] = useState<"external_link" | "class_resource">("external_link");
  const [resourceLabel, setResourceLabel] = useState("");
  const [resourceValue, setResourceValue] = useState("");
  const [uploadLabel, setUploadLabel] = useState("");
  const [bookName, setBookName] = useState("");
  const [viewMode, setViewMode] = useState<"edit" | "final">("edit");
  const [openExamPurpose, setOpenExamPurpose] = useState<FormExamItem["purpose"] | null>(null);
  const [activeExamByPurpose, setActiveExamByPurpose] = useState<Record<FormExamItem["purpose"], string>>({
    class_practice: "",
    homework: "",
  });
  const examMenuRef = useRef<HTMLDivElement | null>(null);
  const endpoint = "/api/teacher/classes/" + encodeURIComponent(classId) + "/course-planning";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        headers: { Authorization: "Bearer " + await getToken() },
        cache: "no-store",
      });
      setSnapshot(await readResponse(response));
    } catch (loadError: any) {
      setSnapshot(null);
      setError(loadError?.message || "Unable to load Course Planning.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  const selectedDayIndex = useMemo(
    () => snapshot?.plan?.days.findIndex((day) => day.id === selectedDayId) ?? -1,
    [selectedDayId, snapshot]
  );
  const selectedDay = selectedDayIndex >= 0 ? snapshot?.plan?.days[selectedDayIndex] || null : null;
  const selectedDayIsClosed = Boolean(selectedDay?.closure);
  const selectedExam = snapshot?.exams.find((exam) => exam.id === examSetId) || null;
  useEffect(() => {
    const days = snapshot?.plan?.days || [];
    if (!days.length) {
      setSelectedDayId("");
      setForm(EMPTY_FORM);
      return;
    }
    const index = days.findIndex((day) => day.id === selectedDayId);
    const resolved = index >= 0 ? index : 0;
    setSelectedDayId(days[resolved].id);
    setForm(formFromDay(days[resolved], days[resolved + 1] || null));
    setError("");
  }, [selectedDayId, snapshot]);

  useEffect(() => {
    if (!openExamPurpose) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!examMenuRef.current?.contains(event.target as Node)) setOpenExamPurpose(null);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenExamPurpose(null);
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openExamPurpose]);

  function applySnapshot(payload: CoursePlanSnapshot & { message?: string }) {
    setSnapshot(payload);
    setMessage(payload.message || "");
    window.dispatchEvent(new Event("teacher-course-planning-updated"));
  }

  async function request(action: "create" | "publish" | "unpublish") {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: action === "create" ? "POST" : "PATCH",
        headers: {
          Authorization: "Bearer " + await getToken(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, book_name: bookName }),
      });
      applySnapshot(await readResponse(response));
    } catch (requestError: any) {
      setError(requestError?.message || "Unable to update Course Planning.");
    } finally {
      setSaving(false);
    }
  }

  function addExamItem() {
    if (!examSetId) {
      setError("Choose a Cambridge exam first.");
      return;
    }
    setForm((current) => ({
      ...current,
      examItems: [
        ...current.examItems,
        {
          exam_set_id: examSetId,
          exam_part_id: examPartId || null,
          purpose: examPurpose,
          selection_scope: examPartId ? "part" : "full_exam",
        },
      ],
    }));
    setError("");
  }

  const supportsMultiPartSelections = ["express", "intensive"].includes(
    snapshot?.class.course_type.trim().toLowerCase() || ""
  );

  function examPartsFor(exam: Exam | null | undefined): ExamPart[] {
    if (!exam) return [];
    const numbered = exam.parts.flatMap((skill) =>
      (skill.subparts || []).map((part) => ({
        id: part.id,
        type: skill.type,
        skill: skill.skill || skill.type,
        skill_label: skill.skill_label || skill.label,
        label: part.label || `Part ${part.part_number}`,
        part_number: part.part_number,
        resources: skill.resources,
      }))
    );
    return numbered.length ? numbered : exam.parts;
  }

  function parentSkillFor(exam: Exam, part: ExamPart) {
    return exam.parts.find((skill) => (skill.subparts || []).some((subpart) => subpart.id === part.id)) || part;
  }

  function itemsForPurpose(purpose: FormExamItem["purpose"]) {
    return form.examItems.filter((item) => item.purpose === purpose);
  }

  function examSelectionCount(examId: string, purpose: FormExamItem["purpose"]) {
    return itemsForPurpose(purpose).filter((item) => item.exam_set_id === examId).length;
  }

  function openExamMenu(purpose: FormExamItem["purpose"], preferAnother = false) {
    if (selectedDayIsClosed) return;
    if (!snapshot?.exams.length) return;
    const selectedExamIds = new Set(itemsForPurpose(purpose).map((item) => item.exam_set_id));
    const currentExamId = activeExamByPurpose[purpose];
    const nextExam = preferAnother
      ? snapshot.exams.find((exam) => !selectedExamIds.has(exam.id)) || snapshot.exams.find((exam) => exam.id === currentExamId)
      : snapshot.exams.find((exam) => exam.id === currentExamId) || snapshot.exams[0];
    setActiveExamByPurpose((current) => ({ ...current, [purpose]: nextExam?.id || "" }));
    setOpenExamPurpose(purpose);
  }

  function isWholeExamSelected(examSetId: string, purpose: FormExamItem["purpose"]) {
    return itemsForPurpose(purpose).some(
      (item) => item.exam_set_id === examSetId && item.selection_scope === "full_exam"
    );
  }

  function isExamPartSelected(
    examSetId: string,
    examPartId: string,
    purpose: FormExamItem["purpose"]
  ) {
    const exam = snapshot?.exams.find((candidate) => candidate.id === examSetId);
    const candidate = examPartsFor(exam).find((part) => part.id === examPartId);
    const parentId = candidate ? parentSkillFor(exam as Exam, candidate).id : null;
    return itemsForPurpose(purpose).some((item) =>
      item.exam_set_id === examSetId &&
      (item.selection_scope === "full_exam" || item.exam_subpart_id === examPartId || item.exam_part_id === examPartId || (item.selection_scope === "skill" && item.exam_part_id === parentId))
    );
  }

  function assignedPurposeForPart(examSetId: string, examPartId: string) {
    const exam = snapshot?.exams.find((candidate) => candidate.id === examSetId);
    const candidate = examPartsFor(exam).find((part) => part.id === examPartId);
    const parentId = candidate && exam ? parentSkillFor(exam, candidate).id : null;
    const match = form.examItems.find((item) => {
      if (item.exam_set_id !== examSetId) return false;
      if (item.selection_scope === "full_exam") return true;
      return item.exam_subpart_id === examPartId || item.exam_part_id === examPartId || (item.selection_scope === "skill" && item.exam_part_id === parentId);
    });
    return match?.purpose || null;
  }

  function partUnavailableInPurpose(examSetId: string, examPartId: string, purpose: FormExamItem["purpose"]) {
    const assignedPurpose = assignedPurposeForPart(examSetId, examPartId);
    return Boolean(assignedPurpose && assignedPurpose !== purpose);
  }

  function remainingPartsForExam(examId: string, purpose: FormExamItem["purpose"]) {
    const exam = snapshot?.exams.find((candidate) => candidate.id === examId);
    return examPartsFor(exam).filter((part) => {
      if (!part.id) return false;
      return !isExamPartSelected(examId, String(part.id), purpose) &&
        !partUnavailableInPurpose(examId, String(part.id), purpose);
    });
  }

  function wholeExamBlockers(exam: Exam) {
    return examPartsFor(exam)
      .filter((part) => part.id && assignedPurposeForPart(exam.id, String(part.id)))
      .map((part) => `${part.skill_label || part.type} ${part.label}`)
      .slice(0, 8);
  }

  function toggleWholeSkill(examId: string, partType: string, purpose: FormExamItem["purpose"]) {
    const selectedExamForSkill = snapshot?.exams.find((exam) => exam.id === examId);
    const candidates = selectedExamForSkill
      ? examPartsFor(selectedExamForSkill)
          .filter((part) => part.id && (part.skill || part.type) === partType)
          .map((part) => ({ exam: selectedExamForSkill, part }))
      : [];
    const blocked = candidates.find(({ exam, part }) => partUnavailableInPurpose(exam.id, String(part.id), purpose));
    if (blocked) {
      setError("One or more parts in this skill are already assigned to the other activity.");
      return;
    }
    const allSelected = candidates.length > 0 && candidates.every(({ exam, part }) =>
      isExamPartSelected(exam.id, String(part.id), purpose)
    );
    updateExamSelections(purpose, (items) => {
      const candidateKeys = new Set(candidates.map(({ exam, part }) => `${exam.id}:${part.id}`));
      const candidateParentKeys = new Set(candidates.map(({ exam, part }) => `${exam.id}:${parentSkillFor(exam, part).id}`));
      const withoutSkill = items.filter((item) =>
        !(item.selection_scope !== "full_exam" && (candidateKeys.has(`${item.exam_set_id}:${item.exam_subpart_id || item.exam_part_id}`) || (item.selection_scope === "skill" && candidateParentKeys.has(`${item.exam_set_id}:${item.exam_part_id}`))))
      );
      if (allSelected) return withoutSkill;
      const next = [...withoutSkill];
      for (const { exam, part } of candidates) {
        if (!isExamPartSelected(exam.id, String(part.id), purpose)) {
          const parent = parentSkillFor(exam, part);
          next.push({ exam_set_id: exam.id, exam_part_id: parent.id, exam_subpart_id: part.id, purpose, selection_scope: "part" });
        }
      }
      return next;
    });
    setOpenExamPurpose(null);
  }

  function updateExamSelections(
    purpose: FormExamItem["purpose"],
    update: (items: FormExamItem[]) => FormExamItem[]
  ) {
    setForm((current) => {
      const otherItems = current.examItems.filter((item) => item.purpose !== purpose);
      const nextItems = update(current.examItems.filter((item) => item.purpose === purpose));
      return { ...current, examItems: [...otherItems, ...nextItems] };
    });
    setError("");
  }

  function toggleWholeExam(exam: Exam, purpose: FormExamItem["purpose"]) {
    const currentlySelected = isWholeExamSelected(exam.id, purpose);
    if (!currentlySelected) {
      const blocked = examPartsFor(exam).find((part) => part.id && partUnavailableInPurpose(exam.id, String(part.id), purpose));
      if (blocked) {
        setError("A part in this exam is already assigned to the other activity.");
        return;
      }
    }
    updateExamSelections(purpose, (items) => {
      const withoutExam = items.filter((item) => item.exam_set_id !== exam.id);
      if (currentlySelected) return withoutExam;
      return [
        ...withoutExam,
        {
          exam_set_id: exam.id,
          exam_part_id: null,
          exam_subpart_id: null,
          purpose,
          selection_scope: "full_exam",
        },
      ];
    });
    setOpenExamPurpose(null);
  }

  function toggleExamPart(
    exam: Exam,
    part: ExamPart,
    purpose: FormExamItem["purpose"]
  ) {
    if (!part.id) return;
    if (partUnavailableInPurpose(exam.id, part.id, purpose)) {
      setError("This part is already assigned to the other activity. Remove it there first.");
      return;
    }
    const wholeSelected = isWholeExamSelected(exam.id, purpose);
    const currentlySelected = isExamPartSelected(exam.id, part.id, purpose);
    updateExamSelections(purpose, (items) => {
      if (wholeSelected) {
        // Turning off one part converts the legacy whole-exam row into the
        // remaining explicit parts, keeping the selection precise.
        return examPartsFor(exam)
          .filter((candidate) => candidate.id && candidate.id !== part.id)
          .map((candidate) => ({
            exam_set_id: exam.id,
            exam_part_id: parentSkillFor(exam, candidate).id,
            exam_subpart_id: candidate.id,
            purpose,
            selection_scope: "part" as const,
          }));
      }
      if (currentlySelected) {
        const parent = parentSkillFor(exam, part);
        const skillSelected = items.some((item) => item.exam_set_id === exam.id && item.selection_scope === "skill" && item.exam_part_id === parent.id);
        if (skillSelected) {
          return [
            ...items.filter((item) => !(item.exam_set_id === exam.id && item.selection_scope === "skill" && item.exam_part_id === parent.id)),
            ...examPartsFor(exam)
              .filter((candidate) => candidate.id && candidate.id !== part.id && parentSkillFor(exam, candidate).id === parent.id)
              .map((candidate) => ({ exam_set_id: exam.id, exam_part_id: parent.id, exam_subpart_id: candidate.id, purpose, selection_scope: "part" as const })),
          ];
        }
        return items.filter(
          (item) => !(item.exam_set_id === exam.id && (item.exam_subpart_id === part.id || item.exam_part_id === part.id))
        );
      }
      return [
        ...items,
        {
          exam_set_id: exam.id,
          exam_part_id: parentSkillFor(exam, part).id,
          exam_subpart_id: part.id,
          purpose,
          selection_scope: "part",
        },
      ];
    });
    setOpenExamPurpose(null);
  }

  function selectedExamLabel(item: FormExamItem) {
    const exam = snapshot?.exams.find((candidate) => candidate.id === item.exam_set_id);
    const part = item.selection_scope === "skill"
      ? exam?.parts.find((candidate) => candidate.id === item.exam_part_id)
      : examPartsFor(exam).find((candidate) => candidate.id === (item.exam_subpart_id || item.exam_part_id));
    const skill = part?.skill_label || part?.label || "";
    const scope = item.selection_scope === "full_exam"
      ? "Whole exam"
      : item.selection_scope === "skill"
      ? `Whole skill · ${skill}`
      : `${skill} · ${part?.label || "Part"}`;
    return (
      "Exam " +
      (exam?.exam_number || "") +
      (exam?.title ? " · " + exam.title : "") +
      " · " + scope +
      " · " + (item.purpose === "homework" ? "Homework" : "Classwork")
    );
  }

  function selectedChipItems(purpose: FormExamItem["purpose"]) {
    const source = itemsForPurpose(purpose);
    const consumed = new Set<FormExamItem>();
    const result: Array<{ item: FormExamItem; label: string; remove: FormExamItem[] }> = [];
    for (const item of source) {
      if (consumed.has(item)) continue;
      const exam = snapshot?.exams.find((candidate) => candidate.id === item.exam_set_id);
      const part = examPartsFor(exam).find((candidate) => candidate.id === item.exam_subpart_id);
      const parent = exam && part ? parentSkillFor(exam, part) : null;
      const skillParts = exam && parent ? examPartsFor(exam).filter((candidate) => parentSkillFor(exam, candidate).id === parent.id) : [];
      const skillItems = parent && skillParts.length
        ? source.filter((candidate) => candidate.exam_set_id === item.exam_set_id && candidate.selection_scope === "part" && candidate.exam_subpart_id && skillParts.some((candidatePart) => candidatePart.id === candidate.exam_subpart_id))
        : [];
      if (item.selection_scope === "part" && parent && skillItems.length === skillParts.length && skillParts.length > 0) {
        skillItems.forEach((candidate) => consumed.add(candidate));
        result.push({
          item,
          remove: skillItems,
          label: `Exam ${exam?.exam_number || ""}${exam?.title ? ` · ${exam.title}` : ""} · Whole skill · ${parent.skill_label || parent.label} · ${purpose === "homework" ? "Homework" : "Classwork"}`,
        });
      } else {
        consumed.add(item);
        result.push({ item, remove: [item], label: selectedExamLabel(item) });
      }
    }
    return result;
  }

  function examItemName(item: FormExamItem) {
    const exam = snapshot?.exams.find((candidate) => candidate.id === item.exam_set_id);
    const part = item.selection_scope === "skill"
      ? exam?.parts.find((candidate) => candidate.id === item.exam_part_id)
      : examPartsFor(exam).find((candidate) => candidate.id === (item.exam_subpart_id || item.exam_part_id));
    const prefix = item.purpose === "homework" ? "Homework" : "Class practice";
    return prefix + ": Exam " + (exam?.exam_number || "") + (exam?.title ? " · " + exam.title : "") + (part ? " — " + (part.skill_label || part.label) + " · " + part.label : " — Full exam");
  }

  function examMaterialLinks(item: CoursePlanItem) {
    return materialLinksFor(item.exam_set_id, item.exam_part_id, item.exam_subpart_id || null, item.selection_scope, item.id);
  }

  function materialLinksFor(
    examSet: string,
    examPart: string | null,
    examSubpart: string | null,
    scope: "full_exam" | "skill" | "part",
    keyPrefix: string
  ) {
    const exam = snapshot?.exams.find((candidate) => candidate.id === examSet);
    const parts =
      scope === "full_exam"
        ? exam?.parts || []
        : scope === "skill"
        ? (exam?.parts || []).filter((part) => part.id === examPart)
        : examPartsFor(exam).filter((part) => part.id === (examSubpart || examPart));
    return parts.flatMap((part) =>
      part.resources.map((resource) => ({
        key: keyPrefix + "-" + part.id + "-" + resource.type,
        label: (part.skill_label || part.label) + " · " + part.label + " · " + resource.label,
        url: resource.url,
      }))
    );
  }

  function addResource() {
    if (!resourceLabel.trim() || !resourceValue) {
      setError("Add a resource label and choose its source.");
      return;
    }
    setForm((current) => ({
      ...current,
      resources: [
        ...current.resources,
        {
          resource_type: resourceKind,
          label: resourceLabel.trim(),
          external_url: resourceKind === "external_link" ? resourceValue : "",
          class_resource_id: resourceKind === "class_resource" ? resourceValue : "",
        },
      ],
    }));
    setResourceLabel("");
    setResourceValue("");
    setError("");
  }

  async function saveDay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDay) return;
    if (selectedDay.closure) {
      setError(`School is closed on ${selectedDay.lesson_date} for ${selectedDay.closure.name}. This lesson is read-only.`);
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + await getToken(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "save_day",
          day_id: selectedDay.id,
          pages_to_cover: form.pagesToCover || null,
          other_activities: form.otherActivities || null,
          homework_instructions: form.homeworkInstructions || null,
          homework_due_date: form.homeworkDueDate || null,
          exam_items: form.examItems,
          resources: form.resources,
        }),
      });
      applySnapshot(await readResponse(response));
    } catch (saveError: any) {
      setError(saveError?.message || "Unable to save the planned lesson.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadResource(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedDay || selectedDay.closure) return;
    setUploading(true);
    setError("");
    try {
      const data = new FormData();
      data.set("day_id", selectedDay.id);
      data.set("label", uploadLabel.trim() || file.name);
      data.set("file", file);
      const response = await fetch(endpoint + "/resources", {
        method: "POST",
        headers: { Authorization: "Bearer " + await getToken() },
        body: data,
      });
      applySnapshot(await readResponse(response));
      setUploadLabel("");
    } catch (uploadError: any) {
      setError(uploadError?.message || "Unable to upload the course resource.");
    } finally {
      setUploading(false);
    }
  }

  async function deleteResource(resourceId: string) {
    if (selectedDayIsClosed) return;
    if (!confirm("Remove this resource from the planned lesson?")) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(endpoint + "/resources/" + encodeURIComponent(resourceId), {
        method: "DELETE",
        headers: { Authorization: "Bearer " + await getToken() },
      });
      applySnapshot(await readResponse(response));
    } catch (deleteError: any) {
      setError(deleteError?.message || "Unable to remove the course resource.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="course-planning-state">Loading Course Planning...</p>;
  if (error && !snapshot) return <div className="course-planning-state is-error"><p>{error}</p><button type="button" onClick={() => void load()}>Try again</button></div>;
  if (!snapshot) return null;
  if (snapshot.blocked) {
    return <section className="course-planning-blocked"><p className="course-planning-eyebrow">Course Planning</p><h2>Course dates are needed</h2><p>{snapshot.blocked_message}</p></section>;
  }
  if (!snapshot.plan) {
    return (
      <section className="course-planning-setup">
        <p className="course-planning-eyebrow">{snapshot.class.level} · {snapshot.class.course_type}</p>
        <h2>Set up Course Planning</h2>
        <p>{displayDate(String(snapshot.class.start_date))} to {displayDate(String(snapshot.class.end_date))}. {snapshot.class.teacher} teaches {snapshot.class.days} at {snapshot.class.scheduled_start_time.slice(0, 5)}–{snapshot.class.scheduled_end_time.slice(0, 5)}.</p>
        <label className="course-planning-book-input"><span>Book used</span><input required value={bookName} onChange={(event) => setBookName(event.target.value)} placeholder="e.g. Compact First" /></label>
        <button type="button" disabled={saving} onClick={() => void request("create")}>{saving ? "Creating..." : "Create course plan"}</button>
        {error && <p className="course-planning-feedback is-error">{error}</p>}
      </section>
    );
  }

  return (
    <section className="course-planning">
      <header className="course-planning-header">
        <div><p className="course-planning-eyebrow">Course Planning · {snapshot.class.level}</p><h2>{snapshot.class.name}</h2><p>{snapshot.plan.book_name} · {snapshot.class.teacher} · {displayDate(String(snapshot.class.start_date))} – {displayDate(String(snapshot.class.end_date))}</p><p>Last updated {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" }).format(new Date(snapshot.plan.updated_at))}</p></div>
        <div className="course-planning-header-actions">
          <span className={"course-planning-status is-" + snapshot.plan.status}>{snapshot.plan.status}</span>
          {!selectedDayIsClosed && <button type="button" className="is-secondary" onClick={() => setViewMode((current) => current === "edit" ? "final" : "edit")}>{viewMode === "edit" ? "View final plan" : "Edit plan"}</button>}
          {!selectedDayIsClosed && (snapshot.plan.status === "draft" ? <button type="button" disabled={saving} onClick={() => void request("publish")}>Publish for students</button> : adminMode ? <button type="button" className="is-secondary" disabled={saving} onClick={() => void request("unpublish")}>Unpublish</button> : null)}
        </div>
      </header>
      {message && <p className="course-planning-feedback">{message}</p>}
      {error && <p className="course-planning-feedback is-error">{error}</p>}
      {viewMode === "final" ? (
        <div className="course-planning-final-view">
          {snapshot.plan.days.map((day, index) => (
            <article key={day.id} className={day.closure ? "is-closed" : ""}>
              <header>
                <span>Lesson {index + 1}</span>
                <strong>{displayDate(day.lesson_date)}</strong>
                <small>{displayTime(day.scheduled_start_time)} – {displayTime(day.scheduled_end_time)}</small>
                {day.closure && <em>School closed</em>}
              </header>
              <div>
                {day.closure ? (
                  <ClosureLessonCard
                    closure={day.closure}
                    lessonDate={day.lesson_date}
                    startTime={day.scheduled_start_time}
                    endTime={day.scheduled_end_time}
                  />
                ) : (
                  <>
                    {day.pages_to_cover && <p><b>Pages to be covered:</b> {day.pages_to_cover}</p>}
                    {day.other_activities && <p><b>Other activities:</b> {day.other_activities}</p>}
                    <p><b>In-class exam practice:</b> {day.exam_items.filter((item) => item.purpose === "class_practice").length ? day.exam_items.filter((item) => item.purpose === "class_practice").map((item) => examItemName(item)).join(" · ") : "None planned"}</p>
                    {(day.homework_instructions || day.exam_items.some((item) => item.purpose === "homework")) && <p><b>Homework{day.homework_due_date ? " · Due " + displayDate(day.homework_due_date) : ""}:</b> {day.homework_instructions || "Exam Bank homework selected"}</p>}
                    <div className="course-planning-final-links">{day.exam_items.flatMap(examMaterialLinks).map((resource) => <a key={resource.key} href={resource.url} target="_blank" rel="noreferrer">{resource.label}</a>)}{day.resources.map((resource) => resource.url && <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer">{resource.label}</a>)}</div>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : <div className="course-planning-layout">
        <aside className="course-planning-days" aria-label="Planned lessons">
          <h3>{snapshot.plan.days.length} planned lessons</h3>
          {snapshot.plan.days.map((day, index) => <button type="button" key={day.id} className={(day.id === selectedDay?.id ? "is-selected " : "") + (day.closure ? "is-closed" : "")} onClick={() => setSelectedDayId(day.id)}><span>Lesson {index + 1}</span><strong>{displayDate(day.lesson_date)}</strong><small>{displayTime(day.scheduled_start_time)} – {displayTime(day.scheduled_end_time)}</small>{day.closure && <em>School closed</em>}</button>)}
        </aside>
        {selectedDay && (
          <div className="course-planning-editor">
            <div className="course-planning-editor-heading"><div><p className="course-planning-eyebrow">Lesson {selectedDayIndex + 1}</p><h3>{displayDate(selectedDay.lesson_date)}</h3></div><span>{displayTime(selectedDay.scheduled_start_time)} – {displayTime(selectedDay.scheduled_end_time)}</span></div>
            {selectedDay.closure ? (
              <ClosureLessonCard
                closure={selectedDay.closure}
                lessonDate={selectedDay.lesson_date}
                startTime={selectedDay.scheduled_start_time}
                endTime={selectedDay.scheduled_end_time}
              />
            ) : (
              <form onSubmit={saveDay}>
            <div className="course-planning-fields">
              <label className="is-wide"><span>Pages to be covered</span><input value={form.pagesToCover} onChange={(event) => setForm((current) => ({ ...current, pagesToCover: event.target.value }))} placeholder="e.g. Unit 3, pages 42–47 and Workbook page 16" /></label>
              <label className="is-wide"><span>Other activities</span><textarea value={form.otherActivities} onChange={(event) => setForm((current) => ({ ...current, otherActivities: event.target.value }))} placeholder="Speaking, revision, games or other lesson activities" /></label>
            </div>
            <section className="course-planning-detail-section course-planning-exam-section">
              <div className="course-planning-section-heading course-planning-exam-heading"><div><p>Exam activities</p><h4>Cambridge Exam Bank</h4><span className="course-planning-section-description">Choose the exam parts learners will practise in class or complete as homework.</span></div></div>
              {supportsMultiPartSelections ? (
                <div className="course-planning-exam-selectors" ref={examMenuRef}>
                  {(["class_practice", "homework"] as const).map((purpose) => {
                    const purposeItems = itemsForPurpose(purpose);
                    const menuOpen = openExamPurpose === purpose;
                    const activeExam = snapshot.exams.find((exam) => exam.id === activeExamByPurpose[purpose]) || null;
                    return (
                      <section className={"course-planning-exam-purpose" + (menuOpen ? " is-open" : "")} key={purpose}>
                        <div className="course-planning-purpose-heading">
                          <div><h5>{purpose === "homework" ? "Homework" : "Classwork"}</h5><p>{purpose === "homework" ? "Independent exam practice for learners" : "Exam practice completed during the lesson"}</p></div>
                          <button type="button" className="course-planning-exam-trigger" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => openExamMenu(purpose)}>
                            <span>{purposeItems.length ? `${purposeItems.length} ${purposeItems.length === 1 ? "selection" : "selections"}` : "Select exam parts"}</span><span aria-hidden="true">{menuOpen ? "⌃" : "⌄"}</span>
                          </button>
                        </div>
                        {menuOpen && (
                          <div className="course-planning-exam-popover" role="dialog" aria-label={(purpose === "homework" ? "Homework" : "Classwork") + " exam parts"}>
                            <div className="course-planning-exam-popover-body">
                              <div className="course-planning-exam-menu" role="listbox" aria-label="Available exams">
                                <span className="course-planning-exam-menu-label">Choose an exam</span>
                                {snapshot.exams.map((exam) => {
                                  const selectedCount = examSelectionCount(exam.id, purpose);
                                  return <button type="button" role="option" aria-selected={activeExam?.id === exam.id} className={activeExam?.id === exam.id ? "is-active" : ""} key={exam.id} onClick={() => setActiveExamByPurpose((current) => ({ ...current, [purpose]: exam.id }))}><span><strong>Exam {exam.exam_number}</strong><small>{exam.title || "Cambridge assessment"}</small></span>{selectedCount > 0 && <em>{selectedCount}</em>}</button>;
                                })}
                              </div>
                              <div className="course-planning-exam-choice">
                                {activeExam ? (
                                  <>
                                    <div className="course-planning-exam-choice-heading"><span>Exam {activeExam.exam_number}</span><strong>{activeExam.title || "Cambridge assessment"}</strong></div>
                                    <label className="course-planning-exam-whole" title={wholeExamBlockers(activeExam).length ? `Remove existing assignments (${wholeExamBlockers(activeExam).join(", ")}) before selecting Whole exam.` : undefined}><input type="checkbox" checked={isWholeExamSelected(activeExam.id, purpose)} disabled={wholeExamBlockers(activeExam).length > 0 && !isWholeExamSelected(activeExam.id, purpose)} onChange={() => toggleWholeExam(activeExam, purpose)} /><span>Whole exam</span></label>
                                    <div className="course-planning-exam-skill-actions"><span className="course-planning-exam-parts-label">Whole skill</span>{activeExam.parts.filter((part) => part.id && (part.skill || part.type) !== "speaking").map((skillPart) => { const skill = skillPart.skill || skillPart.type; const skillParts = examPartsFor({ ...activeExam, parts: [skillPart] }); const blocked = skillParts.some((part) => part.id && assignedPurposeForPart(activeExam.id, String(part.id)) && !isWholeExamSelected(activeExam.id, purpose)); return <button type="button" key={skill} className="course-planning-skill-button" disabled={blocked} title={blocked ? "Remove existing assignments in this skill before selecting Whole skill." : undefined} onClick={() => toggleWholeSkill(activeExam.id, skill, purpose)}>{skillPart.skill_label || skillPart.label}</button>; })}</div>
                                    <div className="course-planning-exam-parts"><span className="course-planning-exam-parts-label">Exam parts</span>{activeExam.parts.filter((part) => part.id && (part.skill || part.type) !== "speaking").map((skillPart) => <div className="course-planning-exam-skill-group" key={skillPart.id}><h6>{skillPart.skill_label || skillPart.label}</h6>{examPartsFor({ ...activeExam, parts: [skillPart] }).map((part) => { const selected = isExamPartSelected(activeExam.id, String(part.id), purpose); const assignedTo = assignedPurposeForPart(activeExam.id, String(part.id)); const unavailable = Boolean(assignedTo && assignedTo !== purpose); return <label className={"course-planning-exam-part" + (selected ? " is-selected" : "") + (unavailable ? " is-unavailable" : "")} key={part.id} title={unavailable ? `Assigned to ${assignedTo === "homework" ? "Homework" : "Classwork"}` : undefined}><input type="checkbox" checked={selected} disabled={unavailable} onChange={() => toggleExamPart(activeExam, part, purpose)} /><span className="course-planning-exam-part-name">{part.label}</span><span className="course-planning-exam-part-state">{selected ? `Assigned to ${purpose === "homework" ? "Homework" : "Classwork"}` : unavailable ? `Assigned to ${assignedTo === "homework" ? "Homework" : "Classwork"}` : "Not assigned"}</span></label>; })}</div>)}</div>
                                    <p className="course-planning-unassigned-indicator">{remainingPartsForExam(activeExam.id, purpose).length} unassigned part{remainingPartsForExam(activeExam.id, purpose).length === 1 ? "" : "s"} remaining</p>
                                  </>
                                ) : <p className="course-planning-exam-empty">Choose an exam to see its parts.</p>}
                              </div>
                            </div>
                            <div className="course-planning-exam-popover-footer"><span>Selecting an item closes this menu.</span><button type="button" className="is-secondary" onClick={() => setOpenExamPurpose(null)}>Done</button></div>
                          </div>
                        )}
                        <div className="course-planning-selected-exams" aria-label={purpose === "homework" ? "Selected homework exams" : "Selected classwork exams"}>
                          <div className="course-planning-selected-heading"><span className="course-planning-selected-label">Selected {purpose === "homework" ? "homework" : "classwork"}</span><span className="course-planning-selected-count">{purposeItems.length} {purposeItems.length === 1 ? "selection" : "selections"}</span>{purposeItems.length > 0 && <button type="button" className="course-planning-add-exam" onClick={() => openExamMenu(purpose, true)}>Add another exam</button>}</div>
                          {purposeItems.length ? selectedChipItems(purpose).map(({ item, label, remove }) => (
                            <span className="course-planning-selected-chip" key={item.exam_set_id + "-" + (item.exam_subpart_id || item.exam_part_id) + "-" + item.selection_scope}>
                              <span>{label}</span>
                              <button type="button" className="course-planning-chip-remove" aria-label={"Remove " + label} onClick={() => updateExamSelections(purpose, (items) => items.filter((candidate) => !remove.includes(candidate)))}><span aria-hidden="true">×</span></button>
                            </span>
                          )) : <span className="course-planning-selected-empty">No selections yet</span>}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div className="course-planning-add-row">
                    <select value={examSetId} onChange={(event) => { setExamSetId(event.target.value); setExamPartId(""); }}><option value="">Choose exam</option>{snapshot.exams.map((exam) => <option key={exam.id} value={exam.id}>Exam {exam.exam_number}{exam.title ? " · " + exam.title : ""}</option>)}</select>
                    <select value={examPartId} onChange={(event) => setExamPartId(event.target.value)} disabled={!selectedExam}><option value="">Full exam</option>{selectedExam?.parts.filter((part) => part.id).map((part) => <option key={part.id} value={String(part.id)}>{part.label}</option>)}</select>
                    <select value={examPurpose} onChange={(event) => setExamPurpose(event.target.value as "class_practice" | "homework")}><option value="class_practice">Class practice</option><option value="homework">Homework</option></select>
                    <button type="button" className="is-secondary" onClick={addExamItem}>Add</button>
                  </div>
                  <ul className="course-planning-item-list">{form.examItems.map((item, index) => <li key={item.exam_set_id + "-" + (item.exam_subpart_id || item.exam_part_id) + "-" + index}><div><span>{examItemName(item)}</span><div className="course-planning-item-links">{materialLinksFor(item.exam_set_id, item.exam_part_id, item.exam_subpart_id || null, item.selection_scope, String(index)).map((resource) => <a key={resource.key} href={resource.url} target="_blank" rel="noreferrer">{resource.label}</a>)}</div></div><button type="button" onClick={() => setForm((current) => ({ ...current, examItems: current.examItems.filter((_, itemIndex) => itemIndex !== index) }))}>Remove</button></li>)}{!form.examItems.length && <li className="is-empty">No Exam Bank activity planned for this lesson.</li>}</ul>
                </>
              )}
            </section>
            <section className="course-planning-detail-section">
              <div className="course-planning-section-heading"><div><p>Written homework</p><h4>Instructions and due date</h4></div></div>
              <div className="course-planning-fields"><label className="is-wide"><span>Written homework instructions</span><textarea value={form.homeworkInstructions} onChange={(event) => setForm((current) => ({ ...current, homeworkInstructions: event.target.value }))} placeholder="Add instructions for written homework." /></label><label><span>Due date</span><input type="date" min={selectedDay.lesson_date} value={form.homeworkDueDate} onChange={(event) => setForm((current) => ({ ...current, homeworkDueDate: event.target.value }))} /></label></div>
            </section>
            <section className="course-planning-detail-section">
              <div className="course-planning-section-heading"><div><p>Resources</p><h4>Lesson links and files</h4></div></div>
              <div className="course-planning-add-row">
                <select value={resourceKind} onChange={(event) => { setResourceKind(event.target.value as "external_link" | "class_resource"); setResourceValue(""); }}><option value="external_link">External link</option><option value="class_resource">Existing class resource</option></select>
                <input value={resourceLabel} onChange={(event) => setResourceLabel(event.target.value)} placeholder="Resource label" />
                {resourceKind === "external_link" ? <input type="url" value={resourceValue} onChange={(event) => setResourceValue(event.target.value)} placeholder="https://…" /> : <select value={resourceValue} onChange={(event) => setResourceValue(event.target.value)}><option value="">Choose class resource</option>{snapshot.class_resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.title}</option>)}</select>}
                <button type="button" className="is-secondary" onClick={addResource}>Add</button>
              </div>
              <ul className="course-planning-item-list">{form.resources.map((resource, index) => <li key={resource.resource_type + "-" + resource.label + "-" + index}><span>{resource.label}</span><button type="button" onClick={() => setForm((current) => ({ ...current, resources: current.resources.filter((_, resourceIndex) => resourceIndex !== index) }))}>Remove</button></li>)}{!form.resources.length && !selectedDay.resources.length && <li className="is-empty">No resources added yet.</li>}</ul>
              {selectedDay.resources.filter((resource) => resource.resource_type === "pdf" || resource.resource_type === "audio").map((resource) => <div className="course-planning-uploaded-resource" key={resource.id}><a href={resource.url || undefined} target="_blank" rel="noreferrer">{resource.label}</a><button type="button" onClick={() => void deleteResource(resource.id)}>Remove</button></div>)}
              <label className="course-planning-upload-control"><span>Upload PDF or audio</span><input value={uploadLabel} onChange={(event) => setUploadLabel(event.target.value)} placeholder="Optional display label" /><input type="file" accept="application/pdf,audio/*" disabled={uploading} onChange={uploadResource} /></label>
            </section>
            <div className="course-planning-save-row"><button type="submit" disabled={saving}>{saving ? "Saving..." : snapshot.plan.status === "draft" ? "Save Draft" : "Save changes"}</button></div>
              </form>
            )}
          </div>
        )}
      </div>}
    </section>
  );
}
