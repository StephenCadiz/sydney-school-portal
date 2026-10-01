import "server-only";

import { getHomeworkSkillLabel, normalizeHomeworkSkill } from "./homework";
import { isValidExternalUrl } from "./cambridgeExamBank";
import { skillLabelFor } from "./cambridgeExamPartDefinitions";
import { supabaseAdmin } from "./supabaseAdmin";
import type { TeacherHomeworkContext } from "./teacherHomeworkServer";

const ELIGIBLE_LEVELS = new Set(["B1", "B2", "C1", "C2"]);
// The authoritative exam-bank rows determine which parts exist for each level.
// Speaking is intentionally excluded from Express/Intensive planning and scoring.
const PART_ORDER = ["reading", "listening", "writing"] as const;
const LEGACY_PART_ORDER = [...PART_ORDER, "speaking"] as const;
const RESOURCE_ORDER = ["paper", "audio", "key", "sample_writing"] as const;

const ALLOWED_RESOURCES: Record<string, Set<string>> = {
  reading: new Set(["paper", "key"]),
  listening: new Set(["paper", "audio", "key"]),
  writing: new Set(["paper", "sample_writing"]),
  speaking: new Set(["paper"]),
};

function resourceLabel(partType: string, resourceType: string) {
  if (resourceType === "paper") return "Question Paper";
  if (resourceType === "audio") return "Audio";
  if (resourceType === "key") {
    return partType === "listening" ? "Key & Transcript" : "Key";
  }
  if (resourceType === "sample_writing") return "Writing Samples";
  return "";
}

export async function loadTeacherCambridgeExamLibrary(
  context: TeacherHomeworkContext
) {
  if (!ELIGIBLE_LEVELS.has(context.level)) {
    return {
      class: {
        id: context.classId,
        level: context.level,
        supported: false,
      },
      exams: [],
    };
  }

  const { data, error } = await supabaseAdmin
    .from("cambridge_exam_sets")
    .select(`
      id,
      exam_number,
      title,
      parts:cambridge_exam_parts (
        id,
        part_type,
        subparts:cambridge_exam_subparts (
          id,
          part_number,
          label,
          sort_order
        ),
        resources:cambridge_exam_part_resources (
          resource_type,
          external_url
        )
      )
    `)
    .eq("level_id", context.levelId)
    .eq("active", true)
    .is("archived_at", null)
    .order("exam_number", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;

  const exams = (data || []).map((exam: any) => {
    const partsByType = new Map(
      (exam.parts || []).map((part: any) => [
        normalizeHomeworkSkill(part.part_type),
        part,
      ])
    );

    const allowedOrder = ["express", "intensive"].includes(String(context.courseType || "").trim().toLowerCase())
      ? PART_ORDER
      : LEGACY_PART_ORDER;
    // Keep the exam-bank's actual part rows authoritative for each level;
    // the order only controls presentation of rows that really exist.
    const partOrder = allowedOrder.filter((partType) => partsByType.has(partType));

    return {
      id: String(exam.id),
      exam_number: Number(exam.exam_number),
      title: exam.title ? String(exam.title) : null,
      parts: partOrder.map((partType) => {
        const part: any = partsByType.get(partType);
        const allowed = ALLOWED_RESOURCES[partType];
        const resources = (part?.resources || [])
          .filter((resource: any) => {
            const resourceType = String(resource?.resource_type || "");
            const externalUrl = String(resource?.external_url || "").trim();
            return (
              allowed.has(resourceType) &&
              isValidExternalUrl(externalUrl)
            );
          })
          .sort(
            (first: any, second: any) =>
              RESOURCE_ORDER.indexOf(first.resource_type) -
              RESOURCE_ORDER.indexOf(second.resource_type)
          )
          .map((resource: any) => ({
            type: String(resource.resource_type),
            label: resourceLabel(partType, String(resource.resource_type)),
            url: String(resource.external_url),
          }));

        const subparts = (part?.subparts || [])
          .map((subpart: any) => ({
            id: String(subpart.id),
            part_number: Number(subpart.part_number),
            label: String(subpart.label || `Part ${subpart.part_number}`),
            sort_order: Number(subpart.sort_order || subpart.part_number),
          }))
          .sort((a: any, b: any) => a.sort_order - b.sort_order);

        return {
          id: part?.id ? String(part.id) : null,
          type: partType,
          skill: partType,
          label: skillLabelFor(context.level, partType) || getHomeworkSkillLabel(context.level, partType),
          skill_label: skillLabelFor(context.level, partType),
          subparts,
          resources,
        };
      }),
    };
  });

  return {
    class: {
      id: context.classId,
      level: context.level,
      supported: true,
    },
    exams,
  };
}
