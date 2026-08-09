import "server-only";

import { classUsesAcademicYear, type AcademicYear } from "./academicYearRules";
import {
  getSuggestedNextLevelName,
  isRolloverDecision,
  type AcademicYearReadiness,
  type AcademicYearRollover,
  type AcademicYearRolloverDecision,
  type AcademicYearRolloverWorkspace,
  type RolloverClass,
  type RolloverStudent,
  type RolloverSummary,
} from "./academicYearRolloverRules";
import { isValidClassId, validateAdminClassPayload } from "./adminClassServer";
import { getCurrentAcademicYearServer } from "./academicYearsServer";
import { supabaseAdmin } from "./supabaseAdmin";

const ROLLOVER_SELECT =
  "id, source_academic_year_id, target_academic_year_id, status, created_by, updated_by, applied_by, applied_at, created_at, updated_at";
const CLASS_SELECT =
  "id, class_name, level_id, teacher_id, classroom_id, course_type, days, start_time, end_time, meet_link, is_cambridge, start_date, end_date, academic_year_id";
const MAX_DECISIONS_PER_SAVE = 500;
const MAX_CLASSES_PER_COPY = 100;

type DatabaseClass = {
  id: string;
  class_name: string | null;
  level_id: number;
  teacher_id: string;
  classroom_id: string | null;
  course_type: string | null;
  days: string | null;
  start_time: string | null;
  end_time: string | null;
  meet_link: string | null;
  is_cambridge: boolean | null;
  start_date: string | null;
  end_date: string | null;
  academic_year_id: string | null;
};

type ReferenceData = {
  levels: Array<{ id: number; name: string; catagory?: string | null }>;
  teachers: Array<{ id: string; first_name: string | null; last_name: string | null }>;
  classrooms: Array<{ id: string; name: string | null }>;
};

export class AcademicYearRolloverError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AcademicYearRolloverError";
    this.status = status;
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function personName(
  profile: { first_name?: string | null; last_name?: string | null } | null,
  fallback: string
) {
  const name = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
  return name || fallback;
}

function databaseMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = text((error as { message?: unknown }).message);
    if (message && !/security definer|service_role|postgres/i.test(message)) {
      return message;
    }
  }
  return fallback;
}

function assertUuid(value: unknown, label: string) {
  const id = text(value);
  if (!isValidClassId(id)) {
    throw new AcademicYearRolloverError(`Invalid ${label}.`, 400);
  }
  return id;
}

async function loadAcademicYears(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const { data, error } = await supabaseAdmin
    .from("academic_years")
    .select("id, label, start_date, end_date, status, created_at, updated_at")
    .in("id", uniqueIds);
  if (error) throw error;
  return (data || []) as AcademicYear[];
}

async function loadRollover(rolloverId: string) {
  const { data, error } = await supabaseAdmin
    .from("academic_year_rollovers")
    .select(ROLLOVER_SELECT)
    .eq("id", rolloverId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new AcademicYearRolloverError("Academic year rollover not found.", 404);
  }
  return data as AcademicYearRollover;
}

async function loadAnnualClasses(academicYearId: string) {
  const { data, error } = await supabaseAdmin
    .from("classes")
    .select(CLASS_SELECT)
    .eq("academic_year_id", academicYearId);
  if (error) throw error;
  return ((data || []) as DatabaseClass[]).filter((classroom) =>
    classUsesAcademicYear(classroom.course_type)
  );
}

async function loadReferenceData(): Promise<ReferenceData> {
  const [levelResult, teacherResult, classroomResult] = await Promise.all([
    supabaseAdmin.from("levels").select("id, name, catagory").order("name"),
    supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("role", "teacher")
      .order("first_name"),
    supabaseAdmin.from("classrooms").select("id, name").order("name"),
  ]);

  if (levelResult.error) throw levelResult.error;
  if (teacherResult.error) throw teacherResult.error;
  if (classroomResult.error) throw classroomResult.error;

  return {
    levels: (levelResult.data || []) as ReferenceData["levels"],
    teachers: (teacherResult.data || []) as ReferenceData["teachers"],
    classrooms: (classroomResult.data || []) as ReferenceData["classrooms"],
  };
}

