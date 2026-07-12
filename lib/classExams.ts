import { supabase } from "./supabase";

const classExamLevelOrder = [
  "Kids 2",
  "Junior 1",
  "Junior 2",
  "Junior 3",
  "Junior 4",
  "Teens 1",
];

const normalizedClassExamLevels = classExamLevelOrder.map((level) =>
  normalizeLevelName(level)
);

function formatClassExamError(action: string, error: any) {
  return [
    `Class exam ${action} failed: ${error?.message || "Unknown Supabase error"}`,
    error?.details ? `Details: ${error.details}` : null,
    error?.hint ? `Hint: ${error.hint}` : null,
    error?.code ? `Code: ${error.code}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function normalizeLevelName(levelName: string | null | undefined) {
  return String(levelName || "").trim().toUpperCase();
}

export function isClassExamLevel(levelName: string | null | undefined) {
  return normalizedClassExamLevels.includes(normalizeLevelName(levelName));
}

function sortByClassExamLevel(first: any, second: any) {
  const firstIndex = normalizedClassExamLevels.indexOf(
    normalizeLevelName(first.name || first.level_name)
  );
  const secondIndex = normalizedClassExamLevels.indexOf(
    normalizeLevelName(second.name || second.level_name)
  );

  return firstIndex - secondIndex;
}

function sortMaterials(first: any, second: any) {
  const levelSort = sortByClassExamLevel(first, second);

  if (levelSort !== 0) {
    return levelSort;
  }

  return Number(first.exam_unit_number || 0) - Number(second.exam_unit_number || 0);
}

async function getLevelsById(levelIds: Array<string | number>) {
  if (levelIds.length === 0) {
    return new Map<string | number, string>();
  }

  const { data, error } = await supabase
    .from("levels")
    .select("id, name")
    .in("id", levelIds);

  if (error) {
    throw new Error(formatClassExamError("level load", error));
  }

  return new Map((data || []).map((level) => [level.id, level.name]));
}

async function ensureNoDuplicateLevelUnit(
  levelId: string,
  examUnitNumber: number,
  currentId?: string
) {
  const { data, error } = await supabase
    .from("class_exam_materials")
    .select("id")
    .eq("level_id", levelId)
    .eq("exam_unit_number", examUnitNumber)
    .maybeSingle();

  if (error) {
    throw new Error(formatClassExamError("duplicate check", error));
  }

  if (data && data.id !== currentId) {
    throw new Error("An exam material already exists for this level and exam unit.");
  }
}

export async function getClassExamLevels() {
  const { data, error } = await supabase
    .from("levels")
    .select("id, name")
    .order("name");

  if (error) {
    throw new Error(formatClassExamError("level load", error));
  }

  return (data || [])
    .filter((level) => isClassExamLevel(level.name))
    .sort(sortByClassExamLevel);
}

export async function getAllClassExamMaterials() {
  const { data, error } = await supabase
    .from("class_exam_materials")
    .select("*")
    .order("exam_unit_number");

  if (error) {
    throw new Error(formatClassExamError("load", error));
  }

  const materials = data || [];
  const levelIds = Array.from(
    new Set(materials.map((item) => item.level_id).filter(Boolean))
  );
  const levelsById = await getLevelsById(levelIds);

  return materials
    .map((item) => {
      const levelName = levelsById.get(item.level_id) || "Unknown Level";

      return {
        id: item.id,
        level_id: item.level_id,
        level_name: levelName,
        exam_unit_number: item.exam_unit_number,
        exam_file_url: item.exam_file_url,
        audio_file_url: item.audio_file_url,
        key_file_url: item.key_file_url,
        active: item.active,
        created_at: item.created_at,
        updated_at: item.updated_at,
      };
    })
    .filter((item) => isClassExamLevel(item.level_name))
    .sort(sortMaterials);
}

export async function getClassExamMaterialsByLevelName(
  levelName: string | null | undefined
) {
  const normalizedLevelName = normalizeLevelName(levelName);

  if (!isClassExamLevel(normalizedLevelName)) {
    return [];
  }

  const { data: levels, error: levelError } = await supabase
    .from("levels")
    .select("id, name");

  if (levelError) {
    throw new Error(formatClassExamError("level load", levelError));
  }

  const matchingLevel = (levels || []).find(
    (level) => normalizeLevelName(level.name) === normalizedLevelName
  );

  if (!matchingLevel) {
    return [];
  }

  const { data, error } = await supabase
    .from("class_exam_materials")
    .select("*")
    .eq("level_id", matchingLevel.id)
    .eq("active", true)
    .order("exam_unit_number", { ascending: true });

  if (error) {
    throw new Error(formatClassExamError("load", error));
  }

  return (data || []).map((item) => ({
    id: item.id,
    level_id: item.level_id,
    level_name: matchingLevel.name,
    exam_unit_number: item.exam_unit_number,
    exam_file_url: item.exam_file_url,
    audio_file_url: item.audio_file_url,
    key_file_url: item.key_file_url,
    active: item.active,
  }));
}

export async function createClassExamMaterial(payload: any) {
  const examUnitNumber = Number(payload.exam_unit_number);

  if (!payload.level_id || !Number.isFinite(examUnitNumber) || examUnitNumber < 1) {
    throw new Error("Please choose a level and a valid exam unit number.");
  }

  await ensureNoDuplicateLevelUnit(payload.level_id, examUnitNumber);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const material = {
    level_id: payload.level_id,
    exam_unit_number: examUnitNumber,
    exam_file_url: payload.exam_file_url,
    audio_file_url: payload.audio_file_url || null,
    key_file_url: payload.key_file_url || null,
    active: payload.active ?? true,
    created_by: session?.user.id || null,
  };

  const { error } = await supabase
    .from("class_exam_materials")
    .insert([material]);

  if (error) {
    throw new Error(formatClassExamError("save", error));
  }
}

export async function updateClassExamMaterial(id: string, updates: any) {
  const examUnitNumber = Number(updates.exam_unit_number);

  if (!updates.level_id || !Number.isFinite(examUnitNumber) || examUnitNumber < 1) {
    throw new Error("Please choose a level and a valid exam unit number.");
  }

  await ensureNoDuplicateLevelUnit(updates.level_id, examUnitNumber, id);

  const material = {
    level_id: updates.level_id,
    exam_unit_number: examUnitNumber,
    exam_file_url: updates.exam_file_url,
    audio_file_url: updates.audio_file_url || null,
    key_file_url: updates.key_file_url || null,
    active: updates.active ?? true,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("class_exam_materials")
    .update(material)
    .eq("id", id);

  if (error) {
    throw new Error(formatClassExamError("update", error));
  }
}

export async function deleteClassExamMaterial(id: string) {
  const { error } = await supabase
    .from("class_exam_materials")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(formatClassExamError("delete", error));
  }
}

export async function getClassExamMaterialsForPrint() {
  const materials = await getAllClassExamMaterials();

  return materials
    .filter((item) => item.active)
    .map((item) => ({
      id: item.id,
      level_id: item.level_id,
      level_name: item.level_name,
      exam_unit_number: item.exam_unit_number,
      exam_file_url: item.exam_file_url,
      active: item.active,
    }));
}
