"use client";

import { useEffect, useMemo, useState } from "react";

import AdminLayout from "../../components/layout/AdminLayout";
import {
  createClass,
  getAdminClasses,
  getClassrooms,
  getClassStudentCounts,
  getLevels,
  getTeachers,
  updateClass,
} from "../../../lib/adminClasses";
import { supabase } from "../../../lib/supabase";

type ClassView = "all" | "level" | "schedule" | "teacher";

const courseTypes = [
  { label: "Regular", value: "regular" },
  { label: "Intensive", value: "intensive" },
  { label: "Express", value: "express" },
  { label: "Online", value: "online" },
];

const classViewOptions: { label: string; value: ClassView }[] = [
  { label: "All Classes", value: "all" },
  { label: "By Level", value: "level" },
  { label: "By Schedule", value: "schedule" },
  { label: "By Teacher", value: "teacher" },
];

const weekdayOptions = [
  { shortLabel: "Mon", label: "Monday" },
  { shortLabel: "Tue", label: "Tuesday" },
  { shortLabel: "Wed", label: "Wednesday" },
  { shortLabel: "Thu", label: "Thursday" },
  { shortLabel: "Fri", label: "Friday" },
  { shortLabel: "Sat", label: "Saturday" },
  { shortLabel: "Sun", label: "Sunday" },
];

const quarterHourTimeOptions = Array.from({ length: 24 * 4 }, (_, index) => {
  const hour = Math.floor(index / 4);
  const minute = (index % 4) * 15;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
});

const cambridgeLevelOrder = ["B1", "B2", "C1", "C2"];

const youngLearnerLevelOrder = [
  "Pre-Kids",
  "Pre-Kids 1",
  "Pre-Kids 2",
  "Pre-Kids 3",
  "Kids 1",
  "Kids 2",
  "Kids 3",
  "Junior 1",
  "Junior 2",
  "Junior 3",
  "Junior 4",
  "Teens 1",
  "Teens 2",
  "Teens 3",
];

const unassignedTeacherFilter = "__unassigned";
const missingLevelFilter = "__missing_level";

const inputStyle = {
  width: "100%",
  padding: "12px",
  border: "1px solid #d9d9d9",
  borderRadius: "8px",
  fontSize: "15px",
  color: "#333",
  background: "#ffffff",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  fontWeight: 600,
  marginBottom: "6px",
  display: "block" as const,
  color: "#333",
};

function getTeacherName(teacher: any, fallback = "Unassigned") {
  if (!teacher) return fallback;

  const name = `${teacher.first_name || ""} ${
    teacher.last_name || ""
  }`.trim();

  return name || fallback;
}

function formatCourseType(courseType: string | null | undefined) {
  const normalizedCourseType = normalizeCourseType(courseType);
  const option = courseTypes.find(
    (item) => item.value === normalizedCourseType
  );

  return option?.label || String(courseType || "").trim() || "-";
}

function normalizeCourseType(courseType: string | null | undefined) {
  return String(courseType ?? "").trim().toLowerCase();
}

function isOnlineCourse(courseType: string | null | undefined) {
  return normalizeCourseType(courseType) === "online";
}

function isValidGoogleMeetLink(value: string) {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      url.hostname === "meet.google.com" &&
      url.pathname.replace(/\//g, "").length > 0
    );
  } catch {
    return false;
  }
}

function normalizeLevelName(levelName: string | null | undefined) {
  return String(levelName || "").trim().toUpperCase();
}

function normalizeLevelCategory(category: string | null | undefined) {
  return String(category || "").trim().toLowerCase();
}

function normalizeSearchValue(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function cleanText(value: string | null | undefined, fallback = "-") {
  const text = String(value || "").trim();

  return text || fallback;
}

function getTimeParts(value: string | null | undefined) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return { hour, minute };
}