function enrichClasses(
  classes: DatabaseClass[],
  references: ReferenceData,
  mappingBySourceClassId?: Map<string, string>
): RolloverClass[] {
  const levelMap = new Map(
    references.levels.map((level) => [String(level.id), level.name])
  );
  const teacherMap = new Map(
    references.teachers.map((teacher) => [
      String(teacher.id),
      personName(teacher, "Teacher not assigned"),
    ])
  );
  const classroomMap = new Map(
    references.classrooms.map((classroom) => [
      String(classroom.id),
      text(classroom.name) || "Classroom not assigned",
    ])
  );

  return classes
    .map((classroom) => {
      const isOnline = text(classroom.course_type).toLowerCase() === "online";
      return {
        id: String(classroom.id),
        class_name:
          text(classroom.class_name) ||
          levelMap.get(String(classroom.level_id)) ||
          "Class",
        level_id: Number(classroom.level_id),
        level_name:
          levelMap.get(String(classroom.level_id)) || "Level not assigned",
        teacher_id: String(classroom.teacher_id || ""),
        teacher_name:
          teacherMap.get(String(classroom.teacher_id || "")) ||
          "Teacher not assigned",
        classroom_id: classroom.classroom_id
          ? String(classroom.classroom_id)
          : null,
        classroom_name: isOnline
          ? "Online"
          : classroomMap.get(String(classroom.classroom_id || "")) ||
            "Classroom not assigned",
        course_type: text(classroom.course_type) || "regular",
        days: text(classroom.days),
        start_time: text(classroom.start_time),
        end_time: text(classroom.end_time),
        meet_link: classroom.meet_link ? text(classroom.meet_link) : null,
        is_cambridge: classroom.is_cambridge === true,
        academic_year_id: String(classroom.academic_year_id || ""),
        copied_target_class_id:
          mappingBySourceClassId?.get(String(classroom.id)) || null,
      };
    })
    .sort((first, second) =>
      `${first.level_name} ${first.class_name}`.localeCompare(
        `${second.level_name} ${second.class_name}`
      )
    );
}

function getSuggestedLevelId(
  sourceLevelId: number,
  levels: ReferenceData["levels"]
) {
  const source = levels.find((level) => Number(level.id) === Number(sourceLevelId));
  const suggestedName = getSuggestedNextLevelName(source?.name);
  if (!suggestedName) return null;
  const target = levels.find(
    (level) => text(level.name).toUpperCase() === suggestedName
  );
  return target ? Number(target.id) : null;
}

async function insertDecisionRows(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const { error } = await supabaseAdmin
    .from("academic_year_rollover_students")
    .insert(rows);
  if (error && error.code !== "23505") throw error;
}

