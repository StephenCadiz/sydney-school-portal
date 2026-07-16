"use client";

import { useEffect, useState } from "react";

import AdminLayout from "../../components/layout/AdminLayout";
import {
  createClass,
  getAdminClasses,
  getClassrooms,
  getLevels,
  getTeachers,
  updateClass,
} from "../../../lib/adminClasses";
import { supabase } from "../../../lib/supabase";

const courseTypes = [
  { label: "Regular", value: "regular" },
  { label: "Intensive", value: "intensive" },
  { label: "Express", value: "express" },
  { label: "Online", value: "online" },
];

const dayOptions = [
  "Monday and Wednesday",
  "Tuesday and Thursday",
  "Monday, Wednesday and Friday",
];

const timeSlotOptions = [
  "16:00-17:00",
  "17:00-18:00",
  "16:30-18:00",
  "18:00-19:30",
  "19:30-21:00",
];

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

function getTeacherName(teacher: any) {
  if (!teacher) return "-";

  return `${teacher.first_name || ""} ${
    teacher.last_name || ""
  }`.trim();
}

function formatCourseType(courseType: string) {
  const option = courseTypes.find(
    (item) => item.value === courseType
  );

  return option?.label || courseType || "-";
}

function isOnlineCourse(courseType: string) {
  return courseType === "online";
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

function isCambridgeLevelName(levelName: string | null | undefined) {
  return cambridgeLevelOrder.includes(normalizeLevelName(levelName));
}

function isSupportLevel(level: any) {
  return (
    normalizeLevelCategory(level?.catagory) === "support" ||
    normalizeLevelName(level?.name) === "SUPPORT CLASSES"
  );
}

function getOrderedLevelNames(groupedItems: Record<string, any[]>, order: string[]) {
  const knownLevels = order.filter((level) => groupedItems[level]?.length > 0);
  const otherLevels = Object.keys(groupedItems)
    .filter((level) => !order.includes(level))
    .sort((first, second) => first.localeCompare(second));

  return [...knownLevels, ...otherLevels];
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingClassId, setEditingClassId] = useState("");
  const [message, setMessage] = useState("");
  const [levelsMessage, setLevelsMessage] = useState("");
  const [teachersMessage, setTeachersMessage] = useState("");
  const [classroomsMessage, setClassroomsMessage] = useState("");

  const [form, setForm] = useState({
    level_id: "",
    teacher_id: "",
    classroom_id: "",
    course_type: "regular",
    days: "",
    start_time: "",
    end_time: "",
    time_slot: "",
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
    } catch (error: any) {
      console.error("Unable to load classes:", error);
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

  function updateTimeSlot(value: string) {
    const [startTime = "", endTime = ""] = value.split("-");

    setForm((current) => ({
      ...current,
      time_slot: value,
      start_time: startTime,
      end_time: endTime,
    }));
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
      time_slot: "",
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
      return "Online Class";
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
      days: item.days || "",
      start_time: item.start_time || "",
      end_time: item.end_time || "",
      time_slot:
        item.start_time && item.end_time
          ? `${item.start_time}-${item.end_time}`
          : "",
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

    if (!isOnlineClass && !form.classroom_id) {
      setMessage("Please select a classroom for in-person classes.");
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
      days: form.days,
      start_time: form.start_time,
      end_time: form.end_time,
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

  function groupClassesByLevel(items: any[]) {
    return items.reduce((groups: Record<string, any[]>, item) => {
      const levelName = getLevelName(item.level_id) || "Unknown Level";

      if (!groups[levelName]) {
        groups[levelName] = [];
      }

      groups[levelName].push(item);

      return groups;
    }, {});
  }

  function renderClassCard(item: any) {
    return (
      <div
        key={item.id}
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: "10px",
          padding: "18px",
          background: "#f8f9fc",
        }}
      >
        <h3
          style={{
            color: "#1f3c88",
            marginTop: 0,
            marginBottom: "12px",
          }}
        >
          {getLevelName(item.level_id)}
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
            color: "#555",
          }}
        >
          <div>
            <strong>Level</strong>
            <br />
            {getLevelName(item.level_id)}
          </div>

          <div>
            <strong>Days</strong>
            <br />
            {item.days || "-"}
          </div>

          <div>
            <strong>Time</strong>
            <br />
            {item.start_time || "-"} - {item.end_time || "-"}
          </div>

          <div>
            <strong>Classroom</strong>
            <br />
            {getClassroomName(item)}
          </div>

          <div>
            <strong>Teacher</strong>
            <br />
            {getTeacherName(getTeacherById(item.teacher_id))}
          </div>

          <div>
            <strong>Course Type</strong>
            <br />
            {formatCourseType(item.course_type)}
          </div>

          <div>
            <strong>Type</strong>
            <br />
            {item.is_cambridge ? "Cambridge" : "Non-Cambridge"}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "12px",
            marginTop: "18px",
          }}
        >
          <button
            onClick={() => startEdit(item)}
            style={{
              background: "#1f3c88",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "10px 16px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Edit
          </button>

          <button
            onClick={() => handleDeleteClass(item.id)}
            style={{
              background: "#d32f2f",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "10px 16px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  function renderGroupedClassSection(
    title: string,
    items: any[],
    levelOrder: string[],
    emptyMessage: string
  ) {
    const groupedItems = groupClassesByLevel(items);
    const orderedLevels = getOrderedLevelNames(groupedItems, levelOrder);

    return (
      <section
        style={{
          display: "grid",
          gap: "14px",
        }}
      >
        <h3
          style={{
            color: "#1f3c88",
            margin: 0,
            fontSize: "22px",
          }}
        >
          {title}
        </h3>

        {items.length === 0 ? (
          <p
            style={{
              color: "#333",
              margin: 0,
            }}
          >
            {emptyMessage}
          </p>
        ) : (
          orderedLevels.map((levelName) => (
            <div
              key={`${title}-${levelName}`}
              style={{
                border: "1px solid #e6eaf2",
                borderRadius: "12px",
                padding: "16px",
                background: "#ffffff",
              }}
            >
              <h4
                style={{
                  color: "#333",
                  margin: "0 0 12px",
                  fontSize: "17px",
                }}
              >
                {levelName}
              </h4>

              <div
                style={{
                  display: "grid",
                  gap: "12px",
                }}
              >
                {groupedItems[levelName].map(renderClassCard)}
              </div>
            </div>
          ))
        )}
      </section>
    );
  }

  const cambridgeClasses = classes.filter(
    (item) =>
      item.is_cambridge === true &&
      !isSupportLevelId(item.level_id || "")
  );
  const youngLearnerClasses = classes.filter(
    (item) =>
      item.is_cambridge !== true &&
      isYoungLearnerLevelId(item.level_id || "")
  );
  const supportClasses = classes.filter(
    (item) => isSupportLevelId(item.level_id || "")
  );
  const selectedFormLevel = getLevelById(form.level_id);
  const selectedFormIsCambridge = isCambridgeLevelId(form.level_id);
  const selectedFormIsSupport = isSupportLevel(selectedFormLevel);

  return (
    <AdminLayout>
      <h1
        style={{
          color: "#1f3c88",
          marginBottom: "10px",
        }}
      >
        Classes / Groups
      </h1>

      <p
        style={{
          color: "#666",
          marginBottom: "30px",
        }}
      >
        Create and manage teaching groups.
      </p>

      {message && (
        <div
          style={{
            background: "#ffffff",
            borderRadius: "8px",
            padding: "14px",
            marginBottom: "20px",
            color: "#333",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          {message}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          background: "#ffffff",
          padding: "30px",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          marginBottom: "30px",
        }}
      >
        <h2
          style={{
            color: "#1f3c88",
            marginTop: 0,
            marginBottom: "25px",
          }}
        >
          {editingClassId ? "Edit Class / Group" : "Create Class / Group"}
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "20px",
          }}
        >
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
              <p
                style={{
                  color: "#b00020",
                  marginBottom: 0,
                }}
              >
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
                  {getTeacherName(teacher)}
                </option>
              ))}
            </select>
            {teachersMessage && (
              <p
                style={{
                  color: "#b00020",
                  marginBottom: 0,
                }}
              >
                {teachersMessage}
              </p>
            )}
          </div>

          {isOnlineCourse(form.course_type) ? (
            <div>
              <label style={labelStyle}>Classroom</label>
              <div
                style={{
                  ...inputStyle,
                  background: "#f5f7fa",
                  color: "#1f3c88",
                  fontWeight: 700,
                }}
              >
                Online Class
              </div>
              <p
                style={{
                  color: "#667085",
                  margin: "8px 0 0",
                  fontSize: "13px",
                }}
              >
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
                <p
                  style={{
                    color: "#b00020",
                    marginBottom: 0,
                  }}
                >
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

          <div>
            <label style={labelStyle}>Days</label>
            <select
              required
              style={inputStyle}
              value={form.days}
              onChange={(event) =>
                updateForm("days", event.target.value)
              }
            >
              <option value="">Select days</option>
              {dayOptions.map((days) => (
                <option key={days} value={days}>
                  {days}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Time Slot</label>
            <select
              required
              style={inputStyle}
              value={form.time_slot}
              onChange={(event) =>
                updateTimeSlot(event.target.value)
              }
            >
              <option value="">Select time slot</option>
              {timeSlotOptions.map((timeSlot) => (
                <option key={timeSlot} value={timeSlot}>
                  {timeSlot}
                </option>
              ))}
            </select>
          </div>

        </div>

        {!selectedFormIsSupport && (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginTop: "20px",
              color: "#333",
              fontWeight: 600,
            }}
          >
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
          <p
            style={{
              color: "#667085",
              margin: "8px 0 0",
              fontSize: "13px",
            }}
          >
            B1, B2, C1 and C2 are always saved as Cambridge classes.
          </p>
        )}

        {selectedFormIsSupport && (
          <p
            style={{
              color: "#667085",
              margin: "20px 0 0",
              fontSize: "13px",
            }}
          >
            Support Classes are saved separately from Cambridge and Young
            Learner groups.
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          style={{
            background: "#1f3c88",
            color: "#ffffff",
            border: "none",
            borderRadius: "8px",
            padding: "12px 22px",
            marginTop: "25px",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          {saving
            ? "Saving..."
            : editingClassId
            ? "Save Changes"
            : "Create Class"}
        </button>

        {editingClassId && (
          <button
            type="button"
            onClick={cancelEdit}
            style={{
              background: "#ffffff",
              color: "#1f3c88",
              border: "1px solid #1f3c88",
              borderRadius: "8px",
              padding: "12px 22px",
              marginTop: "25px",
              marginLeft: "12px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Cancel Edit
          </button>
        )}
      </form>

      <div
        style={{
          background: "#ffffff",
          padding: "30px",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}
      >
        <h2
          style={{
            color: "#1f3c88",
            marginTop: 0,
            marginBottom: "20px",
          }}
        >
          Existing Classes / Groups
        </h2>

        {loading ? (
          <p>Loading classes...</p>
        ) : classes.length === 0 ? (
          <p
            style={{
              color: "#333",
            }}
          >
            No classes found.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "26px",
            }}
          >
            {renderGroupedClassSection(
              "Cambridge Classes",
              cambridgeClasses,
              cambridgeLevelOrder,
              "No Cambridge classes created yet."
            )}

            {renderGroupedClassSection(
              "Young Learners",
              youngLearnerClasses,
              youngLearnerLevelOrder,
              "No Young Learner classes created yet."
            )}

            {renderGroupedClassSection(
              "Support Classes",
              supportClasses,
              ["Support Classes"],
              "No Support Classes have been created yet."
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