function normalizeTimeForForm(value: string | null | undefined) {
  const parts = getTimeParts(value);

  if (!parts) {
    return "";
  }

  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(
    2,
    "0"
  )}`;
}

function getTimeMinutes(value: string | null | undefined) {
  const parts = getTimeParts(value);

  if (!parts) {
    return null;
  }

  return parts.hour * 60 + parts.minute;
}

function getTimeSelectOptions(currentValue: string | null | undefined) {
  const normalizedCurrentValue = normalizeTimeForForm(currentValue);
  const options = new Set(quarterHourTimeOptions);

  if (normalizedCurrentValue) {
    options.add(normalizedCurrentValue);
  }

  return Array.from(options).sort((first, second) => {
    const firstMinutes = getTimeMinutes(first);
    const secondMinutes = getTimeMinutes(second);

    return (firstMinutes ?? 0) - (secondMinutes ?? 0);
  });
}

function formatTimeValue(value: string | null | undefined) {
  const timeValue = normalizeTimeForForm(value);

  return timeValue;
}

function formatTimeRange(
  startTime: string | null | undefined,
  endTime: string | null | undefined
) {
  const start = formatTimeValue(startTime);
  const end = formatTimeValue(endTime);

  if (start && end) {
    return `${start}–${end}`;
  }

  return start || end || "Time not set";
}

function parseClassDays(days: string | null | undefined) {
  const normalizedDays = String(days || "")
    .replace(/,/g, " ")
    .replace(/\band\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return weekdayOptions
    .filter((weekday) => {
      const weekdayPattern = new RegExp(`\\b${weekday.label.toLowerCase()}\\b`);

      return weekdayPattern.test(normalizedDays);
    })
    .map((weekday) => weekday.label);
}

function serializeClassDays(days: string[]) {
  const orderedDays = weekdayOptions
    .map((weekday) => weekday.label)
    .filter((weekday) => days.includes(weekday));

  if (orderedDays.length <= 2) {
    return orderedDays.join(" and ");
  }

  return `${orderedDays.slice(0, -1).join(", ")} and ${
    orderedDays[orderedDays.length - 1]
  }`;
}

function canonicalizeClassDays(days: string | null | undefined) {
  return serializeClassDays(parseClassDays(days));
}

function getClassDaysDisplay(days: string | null | undefined) {
  return canonicalizeClassDays(days) || cleanText(days, "Schedule not set");
}

function getDaySortKey(days: string | null | undefined) {
  const parsedDays = parseClassDays(days);

  if (parsedDays.length === 0) {
    return `z-${normalizeSearchValue(days)}`;
  }

  return parsedDays
    .map((day) => {
      const dayIndex = weekdayOptions.findIndex(
        (weekday) => weekday.label === day
      );

      return String(dayIndex).padStart(2, "0");
    })
    .join("-");
}

function isCambridgeLevelName(levelName: string | null | undefined) {
  return cambridgeLevelOrder.includes(normalizeLevelName(levelName));
}

function isSupportLevel(level: any) {
  return (
    normalizeLevelCategory(level?.catagory) === "support" ||
    normalizeLevelName(level?.name) === "SUPPORT CLASSES"
  );
}

function getCourseBadgeClass(courseType: string | null | undefined) {
  const normalizedCourseType = normalizeCourseType(courseType);

  if (["regular", "intensive", "express", "online"].includes(normalizedCourseType)) {
    return `admin-classes-course-badge admin-classes-course-${normalizedCourseType}`;
  }

  return "admin-classes-course-badge";
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getGroupTotalText(count: number) {
  return pluralize(count, "class", "classes");
}

function getSortText(value: string | null | undefined) {
  return normalizeSearchValue(value);
}

const blockerLabels: Record<string, string> = {
  students: "Students",
  young_learners: "Young Learners",
  results: "Results",
  announcements: "Announcements",
  resources: "Resources",
  teacher_notes: "Teacher Notes",
  follow_ups: "Follow Ups",
  friday_tutorial_records: "Friday Tutorial Records",
  unit_exam_results: "Unit Exam Results",
};

function formatDeleteBlockers(blockers: Record<string, number>) {
  const blockerLines = Object.entries(blockers)
    .filter(([, count]) => Number(count) > 0)
    .map(([key, count]) => `- ${blockerLabels[key] || key}: ${count}`);

  if (blockerLines.length === 0) {
    return "";
  }

  return [
    "This class cannot be deleted yet because it still has linked data:",
    "",
    ...blockerLines,
  ].join("\n");
}

export default function AdminClassesPage() {
  const [classes, setClasses] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [studentCountsByClassId, setStudentCountsByClassId] = useState<
    Record<string, number>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingClassId, setEditingClassId] = useState("");
  const [message, setMessage] = useState("");
  const [levelsMessage, setLevelsMessage] = useState("");
  const [teachersMessage, setTeachersMessage] = useState("");
  const [classroomsMessage, setClassroomsMessage] = useState("");
  const [classView, setClassView] = useState<ClassView>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [courseTypeFilter, setCourseTypeFilter] = useState("all");

  const [form, setForm] = useState({
    level_id: "",
    teacher_id: "",
    classroom_id: "",
    course_type: "regular",
    days: "",
    start_time: "",
    end_time: "",
    meet_link: "",
    is_cambridge: true,
  });

  async function loadData() {
    setLoading(true);
    setLevelsMessage("");
    setTeachersMessage("");
    setClassroomsMessage("");

    try {
      const classData = await getAdminClasses();
      setClasses(classData);

      try {
        const studentCounts = await getClassStudentCounts();
        setStudentCountsByClassId(studentCounts);
      } catch (error) {
        console.error("Unable to load class student counts:", error);
        setStudentCountsByClassId({});
      }
    } catch (error: any) {
      console.error("Unable to load classes:", error);
      setClasses([]);
      setStudentCountsByClassId({});
      setMessage("Unable to load classes.");
    }

    try {
      const levelData = await getLevels();
      setLevels(levelData);

      if (levelData.length === 0) {
        setLevelsMessage("No levels found.");
      }
    } catch (error) {
      console.error("Unable to load levels:", error);
      setLevels([]);
      setLevelsMessage("Unable to load levels.");
    }

    try {
      const teacherData = await getTeachers();
      setTeachers(teacherData);

      if (teacherData.length === 0) {
        setTeachersMessage("No teachers found.");
      }
    } catch (error) {
      console.error("Unable to load teachers:", error);
      setTeachers([]);
      setTeachersMessage("Unable to load teachers.");
    }

    try {
      const classroomData = await getClassrooms();
      setClassrooms(classroomData);

      if (classroomData.length === 0) {
        setClassroomsMessage("No classrooms found.");
      }
    } catch (error) {
      console.error("Unable to load classrooms:", error);
      setClassrooms([]);
      setClassroomsMessage("Unable to load classrooms.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function getLevelNameById(levelId: string) {
    const level = getLevelById(levelId);

    return level?.name || "";
  }

  function isCambridgeLevelId(levelId: string) {
    return isCambridgeLevelName(getLevelNameById(levelId));
  }

  function getLevelById(levelId: string) {
    return levels.find((item) => String(item.id) === String(levelId));
  }

  function isSupportLevelId(levelId: string) {
    return isSupportLevel(getLevelById(levelId));
  }

  function isYoungLearnerLevelId(levelId: string) {
    return !isSupportLevelId(levelId);
  }

  function updateForm(field: string, value: any) {
    const selectedCambridgeLevel =
      field === "level_id" ? isCambridgeLevelId(value) : false;
    const selectedSupportLevel =
      field === "level_id" ? isSupportLevelId(value) : false;

    setForm((current) => ({
      ...current,
      [field]: value,
      is_cambridge:
        field === "level_id"
          ? selectedCambridgeLevel && !selectedSupportLevel
          : current.is_cambridge,
      course_type:
        field === "course_type"
          ? value
          : field === "level_id" && (!selectedCambridgeLevel || selectedSupportLevel)
          ? "regular"
          : current.course_type,
      classroom_id:
        field === "course_type" && isOnlineCourse(value)
          ? ""
          : field === "classroom_id"
          ? value
          : current.classroom_id,
    }));
  }

  function updateCambridge(value: boolean) {
    setForm((current) => {
      if (isSupportLevelId(current.level_id)) {
        return {
          ...current,
          is_cambridge: false,
          course_type: "regular",
        };
      }

      const nextIsCambridge = isCambridgeLevelId(current.level_id)
        ? true
        : value;

      return {
        ...current,
        is_cambridge: nextIsCambridge,
        course_type: nextIsCambridge ? current.course_type : "regular",
      };
    });
  }

  function toggleClassDay(day: string) {
    setForm((current) => {
      const selectedDays = parseClassDays(current.days);
      const nextDays = selectedDays.includes(day)
        ? selectedDays.filter((selectedDay) => selectedDay !== day)
        : [...selectedDays, day];

      return {
        ...current,
        days: serializeClassDays(nextDays),
      };
    });
  }

  function resetForm() {
    setForm({
      level_id: "",
      teacher_id: "",
      classroom_id: "",
      course_type: "regular",
      days: "",
      start_time: "",
      end_time: "",
      meet_link: "",
      is_cambridge: true,
    });
  }

  function cancelEdit() {
    setEditingClassId("");
    resetForm();
    setMessage("");
  }

  function getLevelName(levelId: string) {
    return getLevelNameById(levelId) || "-";
  }

  function getTeacherById(teacherId: string) {
    return teachers.find((item) => item.id === teacherId);
  }

  function getClassroomName(item: any) {
    if (isOnlineCourse(item.course_type)) {
      return "Online";
    }

    const classroom = classrooms.find(
      (classroomItem) => classroomItem.id === item.classroom_id
    );

    return classroom?.name || "No classroom assigned";
  }

  function startEdit(item: any) {
    const isForcedCambridge = isCambridgeLevelId(item.level_id || "");
    const isForcedSupport = isSupportLevelId(item.level_id || "");

    setEditingClassId(item.id);
    setMessage("");
    setForm({
      level_id: item.level_id || "",
      teacher_id: item.teacher_id || "",
      classroom_id: item.classroom_id || "",
      course_type: isForcedSupport ? "regular" : item.course_type || "regular",
      days: canonicalizeClassDays(item.days) || "",
      start_time: normalizeTimeForForm(item.start_time),
      end_time: normalizeTimeForForm(item.end_time),
      meet_link: item.meet_link || "",
      is_cambridge: isForcedSupport
        ? false
        : isForcedCambridge
        ? true
        : Boolean(item.is_cambridge),
    });
  }

  async function handleDeleteClass(classId: string) {
    const confirmed = confirm(
      "Are you sure you want to delete this class? This cannot be undone."
    );

    if (!confirmed) return;

    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setMessage("You must be logged in as an admin.");
        return;
      }

      const response = await fetch("/api/admin/classes/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          class_id: classId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        const blockerMessage = result.blockers
          ? formatDeleteBlockers(result.blockers)
          : "";

        throw new Error(
          blockerMessage ||
            result.details ||
            result.message ||
            result.error ||
            "Unable to delete class."
        );
      }

      if (editingClassId === classId) {
        setEditingClassId("");
        resetForm();
      }

      await loadData();
      setMessage(result.message || "Class deleted successfully.");
    } catch (error: any) {
      console.error("Unable to delete class:", error);
      setMessage(error.message || "Unable to delete class.");
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const isOnlineClass = isOnlineCourse(form.course_type);
    const trimmedMeetLink = form.meet_link.trim();
    const selectedDays = parseClassDays(form.days);
    const savedDays = serializeClassDays(selectedDays);
    const startMinutes = getTimeMinutes(form.start_time);
    const endMinutes = getTimeMinutes(form.end_time);

    if (!isOnlineClass && !form.classroom_id) {
      setMessage("Please select a classroom for in-person classes.");
      setSaving(false);
      return;
    }

    if (selectedDays.length === 0) {
      setMessage("Select at least one class day.");
      setSaving(false);
      return;
    }

    if (startMinutes === null) {
      setMessage("Select a start time.");
      setSaving(false);
      return;
    }

    if (endMinutes === null) {
      setMessage("Select an end time.");
      setSaving(false);
      return;
    }

    if (endMinutes <= startMinutes) {
      setMessage("End time must be later than start time.");
      setSaving(false);
      return;
    }

    if (isOnlineClass && !isValidGoogleMeetLink(trimmedMeetLink)) {
      setMessage("Please enter a valid Google Meet link.");
      setSaving(false);
      return;
    }

    const selectedLevel = getLevelById(form.level_id);
    const isForcedCambridge = isCambridgeLevelName(selectedLevel?.name);
    const isForcedSupport = isSupportLevel(selectedLevel);
    const savedCourseType = isForcedSupport ? "regular" : form.course_type;
    const savedIsOnlineClass = isOnlineCourse(savedCourseType);

    const classData: any = {
      class_name: selectedLevel?.name || "",
      level_id: form.level_id,
      teacher_id: form.teacher_id,
      classroom_id: savedIsOnlineClass ? null : form.classroom_id,
      course_type: savedCourseType,
      days: savedDays,
      start_time: normalizeTimeForForm(form.start_time),
      end_time: normalizeTimeForForm(form.end_time),
      meet_link: savedIsOnlineClass ? trimmedMeetLink : null,
      is_cambridge: isForcedSupport
        ? false
        : isForcedCambridge
        ? true
        : form.is_cambridge,
    };

    try {
      if (editingClassId) {
        await updateClass(editingClassId, classData);
      } else {
        await createClass(classData);
      }

      await loadData();
      resetForm();
      setEditingClassId("");
      setMessage(
        editingClassId
          ? "Class updated successfully."
          : "Class created successfully."
      );
    } catch (error: any) {
      console.error("Unable to save class:", error);
      setMessage("Unable to save class.");
    } finally {
      setSaving(false);
    }
  }

  function getLevelSortValue(levelName: string, levelId: string) {
    const normalizedLevelName = normalizeLevelName(levelName);
    const normalizedYoungLearnerOrder = youngLearnerLevelOrder.map((level) =>
      normalizeLevelName(level)
    );
    const cambridgeIndex = cambridgeLevelOrder.indexOf(normalizedLevelName);

    if (cambridgeIndex >= 0) {
      return 100 + cambridgeIndex;
    }

    const youngLearnerIndex =
      normalizedYoungLearnerOrder.indexOf(normalizedLevelName);

    if (youngLearnerIndex >= 0) {
      return 200 + youngLearnerIndex;
    }

    if (normalizedLevelName === "SUPPORT CLASSES") {
      return 300;
    }

    const loadedLevelIndex = levels.findIndex(
      (level) => String(level.id) === String(levelId)
    );

    return loadedLevelIndex >= 0 ? 400 + loadedLevelIndex : 999;
  }

  const enrichedClasses = useMemo(() => {
    return classes.map((item) => {
      const level = levels.find(
        (levelItem) => String(levelItem.id) === String(item.level_id)
      );
      const teacher = teachers.find(
        (teacherItem) => String(teacherItem.id) === String(item.teacher_id)
      );
      const classId = String(item.id || "");
      const levelName = cleanText(level?.name, "Unknown Level");
      const className = cleanText(item.class_name, levelName);
      const courseType = normalizeCourseType(item.course_type || "regular");
      const courseTypeLabel = formatCourseType(courseType);
      const teacherName = getTeacherName(teacher);
      const classroomName = getClassroomName(item);
      const days = getClassDaysDisplay(item.days);
      const canonicalDays = canonicalizeClassDays(item.days);
      const timeLabel = formatTimeRange(item.start_time, item.end_time);
      const isOnline = isOnlineCourse(item.course_type);
      const studentCount = Number(studentCountsByClassId[classId] || 0);
      const searchableText = [
        className,
        levelName,
        courseTypeLabel,
        teacherName,
        classroomName,
        days,
        timeLabel,
      ].join(" ");

      return {
        id: classId,
        original: item,
        className,
        levelId: String(item.level_id || ""),
        levelName,
        levelCategory: level?.catagory || "",
        levelSortValue: getLevelSortValue(levelName, String(item.level_id || "")),
        courseType,
        courseTypeLabel,
        days,
        canonicalDays,
        rawDays: String(item.days || "").trim(),
        startTime: normalizeTimeForForm(item.start_time),
        endTime: normalizeTimeForForm(item.end_time),
        timeLabel,
        teacherId: String(item.teacher_id || ""),
        teacherName,
        classroomId: String(item.classroom_id || ""),
        classroomName,
        isOnline,
        meetLink: String(item.meet_link || "").trim(),
        studentCount,
        searchText: normalizeSearchValue(searchableText),
      };
    });
  }, [classes, levels, teachers, classrooms, studentCountsByClassId]);

  function sortClassRows(rows: any[]) {
    return [...rows].sort((first, second) => {
      const levelComparison = first.levelSortValue - second.levelSortValue;

      if (levelComparison !== 0) return levelComparison;

      const dayComparison = getDaySortKey(first.days).localeCompare(
        getDaySortKey(second.days)
      );

      if (dayComparison !== 0) return dayComparison;

      const timeComparison = first.startTime.localeCompare(second.startTime);

      if (timeComparison !== 0) return timeComparison;

      const teacherComparison = getSortText(first.teacherName).localeCompare(
        getSortText(second.teacherName)
      );

      if (teacherComparison !== 0) return teacherComparison;

      return first.id.localeCompare(second.id);
    });
  }

  const filteredClasses = useMemo(() => {
    const normalizedSearchTerm = normalizeSearchValue(searchTerm);

    return sortClassRows(
      enrichedClasses.filter((item) => {
        const matchesSearch =
          !normalizedSearchTerm || item.searchText.includes(normalizedSearchTerm);
        const matchesLevel =
          levelFilter === "all" ||
          (levelFilter === missingLevelFilter && !item.levelId) ||
          item.levelId === levelFilter;
        const matchesTeacher =
          teacherFilter === "all" ||
          (teacherFilter === unassignedTeacherFilter && !item.teacherId) ||
          item.teacherId === teacherFilter;
        const matchesCourseType =
          courseTypeFilter === "all" || item.courseType === courseTypeFilter;

        return (
          matchesSearch &&
          matchesLevel &&
          matchesTeacher &&
          matchesCourseType
        );
      })
    );
  }, [
    enrichedClasses,
    searchTerm,
    levelFilter,
    teacherFilter,
    courseTypeFilter,
  ]);

  const levelFilterOptions = useMemo(() => {
    const optionsByValue = new Map<string, { value: string; label: string }>();

    for (const item of enrichedClasses) {
      const value = item.levelId || missingLevelFilter;

      if (!optionsByValue.has(value)) {
        optionsByValue.set(value, {
          value,
          label: item.levelName || "Unknown Level",
        });
      }
    }

    return Array.from(optionsByValue.values()).sort((first, second) => {
      const firstRow = enrichedClasses.find((item) => {
        return (item.levelId || missingLevelFilter) === first.value;
      });
      const secondRow = enrichedClasses.find((item) => {
        return (item.levelId || missingLevelFilter) === second.value;
      });

      return (
        (firstRow?.levelSortValue || 999) - (secondRow?.levelSortValue || 999)
      );
    });
  }, [enrichedClasses]);

  const teacherFilterOptions = useMemo(() => {
    const optionsByValue = new Map<string, { value: string; label: string }>();
    let hasUnassignedClasses = false;

    for (const item of enrichedClasses) {
      if (!item.teacherId) {
        hasUnassignedClasses = true;
        continue;
      }

      if (!optionsByValue.has(item.teacherId)) {
        optionsByValue.set(item.teacherId, {
          value: item.teacherId,
          label: item.teacherName,
        });
      }
    }

    const options = Array.from(optionsByValue.values()).sort((first, second) =>
      first.label.localeCompare(second.label, undefined, {
        sensitivity: "base",
      })
    );

    if (hasUnassignedClasses) {
      options.push({
        value: unassignedTeacherFilter,
        label: "Unassigned",
      });
    }

    return options;
  }, [enrichedClasses]);

  const courseTypeFilterOptions = useMemo(() => {
    const knownCourseTypes = new Set(courseTypes.map((item) => item.value));
    const unknownCourseTypes = Array.from(
      new Set(
        enrichedClasses
          .map((item) => item.courseType)
          .filter((courseType) => courseType && !knownCourseTypes.has(courseType))
      )
    ).sort();

    return [
      ...courseTypes,
      ...unknownCourseTypes.map((courseType) => ({
        value: courseType,
        label: formatCourseType(courseType),
      })),
    ];
  }, [enrichedClasses]);

  const listSummary = useMemo(() => {
    const assignedTeacherCount = new Set(
      filteredClasses.map((item) => item.teacherId).filter(Boolean)
    ).size;
    const onlineCount = filteredClasses.filter((item) => item.isOnline).length;

    return [
      pluralize(filteredClasses.length, "class", "classes"),
      pluralize(assignedTeacherCount, "teacher", "teachers"),
      `${onlineCount} online`,
    ].join(" · ");
  }, [filteredClasses]);

  const levelGroups = useMemo(() => {
    const groups = new Map<
      string,
      { id: string; label: string; sortValue: number; rows: any[] }
    >();

    for (const item of filteredClasses) {
      const groupId = item.levelId || missingLevelFilter;

      if (!groups.has(groupId)) {
        groups.set(groupId, {
          id: groupId,
          label: item.levelName || "Unknown Level",
          sortValue: item.levelSortValue,
          rows: [],
        });
      }

      groups.get(groupId)?.rows.push(item);
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        rows: sortClassRows(group.rows),
      }))
      .sort((first, second) => first.sortValue - second.sortValue);
  }, [filteredClasses]);

  const scheduleGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        days: string;
        sortText: string;
        timeSlots: Map<
          string,
          { label: string; startTime: string; rows: any[] }
        >;
      }
    >();

    for (const item of filteredClasses) {
      const days = item.canonicalDays || item.rawDays || "Schedule not set";
      const daysKey = days;
      const timeKey = `${item.startTime || "missing"}|${
        item.endTime || "missing"
      }`;

      if (!groups.has(daysKey)) {
        groups.set(daysKey, {
          days,
          sortText: getDaySortKey(days),
          timeSlots: new Map(),
        });
      }

      const group = groups.get(daysKey);

      if (group && !group.timeSlots.has(timeKey)) {
        group.timeSlots.set(timeKey, {
          label: item.timeLabel,
          startTime: item.startTime,
          rows: [],
        });
      }

      group?.timeSlots.get(timeKey)?.rows.push(item);
    }

    return Array.from(groups.values())
      .sort((first, second) => first.sortText.localeCompare(second.sortText))
      .map((group) => ({
        days: group.days,
        timeSlots: Array.from(group.timeSlots.values())
          .map((timeSlot) => ({
            ...timeSlot,
            rows: sortClassRows(timeSlot.rows),
          }))
          .sort((first, second) => {
            const timeComparison = first.startTime.localeCompare(
              second.startTime
            );

            if (timeComparison !== 0) return timeComparison;

            return first.label.localeCompare(second.label);
          }),
      }));
  }, [filteredClasses]);

  const teacherGroups = useMemo(() => {
    const groups = new Map<
      string,
      { id: string; label: string; rows: any[]; isUnassigned: boolean }
    >();

    for (const item of filteredClasses) {
      const groupId = item.teacherId || unassignedTeacherFilter;

      if (!groups.has(groupId)) {
        groups.set(groupId, {
          id: groupId,
          label: item.teacherId ? item.teacherName : "Unassigned",
          rows: [],
          isUnassigned: !item.teacherId,
        });
      }

      groups.get(groupId)?.rows.push(item);
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        rows: sortClassRows(group.rows),
      }))
      .sort((first, second) => {
        if (first.isUnassigned !== second.isUnassigned) {
          return first.isUnassigned ? 1 : -1;
        }

        return first.label.localeCompare(second.label, undefined, {
          sensitivity: "base",
        });
      });
  }, [filteredClasses]);

  function renderClassIdentity(item: any, includeLevel = true) {
    const showClassName =
      item.className &&
      normalizeSearchValue(item.className) !== normalizeSearchValue(item.levelName);

    return (
      <div className="admin-classes-class-cell">
        <strong>{includeLevel ? item.levelName : item.className || item.levelName}</strong>
        {includeLevel && showClassName && <span>{item.className}</span>}
        {!includeLevel && !showClassName && (
          <span>{item.isOnline ? "Online class" : "Teaching group"}</span>
        )}
      </div>
    );
  }

  function renderActions(item: any) {
    return (
      <div className="admin-classes-actions">
        <button
          className="admin-classes-action-button admin-classes-action-edit"
          type="button"
          onClick={() => startEdit(item.original)}
        >
          Edit
        </button>
        <button
          className="admin-classes-action-button admin-classes-action-delete"
          type="button"
          onClick={() => handleDeleteClass(item.id)}
        >
          Delete
        </button>
      </div>
    );
  }

  function renderClassesTable(
    rows: any[],
    options: {
      firstColumnLabel?: string;
      includeLevel?: boolean;
      showDays?: boolean;
      showTime?: boolean;
      showTeacher?: boolean;
      showClassroom?: boolean;
    } = {}
  ) {
    const {
      firstColumnLabel = "Level / Class",
      includeLevel = true,
      showDays = true,
      showTime = true,
      showTeacher = true,
      showClassroom = true,
    } = options;

    return (
      <div className="admin-classes-table-wrap">
        <table className="admin-classes-table">
          <caption>Admin class list</caption>
          <thead>
            <tr>
              <th>{firstColumnLabel}</th>
              <th>Course Type</th>
              {showDays && <th>Days</th>}
              {showTime && <th>Time</th>}
              {showTeacher && <th>Teacher</th>}
              {showClassroom && <th>Classroom</th>}
              <th className="admin-classes-number-cell">Students</th>
              <th className="admin-classes-actions-heading">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>{renderClassIdentity(item, includeLevel)}</td>
                <td>
                  <span className={getCourseBadgeClass(item.courseType)}>
                    {item.courseTypeLabel}
                  </span>
                </td>
                {showDays && <td>{item.days}</td>}
                {showTime && <td>{item.timeLabel}</td>}
                {showTeacher && <td>{item.teacherName}</td>}
                {showClassroom && (
                  <td>
                    <span
                      className={
                        item.isOnline
                          ? "admin-classes-online-label"
                          : undefined
                      }
                    >
                      {item.classroomName}
                    </span>
                  </td>
                )}
                <td className="admin-classes-number-cell">
                  {item.studentCount}
                </td>
                <td>{renderActions(item)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderCurrentView() {
    if (loading) {
      return (
        <div className="admin-classes-empty">
          <p>Loading classes...</p>
        </div>
      );
    }

    if (classes.length === 0) {
      return (
        <div className="admin-classes-empty">
          <p>No classes found.</p>
        </div>
      );
    }

    if (filteredClasses.length === 0) {
      return (
        <div className="admin-classes-empty">
          <p>No classes match the current filters.</p>
        </div>
      );
    }

    if (classView === "level") {
      return (
        <div className="admin-classes-group-list">
          {levelGroups.map((group) => (
            <section className="admin-classes-group" key={group.id}>
              <div className="admin-classes-group-heading">
                <h3>{group.label}</h3>
                <span>{getGroupTotalText(group.rows.length)}</span>
              </div>
              {renderClassesTable(group.rows, {
                firstColumnLabel: "Class",
                includeLevel: false,
              })}
            </section>
          ))}
        </div>
      );
    }

    if (classView === "schedule") {
      return (
        <div className="admin-classes-group-list">
          {scheduleGroups.map((daysGroup) => (
            <section className="admin-classes-schedule-group" key={daysGroup.days}>
              <div className="admin-classes-group-heading">
                <h3>{daysGroup.days}</h3>
                <span>
                  {getGroupTotalText(
                    daysGroup.timeSlots.reduce(
                      (total, timeSlot) => total + timeSlot.rows.length,
                      0
                    )
                  )}
                </span>
              </div>
              <div className="admin-classes-time-slot-list">
                {daysGroup.timeSlots.map((timeSlot) => (
                  <div
                    className="admin-classes-time-slot"
                    key={`${daysGroup.days}-${timeSlot.label}`}
                  >
                    <h4>{timeSlot.label}</h4>
                    {renderClassesTable(timeSlot.rows, {
                      showDays: false,
                      showTime: false,
                    })}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      );
    }

    if (classView === "teacher") {
      return (
        <div className="admin-classes-group-list">
          {teacherGroups.map((group) => (
            <section className="admin-classes-group" key={group.id}>
              <div className="admin-classes-group-heading">
                <h3>{group.label}</h3>
                <span>{getGroupTotalText(group.rows.length)}</span>
              </div>
              {renderClassesTable(group.rows, {
                showTeacher: false,
              })}
            </section>
          ))}
        </div>
      );
    }

    return renderClassesTable(filteredClasses);
  }

  const selectedFormLevel = getLevelById(form.level_id);
  const selectedFormIsCambridge = isCambridgeLevelId(form.level_id);
  const selectedFormIsSupport = isSupportLevel(selectedFormLevel);
  const selectedFormDays = parseClassDays(form.days);
  const startTimeOptions = getTimeSelectOptions(form.start_time);
  const endTimeOptions = getTimeSelectOptions(form.end_time);

  return (
    <AdminLayout>
      <div className="admin-classes-page">
        <div className="admin-classes-page-heading">
          <h1>Classes / Groups</h1>
          <p>Create and manage teaching groups.</p>
        </div>

        {message && (
          <div className="admin-classes-message">
            {message}
          </div>
        )}

        <form
          className="admin-classes-form-card"
          onSubmit={handleSubmit}
        >
          <h2>
            {editingClassId ? "Edit Class / Group" : "Create Class / Group"}
          </h2>

          <div className="admin-classes-form-grid">
            <div>
              <label style={labelStyle}>Level</label>
              <select
                required
                style={inputStyle}
                value={form.level_id}
                onChange={(event) =>
                  updateForm("level_id", event.target.value)
                }
              >
                <option value="">Select level</option>
                {levels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>
              {levelsMessage && (
                <p className="admin-classes-field-error">
                  {levelsMessage}
                </p>
              )}
            </div>

            <div>
              <label style={labelStyle}>Teacher</label>
              <select
                required
                style={inputStyle}
                value={form.teacher_id}
                onChange={(event) =>
                  updateForm("teacher_id", event.target.value)
                }
              >
                <option value="">Select teacher</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {getTeacherName(teacher, "-")}
                  </option>
                ))}
              </select>
              {teachersMessage && (
                <p className="admin-classes-field-error">
                  {teachersMessage}
                </p>
              )}
            </div>

            {isOnlineCourse(form.course_type) ? (
              <div>
                <label style={labelStyle}>Classroom</label>
                <div className="admin-classes-online-form-note">
                  Online Class
                </div>
                <p className="admin-classes-form-help">
                  Online classes do not use a physical classroom.
                </p>

                <label style={{ ...labelStyle, marginTop: "14px" }}>
                  Google Meet link
                </label>
                <input
                  required
                  type="url"
                  style={inputStyle}
                  placeholder="https://meet.google.com/abc-defg-hij"
                  value={form.meet_link}
                  onChange={(event) =>
                    updateForm("meet_link", event.target.value)
                  }
                />
              </div>
            ) : (
              <div>
                <label style={labelStyle}>Classroom</label>
                <select
                  required
                  style={inputStyle}
                  value={form.classroom_id}
                  onChange={(event) =>
                    updateForm("classroom_id", event.target.value)
                  }
                >
                  <option value="">Select classroom</option>
                  {classrooms.map((classroom) => (
                    <option key={classroom.id} value={classroom.id}>
                      {classroom.name}
                    </option>
                  ))}
                </select>
                {classroomsMessage && (
                  <p className="admin-classes-field-error">
                    {classroomsMessage}
                  </p>
                )}
              </div>
            )}

            <div>
              <label style={labelStyle}>Course Type</label>
              <select
                required
                style={inputStyle}
                value={form.course_type}
                onChange={(event) =>
                  updateForm("course_type", event.target.value)
                }
              >
                {courseTypes
                  .filter(
                    (courseType) =>
                      form.is_cambridge ||
                      courseType.value === "regular"
                  )
                  .map((courseType) => (
                    <option
                      key={courseType.value}
                      value={courseType.value}
                    >
                      {courseType.label}
                    </option>
                  ))}
              </select>
            </div>

            <div className="admin-classes-day-field">
              <span className="admin-classes-day-label">Days</span>
              <div
                className="admin-classes-day-toggle-group"
                role="group"
                aria-label="Class days"
              >
                {weekdayOptions.map((weekday) => {
                  const isSelected = selectedFormDays.includes(weekday.label);

                  return (
                    <button
                      aria-pressed={isSelected}
                      className={
                        isSelected
                          ? "admin-classes-day-toggle admin-classes-day-toggle-selected"
                          : "admin-classes-day-toggle"
                      }
                      key={weekday.label}
                      type="button"
                      onClick={() => toggleClassDay(weekday.label)}
                    >
                      {weekday.shortLabel}
                    </button>
                  );
                })}
              </div>
              <p className="admin-classes-form-help">
                {form.days || "Select at least one class day."}
              </p>
            </div>

            <div className="admin-classes-time-field">
              <div>
                <label style={labelStyle}>Start time</label>
                <select
                  required
                  style={inputStyle}
                  value={form.start_time}
                  onChange={(event) =>
                    updateForm("start_time", event.target.value)
                  }
                >
                  <option value="">Select start</option>
                  {startTimeOptions.map((timeOption) => (
                    <option key={timeOption} value={timeOption}>
                      {timeOption}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>End time</label>
                <select
                  required
                  style={inputStyle}
                  value={form.end_time}
                  onChange={(event) =>
                    updateForm("end_time", event.target.value)
                  }
                >
                  <option value="">Select end</option>
                  {endTimeOptions.map((timeOption) => (
                    <option key={timeOption} value={timeOption}>
                      {timeOption}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {!selectedFormIsSupport && (
            <label className="admin-classes-checkbox-label">
              <input
                type="checkbox"
                checked={form.is_cambridge}
                disabled={selectedFormIsCambridge}
                onChange={(event) =>
                  updateCambridge(event.target.checked)
                }
              />
              Cambridge class
            </label>
          )}

          {selectedFormIsCambridge && (
            <p className="admin-classes-form-help">
              B1, B2, C1 and C2 are always saved as Cambridge classes.
            </p>
          )}

          {selectedFormIsSupport && (
            <p className="admin-classes-form-help admin-classes-support-help">
              Support Classes are saved separately from Cambridge and Young
              Learner groups.
            </p>
          )}

          <div className="admin-classes-form-actions">
            <button
              className="admin-classes-primary-button"
              type="submit"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : editingClassId
                ? "Save Changes"
                : "Create Class"}
            </button>

            {editingClassId && (
              <button
                className="admin-classes-secondary-button"
                type="button"
                onClick={cancelEdit}
              >
                Cancel Edit
              </button>
            )}
          </div>
        </form>

        <section className="admin-classes-list-card">
          <div className="admin-classes-list-header">
            <div>
              <h2>Class Management</h2>
              <p>
                View classes by level, schedule or teacher without leaving this
                page.
              </p>
            </div>
            <span className="admin-classes-summary">{listSummary}</span>
          </div>

          <div
            className="admin-classes-view-selector"
            role="tablist"
            aria-label="Class views"
          >
            {classViewOptions.map((option) => (
              <button
                aria-selected={classView === option.value}
                className={
                  classView === option.value
                    ? "admin-classes-view-tab admin-classes-view-tab-active"
                    : "admin-classes-view-tab"
                }
                key={option.value}
                role="tab"
                type="button"
                onClick={() => setClassView(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="admin-classes-toolbar">
            <label className="admin-classes-search">
              <span>Search</span>
              <input
                type="search"
                placeholder="Search classes..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>

            <label className="admin-classes-filter">
              <span>Level</span>
              <select
                value={levelFilter}
                onChange={(event) => setLevelFilter(event.target.value)}
              >
                <option value="all">All levels</option>
                {levelFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-classes-filter">
              <span>Teacher</span>
              <select
                value={teacherFilter}
                onChange={(event) => setTeacherFilter(event.target.value)}
              >
                <option value="all">All teachers</option>
                {teacherFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-classes-filter">
              <span>Course Type</span>
              <select
                value={courseTypeFilter}
                onChange={(event) => setCourseTypeFilter(event.target.value)}
              >
                <option value="all">All course types</option>
                {courseTypeFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {renderCurrentView()}
        </section>
      </div>
    </AdminLayout>
  );
}