async function ensureRolloverStudents(
  rollover: AcademicYearRollover,
  actorId: string,
  sourceClasses?: DatabaseClass[],
  references?: ReferenceData
) {
  const classes = sourceClasses || (await loadAnnualClasses(rollover.source_academic_year_id));
  if (!classes.length) return;

  const referenceData = references || (await loadReferenceData());
  const classIds = classes.map((classroom) => String(classroom.id));
  const classMap = new Map(classes.map((classroom) => [String(classroom.id), classroom]));

  const [existingResult, profileEnrolmentResult, youngEnrolmentResult, youngResult] =
    await Promise.all([
      supabaseAdmin
        .from("academic_year_rollover_students")
        .select("profile_student_id, young_learner_id")
        .eq("rollover_id", rollover.id),
      supabaseAdmin
        .from("class_enrolments")
        .select("student_id, class_id, enrolled_at")
        .in("class_id", classIds)
        .order("enrolled_at", { ascending: false }),
      supabaseAdmin
        .from("young_learner_enrolments")
        .select("young_learner_id, class_id, enrolled_at, created_at")
        .in("class_id", classIds)
        .order("enrolled_at", { ascending: false })
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("young_learners")
        .select("id, class_id")
        .in("class_id", classIds),
    ]);

  if (existingResult.error) throw existingResult.error;
  if (profileEnrolmentResult.error) throw profileEnrolmentResult.error;
  if (youngEnrolmentResult.error) throw youngEnrolmentResult.error;
  if (youngResult.error) throw youngResult.error;

  const existingProfiles = new Set(
    (existingResult.data || [])
      .map((row) => text(row.profile_student_id))
      .filter(Boolean)
  );
  const existingYoungLearners = new Set(
    (existingResult.data || [])
      .map((row) => text(row.young_learner_id))
      .filter(Boolean)
  );

  const profileClassByStudent = new Map<string, string>();
  for (const enrolment of profileEnrolmentResult.data || []) {
    const studentId = text(enrolment.student_id);
    const classId = text(enrolment.class_id);
    if (!studentId || !classId) continue;
    const existingClassId = profileClassByStudent.get(studentId);
    if (existingClassId && existingClassId !== classId) {
      throw new AcademicYearRolloverError(
        "A Cambridge student belongs to more than one source-year annual class. Resolve that enrolment before preparing progression.",
        409
      );
    }
    profileClassByStudent.set(studentId, classId);
  }

  const profileIds = Array.from(profileClassByStudent.keys());
  const { data: validProfiles, error: profileError } = profileIds.length
    ? await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("role", "student")
        .in("id", profileIds)
    : { data: [], error: null };
  if (profileError) throw profileError;
  const validProfileIds = new Set(
    (validProfiles || []).map((profile) => String(profile.id))
  );

  const currentYoungClass = new Map(
    (youngResult.data || []).map((learner) => [
      String(learner.id),
      String(learner.class_id),
    ])
  );
  const youngClassByStudent = new Map<string, string>();
  for (const enrolment of youngEnrolmentResult.data || []) {
    const learnerId = text(enrolment.young_learner_id);
    const classId = text(enrolment.class_id);
    if (!learnerId || !classId) continue;
    const pointerClassId = currentYoungClass.get(learnerId);
    if (pointerClassId && classMap.has(pointerClassId)) {
      youngClassByStudent.set(learnerId, pointerClassId);
    } else if (!youngClassByStudent.has(learnerId)) {
      youngClassByStudent.set(learnerId, classId);
    }
  }
  for (const [learnerId, classId] of currentYoungClass) {
    if (!youngClassByStudent.has(learnerId) && classMap.has(classId)) {
      youngClassByStudent.set(learnerId, classId);
    }
  }

  const rows: Array<Record<string, unknown>> = [];
  for (const [studentId, classId] of profileClassByStudent) {
    if (existingProfiles.has(studentId) || !validProfileIds.has(studentId)) continue;
    const classroom = classMap.get(classId);
    if (!classroom || classroom.is_cambridge !== true) continue;
    rows.push({
      rollover_id: rollover.id,
      student_type: "profile",
      profile_student_id: studentId,
      young_learner_id: null,
      source_class_id: classId,
      suggested_level_id: getSuggestedLevelId(
        classroom.level_id,
        referenceData.levels
      ),
      decision: "decide_later",
      target_class_id: null,
      updated_by: actorId,
    });
  }

  for (const [learnerId, classId] of youngClassByStudent) {
    if (existingYoungLearners.has(learnerId)) continue;
    const classroom = classMap.get(classId);
    if (!classroom || classroom.is_cambridge === true) continue;
    rows.push({
      rollover_id: rollover.id,
      student_type: "young_learner",
      profile_student_id: null,
      young_learner_id: learnerId,
      source_class_id: classId,
      suggested_level_id: getSuggestedLevelId(
        classroom.level_id,
        referenceData.levels
      ),
      decision: "decide_later",
      target_class_id: null,
      updated_by: actorId,
    });
  }

  await insertDecisionRows(rows);
}

export async function getAcademicYearRolloverLandingData() {
  const [yearResult, rolloverResult] = await Promise.all([
    supabaseAdmin
      .from("academic_years")
      .select("id, label, start_date, end_date, status, created_at, updated_at")
      .order("start_date", { ascending: false }),
    supabaseAdmin
      .from("academic_year_rollovers")
      .select(ROLLOVER_SELECT)
      .order("created_at", { ascending: false }),
  ]);
  if (yearResult.error) throw yearResult.error;
  if (rolloverResult.error) throw rolloverResult.error;
  return {
    academic_years: (yearResult.data || []) as AcademicYear[],
    rollovers: (rolloverResult.data || []) as AcademicYearRollover[],
  };
}

