import "server-only";

import { getHomeworkSkillLabel, normalizeHomeworkSkill } from "./homework";
import { isValidExternalUrl } from "./cambridgeExamBank";
import { supabaseAdmin } from "./supabaseAdmin";
import type { TeacherHomeworkContext } from "./teacherHomeworkServer";

const ELIGIBLE_LEVELS = new Set(["B1", "B2", "C1", "C2"]);
const PART_ORDER = ["reading", "listening", "writing", "speaking"] as const;
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

    return {
      id: String(exam.id),
      exam_number: Number(exam.exam_number),
      title: exam.title ? String(exam.title) : null,
      parts: PART_ORDER.map((partType) => {
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

        return {
          id: part?.id ? String(part.id) : null,
          type: partType,
          label: getHomeworkSkillLabel(context.level, partType),
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