export async function createAcademicYearRollover(input: {
  sourceAcademicYearId: string;
  targetAcademicYearId: string;
  actorId: string;
}) {
  const sourceId = assertUuid(input.sourceAcademicYearId, "source academic year");
  const targetId = assertUuid(input.targetAcademicYearId, "target academic year");
  if (sourceId === targetId) {
    throw new AcademicYearRolloverError(
      "Source and Target academic years must be different."
    );
  }

  const years = await loadAcademicYears([sourceId, targetId]);
  const sourceYear = years.find((year) => year.id === sourceId);
  const targetYear = years.find((year) => year.id === targetId);
  if (!sourceYear || !targetYear) {
    throw new AcademicYearRolloverError("Choose valid Source and Target academic years.");
  }
  if (targetYear.status !== "future") {
    throw new AcademicYearRolloverError(
      "The Target academic year must have Future status."
    );
  }

  const { data, error } = await supabaseAdmin
    .from("academic_year_rollovers")
    .insert({
      source_academic_year_id: sourceId,
      target_academic_year_id: targetId,
      status: "draft",
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .select(ROLLOVER_SELECT)
    .single();

  let rollover = data as AcademicYearRollover | null;
  if (error?.code === "23505") {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("academic_year_rollovers")
      .select(ROLLOVER_SELECT)
      .eq("source_academic_year_id", sourceId)
      .eq("target_academic_year_id", targetId)
      .single();
    if (existingError) throw existingError;
    rollover = existing as AcademicYearRollover;
  } else if (error) {
    throw error;
  }
  if (!rollover) throw new Error("Unable to create the academic year rollover.");

  await ensureRolloverStudents(rollover, input.actorId);
  return rollover;
}

function buildSummary(
  students: RolloverStudent[],
  targetClassCount: number,
  copiedClassCount: number
): RolloverSummary {
  const count = (decision: AcademicYearRolloverDecision) =>
    students.filter((student) => student.decision === decision).length;
  return {
    total_students: students.length,
    promote: count("promote"),
    repeat: count("repeat"),
    different_level: count("different_level"),
    not_returning: count("not_returning"),
    decide_later: count("decide_later"),
    applied: students.filter((student) => Boolean(student.applied_at)).length,
    ready_not_applied: students.filter(
      (student) => student.decision !== "decide_later" && !student.applied_at
    ).length,
    classes_prepared: targetClassCount,
    copied_classes: copiedClassCount,
  };
}

export async function getAcademicYearRolloverWorkspace(
  rolloverIdValue: string,
  actorId: string
): Promise<AcademicYearRolloverWorkspace> {
  const rolloverId = assertUuid(rolloverIdValue, "rollover identifier");
  const rollover = await loadRollover(rolloverId);
  const [years, sourceClasses, targetClasses, references] = await Promise.all([
    loadAcademicYears([
      rollover.source_academic_year_id,
      rollover.target_academic_year_id,
    ]),
    loadAnnualClasses(rollover.source_academic_year_id),
    loadAnnualClasses(rollover.target_academic_year_id),
    loadReferenceData(),
  ]);
  const sourceYear = years.find(
    (year) => year.id === rollover.source_academic_year_id
  );
  const targetYear = years.find(
    (year) => year.id === rollover.target_academic_year_id
  );
  if (!sourceYear || !targetYear) {
    throw new AcademicYearRolloverError("Rollover academic years are unavailable.", 409);
  }

  await ensureRolloverStudents(rollover, actorId, sourceClasses, references);

  const [mappingResult, decisionResult] = await Promise.all([
    supabaseAdmin
      .from("academic_year_rollover_classes")
      .select("source_class_id, target_class_id")
      .eq("rollover_id", rollover.id),
    supabaseAdmin
      .from("academic_year_rollover_students")
      .select(
        "id, student_type, profile_student_id, young_learner_id, source_class_id, decision, target_class_id, suggested_level_id, notes, applied_at, updated_at"
      )
      .eq("rollover_id", rollover.id),
  ]);
  if (mappingResult.error) throw mappingResult.error;
  if (decisionResult.error) throw decisionResult.error;

  const mappingBySource = new Map(
    (mappingResult.data || []).map((mapping) => [
      String(mapping.source_class_id),
      String(mapping.target_class_id),
    ])
  );
  const sourceClassRows = enrichClasses(sourceClasses, references, mappingBySource);
  const targetClassRows = enrichClasses(targetClasses, references);
  const sourceClassMap = new Map(sourceClassRows.map((row) => [row.id, row]));
  const levelMap = new Map(
    references.levels.map((level) => [String(level.id), level.name])
  );

  const profileIds = (decisionResult.data || [])
    .map((row) => text(row.profile_student_id))
    .filter(Boolean);
  const youngLearnerIds = (decisionResult.data || [])
    .map((row) => text(row.young_learner_id))
    .filter(Boolean);
  const [profileResult, youngLearnerResult] = await Promise.all([
    profileIds.length
      ? supabaseAdmin
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
    youngLearnerIds.length
      ? supabaseAdmin
          .from("young_learners")
          .select("id, first_name, last_name, active")
          .in("id", youngLearnerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (youngLearnerResult.error) throw youngLearnerResult.error;

  const profileMap = new Map(
    (profileResult.data || []).map((profile) => [String(profile.id), profile])
  );
  const youngMap = new Map(
    (youngLearnerResult.data || []).map((learner) => [String(learner.id), learner])
  );

  const students: RolloverStudent[] = (decisionResult.data || [])
    .map((decisionRow) => {
      const studentType = decisionRow.student_type as "profile" | "young_learner";
      const studentId =
        studentType === "profile"
          ? String(decisionRow.profile_student_id || "")
          : String(decisionRow.young_learner_id || "");
      const person =
        studentType === "profile"
          ? profileMap.get(studentId)
          : youngMap.get(studentId);
      const sourceClass = sourceClassMap.get(String(decisionRow.source_class_id));
      if (!sourceClass) return null;
      const firstName = text(person?.first_name);
      const lastName = text(person?.last_name);
      return {
        id: String(decisionRow.id),
        student_type: studentType,
        student_id: studentId,
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`.trim() || "Student",
        active:
          studentType === "young_learner"
            ? (person as { active?: boolean } | undefined)?.active !== false
            : true,
        source_class_id: sourceClass.id,
        source_class_name: sourceClass.class_name,
        source_level_id: sourceClass.level_id,
        source_level_name: sourceClass.level_name,
        source_course_type: sourceClass.course_type,
        source_days: sourceClass.days,
        suggested_level_id:
          decisionRow.suggested_level_id === null
            ? null
            : Number(decisionRow.suggested_level_id),
        suggested_level_name:
          decisionRow.suggested_level_id === null
            ? null
            : levelMap.get(String(decisionRow.suggested_level_id)) || null,
        decision: decisionRow.decision as AcademicYearRolloverDecision,
        target_class_id: decisionRow.target_class_id
          ? String(decisionRow.target_class_id)
          : null,
        notes: text(decisionRow.notes),
        applied_at: decisionRow.applied_at || null,
        updated_at: String(decisionRow.updated_at || ""),
      } satisfies RolloverStudent;
    })
    .filter((student): student is RolloverStudent => Boolean(student))
    .sort((first, second) =>
      `${first.source_level_name} ${first.source_class_name} ${first.full_name}`.localeCompare(
        `${second.source_level_name} ${second.source_class_name} ${second.full_name}`
      )
    );

  return {
    rollover,
    source_year: sourceYear,
    target_year: targetYear,
    source_classes: sourceClassRows,
    target_classes: targetClassRows,
    students,
    teachers: references.teachers.map((teacher) => ({
      id: String(teacher.id),
      name: personName(teacher, "Teacher"),
    })),
    classrooms: references.classrooms.map((classroom) => ({
      id: String(classroom.id),
      name: text(classroom.name) || "Classroom",
    })),
    summary: buildSummary(
      students,
      targetClassRows.length,
      mappingBySource.size
    ),
  };
}

export async function copyAcademicYearRolloverClasses(input: {
  rolloverId: string;
  actorId: string;
  classes: Array<{
    source_class_id: string;
    teacher_id: string;
    classroom_id?: string | null;
  }>;
}) {
  if (!Array.isArray(input.classes) || input.classes.length === 0) {
    throw new AcademicYearRolloverError("Select at least one class to copy.");
  }
  if (input.classes.length > MAX_CLASSES_PER_COPY) {
    throw new AcademicYearRolloverError("Copy no more than 100 classes at once.");
  }

  const rollover = await loadRollover(assertUuid(input.rolloverId, "rollover identifier"));
  const [sourceClasses, targetYears, references] = await Promise.all([
    loadAnnualClasses(rollover.source_academic_year_id),
    loadAcademicYears([rollover.target_academic_year_id]),
    loadReferenceData(),
  ]);
  const targetYear = targetYears[0];
  if (!targetYear || targetYear.status !== "future") {
    throw new AcademicYearRolloverError(
      "Classes can only be copied into a Future academic year."
    );
  }
  const sourceMap = new Map(sourceClasses.map((row) => [String(row.id), row]));
  const levelMap = new Map(
    references.levels.map((level) => [String(level.id), level])
  );
  const prepared = input.classes.map((requested) => {
    const sourceClassId = assertUuid(requested.source_class_id, "source class");
    const teacherId = assertUuid(requested.teacher_id, "teacher");
    const source = sourceMap.get(sourceClassId);
    if (!source) {
      throw new AcademicYearRolloverError(
        "A selected source class is not eligible for this rollover."
      );
    }
    const isOnline = text(source.course_type).toLowerCase() === "online";
    const classroomId = isOnline
      ? null
      : text(requested.classroom_id) || text(source.classroom_id);
    const level = levelMap.get(String(source.level_id)) || null;
    const validation = validateAdminClassPayload(
      {
        class_name: source.class_name,
        level_id: source.level_id,
        teacher_id: teacherId,
        classroom_id: classroomId,
        course_type: source.course_type,
        days: source.days,
        start_time: source.start_time,
        end_time: source.end_time,
        meet_link: isOnline ? source.meet_link : null,
        is_cambridge: source.is_cambridge === true,
        start_date: null,
        end_date: null,
        academic_year_id: targetYear.id,
      },
      level,
      targetYear
    );
    if (validation.error) {
      throw new AcademicYearRolloverError(
        `${text(source.class_name) || "Class"}: ${validation.error}`
      );
    }
    return { sourceClassId, teacherId, classroomId };
  });

  const targetClassIds: string[] = [];
  for (const requested of prepared) {
    const { data, error } = await supabaseAdmin.rpc(
      "copy_academic_year_rollover_class",
      {
        p_rollover_id: rollover.id,
        p_source_class_id: requested.sourceClassId,
        p_teacher_id: requested.teacherId,
        p_actor_id: input.actorId,
        p_classroom_id: requested.classroomId || null,
      }
    );
    if (error) {
      throw new AcademicYearRolloverError(
        databaseMessage(error, "Unable to copy a selected class."),
        409
      );
    }
    targetClassIds.push(String(data));
  }
  return targetClassIds;
}

export async function saveAcademicYearRolloverDecisions(input: {
  rolloverId: string;
  actorId: string;
  decisions: Array<{
    id: string;
    decision: AcademicYearRolloverDecision;
    target_class_id: string | null;
    notes: string;
  }>;
}) {
  const rolloverId = assertUuid(input.rolloverId, "rollover identifier");
  if (!Array.isArray(input.decisions) || input.decisions.length === 0) {
    throw new AcademicYearRolloverError("No progression changes were supplied.");
  }
  if (input.decisions.length > MAX_DECISIONS_PER_SAVE) {
    throw new AcademicYearRolloverError("Save no more than 500 decisions at once.");
  }
  const normalized = input.decisions.map((row) => {
    const id = assertUuid(row.id, "student decision");
    if (!isRolloverDecision(row.decision)) {
      throw new AcademicYearRolloverError("Choose a valid progression decision.");
    }
    const targetClassId = text(row.target_class_id);
    if (targetClassId && !isValidClassId(targetClassId)) {
      throw new AcademicYearRolloverError("Choose a valid target class.");
    }
    const notes = text(row.notes);
    if (notes.length > 2000) {
      throw new AcademicYearRolloverError(
        "Progression notes must contain no more than 2000 characters."
      );
    }
    return {
      id,
      decision: row.decision,
      target_class_id: targetClassId || null,
      notes,
    };
  });

  const { data, error } = await supabaseAdmin.rpc(
    "save_academic_year_rollover_student_decisions",
    {
      p_rollover_id: rolloverId,
      p_decisions: normalized,
      p_actor_id: input.actorId,
    }
  );
  if (error) {
    throw new AcademicYearRolloverError(
      databaseMessage(error, "Unable to save progression decisions."),
      409
    );
  }
  return Number(data || 0);
}

export async function applyAcademicYearRollover(
  rolloverIdValue: string,
  actorId: string
) {
  const rolloverId = assertUuid(rolloverIdValue, "rollover identifier");
  const { data, error } = await supabaseAdmin.rpc("apply_academic_year_rollover", {
    p_rollover_id: rolloverId,
    p_actor_id: actorId,
  });
  if (error) {
    throw new AcademicYearRolloverError(
      databaseMessage(error, "Unable to apply the academic year rollover."),
      409
    );
  }
  return Array.isArray(data) ? data[0] : data;
}

async function countSourceYearStudents(academicYearId: string) {
  const classes = await loadAnnualClasses(academicYearId);
  const classIds = classes.map((classroom) => String(classroom.id));
  if (!classIds.length) return 0;
  const [profileResult, youngResult] = await Promise.all([
    supabaseAdmin
      .from("class_enrolments")
      .select("student_id")
      .in("class_id", classIds),
    supabaseAdmin
      .from("young_learner_enrolments")
      .select("young_learner_id")
      .in("class_id", classIds),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (youngResult.error) throw youngResult.error;
  return (
    new Set((profileResult.data || []).map((row) => String(row.student_id))).size +
    new Set((youngResult.data || []).map((row) => String(row.young_learner_id))).size
  );
}

export async function getAcademicYearSwitchReadiness(
  targetAcademicYearIdValue: string,
  actorId?: string
): Promise<AcademicYearReadiness> {
  const targetAcademicYearId = assertUuid(
    targetAcademicYearIdValue,
    "academic year identifier"
  );
  const [targetYears, currentYear, targetClasses] = await Promise.all([
    loadAcademicYears([targetAcademicYearId]),
    getCurrentAcademicYearServer(),
    loadAnnualClasses(targetAcademicYearId),
  ]);
  const targetYear = targetYears[0];
  if (!targetYear) {
    throw new AcademicYearRolloverError("Academic year not found.", 404);
  }

  if (!currentYear || currentYear.id === targetAcademicYearId) {
    return {
      target_academic_year_id: targetYear.id,
      target_label: targetYear.label,
      source_academic_year_id: currentYear?.id || null,
      source_label: currentYear?.label || null,
      rollover_id: null,
      classes_prepared: targetClasses.length,
      total_students: 0,
      students_assigned: 0,
      planned_assignments: 0,
      not_returning: 0,
      still_undecided: 0,
      ready_not_applied: 0,
    };
  }

  const { data: rollover, error: rolloverError } = await supabaseAdmin
    .from("academic_year_rollovers")
    .select("id")
    .eq("source_academic_year_id", currentYear.id)
    .eq("target_academic_year_id", targetAcademicYearId)
    .maybeSingle();
  if (rolloverError) throw rolloverError;

  if (!rollover) {
    const totalStudents = await countSourceYearStudents(currentYear.id);
    return {
      target_academic_year_id: targetYear.id,
      target_label: targetYear.label,
      source_academic_year_id: currentYear.id,
      source_label: currentYear.label,
      rollover_id: null,
      classes_prepared: targetClasses.length,
      total_students: totalStudents,
      students_assigned: 0,
      planned_assignments: 0,
      not_returning: 0,
      still_undecided: totalStudents,
      ready_not_applied: 0,
    };
  }

  if (actorId) {
    await ensureRolloverStudents(await loadRollover(String(rollover.id)), actorId);
  }

  const { data: decisions, error: decisionError } = await supabaseAdmin
    .from("academic_year_rollover_students")
    .select("decision, target_class_id, applied_at")
    .eq("rollover_id", rollover.id);
  if (decisionError) throw decisionError;
  const rows = decisions || [];

  return {
    target_academic_year_id: targetYear.id,
    target_label: targetYear.label,
    source_academic_year_id: currentYear.id,
    source_label: currentYear.label,
    rollover_id: String(rollover.id),
    classes_prepared: targetClasses.length,
    total_students: rows.length,
    students_assigned: rows.filter(
      (row) => row.target_class_id && row.applied_at
    ).length,
    planned_assignments: rows.filter((row) => row.target_class_id).length,
    not_returning: rows.filter((row) => row.decision === "not_returning").length,
    still_undecided: rows.filter((row) => row.decision === "decide_later").length,
    ready_not_applied: rows.filter(
      (row) => row.decision !== "decide_later" && !row.applied_at
    ).length,
  };
}
