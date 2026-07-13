"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";

import TeacherLayout from "../../components/layout/TeacherLayout";
import { supabase } from "../../../lib/supabase";
import { getTeacherClasses } from "../../../lib/teacher";
import {
  createTeacherPersonalReminder,
  deleteTeacherPersonalReminder,
  getTeacherCalendarEventsForRange,
  setTeacherPersonalReminderCompleted,
  updateTeacherPersonalReminder,
} from "../../../lib/teacherCalendar";
import type { TeacherCalendarEvent } from "../../../lib/teacherCalendar";
import styles from "./TeacherCalendar.module.css";

const weekDays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

type WeekDay = {
  date: Date;
  dateKey: string;
  weekday: string;
};

type CalendarClass = any & {
  level_name?: string;
};

type ReminderForm = {
  title: string;
  event_date: string;
  start_time: string;
  end_time: string;
  description: string;
};

type ReminderPayload = {
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  description: string | null;
};

type ReminderValidationResult =
  | {
      ok: false;
      error: string;
    }
  | {
      ok: true;
      payload: ReminderPayload;
    };

type CalendarItem =
  | {
      type: "class";
      id: string;
      dateKey: string;
      start_time: string | null;
      end_time: string | null;
      classData: CalendarClass;
    }
  | {
      type: "event";
      id: string;
      dateKey: string;
      start_time: string | null;
      end_time: string | null;
      event: TeacherCalendarEvent;
    };

const emptyReminderForm: ReminderForm = {
  title: "",
  event_date: "",
  start_time: "",
  end_time: "",
  description: "",
};

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function isValidDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;

  const date = parseDateKey(dateKey);

  return toDateKey(date) === dateKey;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);

  return next;
}

function getWeekStart(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);

  return start;
}

function getWeekDates(weekStartKey: string): WeekDay[] {
  const weekStart = parseDateKey(weekStartKey);

  return weekDays.map((weekday, index) => {
    const date = addDays(weekStart, index);

    return {
      date,
      dateKey: toDateKey(date),
      weekday,
    };
  });
}

function formatWeekHeading(days: WeekDay[]) {
  const first = days[0]?.date;
  const last = days[days.length - 1]?.date;

  if (!first || !last) return "";

  const firstMonth = first.toLocaleDateString("en-GB", { month: "long" });
  const lastMonth = last.toLocaleDateString("en-GB", { month: "long" });
  const firstYear = first.getFullYear();
  const lastYear = last.getFullYear();

  if (firstMonth === lastMonth && firstYear === lastYear) {
    return `${first.getDate()}–${last.getDate()} ${lastMonth} ${lastYear}`;
  }

  if (firstYear === lastYear) {
    return `${first.getDate()} ${firstMonth}–${last.getDate()} ${lastMonth} ${lastYear}`;
  }

  return `${first.getDate()} ${firstMonth} ${firstYear}–${last.getDate()} ${lastMonth} ${lastYear}`;
}

function formatDayDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function formatTimeValue(time: string | null | undefined) {
  if (!time) return "";

  return time.slice(0, 5);
}

function formatTimeRange(
  startTime: string | null | undefined,
  endTime: string | null | undefined
) {
  const start = formatTimeValue(startTime);
  const end = formatTimeValue(endTime);

  if (!start) return "All day";
  if (!end) return start;

  return `${start}–${end}`;
}

function sortTimeValue(time: string | null | undefined) {
  return time ? time.slice(0, 5) : "00:00";
}

function parseClassDays(days: string | null | undefined) {
  const value = String(days || "");

  return weekDays.filter((weekday) =>
    new RegExp(`\\b${weekday}\\b`, "i").test(value)
  );
}

function isOnlineClass(classData: CalendarClass) {
  return String(classData.course_type ?? "").trim().toLowerCase() === "online";
}

function formatCourseType(courseType: string | null | undefined) {
  const value = String(courseType || "").trim();

  if (!value) return "Course";

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getClassLevelName(classData: CalendarClass) {
  return (
    classData.level_name ||
    classData.levels?.name ||
    classData.class_name ||
    "Class"
  );
}

function getClassroomName(classData: CalendarClass) {
  if (isOnlineClass(classData)) return "Online";

  return classData.classrooms?.name || "Classroom not assigned";
}

function getEventLabel(event: TeacherCalendarEvent) {
  if (event.audience === "all_teachers") return "School Event";
  if (event.audience === "personal") return "Personal Reminder";

  return "Calendar Event";
}

function getEventBadgeClass(event: TeacherCalendarEvent) {
  if (event.audience === "all_teachers") return styles.schoolBadge;
  if (event.audience === "personal") return styles.personalBadge;

  return styles.neutralBadge;
}

function getEventCardClass(event: TeacherCalendarEvent) {
  const cardStyles = [styles.card, styles.eventCard];

  if (event.audience === "all_teachers") {
    cardStyles.push(styles.schoolEventCard);
  } else if (event.audience === "personal") {
    cardStyles.push(styles.personalCard);
  } else {
    cardStyles.push(styles.calendarEventCard);
  }

  if (event.audience === "personal" && event.completed) {
    cardStyles.push(styles.completed);
  }

  return cardStyles.join(" ");
}

export default function TeacherCalendarPage() {
  const router = useRouter();
  const [teacherId, setTeacherId] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [classes, setClasses] = useState<CalendarClass[]>([]);
  const [events, setEvents] = useState<TeacherCalendarEvent[]>([]);
  const [classLoading, setClassLoading] = useState(false);
  const [eventLoading, setEventLoading] = useState(false);
  const [classError, setClassError] = useState("");
  const [eventError, setEventError] = useState("");
  const [weekStartKey, setWeekStartKey] = useState(() =>
    toDateKey(getWeekStart(new Date()))
  );
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    toDateKey(new Date())
  );
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] =
    useState<TeacherCalendarEvent | null>(null);
  const [reminderForm, setReminderForm] =
    useState<ReminderForm>(emptyReminderForm);
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderError, setReminderError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [activeActionId, setActiveActionId] = useState("");

  useEffect(() => {
    let active = true;

    async function verifyTeacher() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      if (!session) {
        router.replace("/login");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (!active) return;

      if (error || profile?.role !== "teacher") {
        router.replace("/login");
        return;
      }

      setTeacherId(session.user.id);
      setAuthChecked(true);
    }

    verifyTeacher();

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!teacherId) return;

    let active = true;

    async function loadClasses() {
      setClassLoading(true);
      setClassError("");

      try {
        const teacherClasses = await getTeacherClasses(teacherId);
        const levelIds = Array.from(
          new Map(
            teacherClasses
              .map((item) => item.level_id)
              .filter((levelId) => levelId !== null && levelId !== undefined)
              .map((levelId) => [String(levelId), levelId])
          ).values()
        );

        let levelNameById = new Map<string, string>();

        if (levelIds.length > 0) {
          const { data: levels, error: levelsError } = await supabase
            .from("levels")
            .select("id, name")
            .in("id", levelIds);

          if (levelsError) {
            console.error("Unable to load teacher calendar levels:", levelsError);
          } else {
            levelNameById = new Map(
              (levels || []).map((level) => [String(level.id), level.name])
            );
          }
        }

        if (!active) return;

        setClasses(
          teacherClasses.map((item) => ({
            ...item,
            level_name:
              levelNameById.get(String(item.level_id)) || item.class_name,
          }))
        );
      } catch (error) {
        console.error("Unable to load teacher calendar classes:", error);

        if (active) {
          setClasses([]);
          setClassError("Unable to load your scheduled classes.");
        }
      } finally {
        if (active) setClassLoading(false);
      }
    }

    loadClasses();

    return () => {
      active = false;
    };
  }, [teacherId]);

  useEffect(() => {
    if (!teacherId) return;

    let active = true;

    async function loadEvents() {
      setEventLoading(true);
      setEventError("");

      const weekStart = parseDateKey(weekStartKey);
      const rangeEnd = toDateKey(addDays(weekStart, 5));

      try {
        const data = await getTeacherCalendarEventsForRange(
          weekStartKey,
          rangeEnd
        );

        if (active) setEvents(data);
      } catch (error) {
        console.error("Unable to load teacher calendar events:", error);

        if (active) {
          setEvents([]);
          setEventError("Unable to load calendar events.");
        }
      } finally {
        if (active) setEventLoading(false);
      }
    }

    loadEvents();

    return () => {
      active = false;
    };
  }, [teacherId, weekStartKey]);

  useEffect(() => {
    const todayKey = toDateKey(new Date());
    const weekStart = parseDateKey(weekStartKey);
    const weekEndKey = toDateKey(addDays(weekStart, 5));

    if (todayKey >= weekStartKey && todayKey <= weekEndKey) {
      setSelectedDateKey(todayKey);
    } else {
      setSelectedDateKey(weekStartKey);
    }
  }, [weekStartKey]);

  const weekDates = useMemo(() => getWeekDates(weekStartKey), [weekStartKey]);

  const classOccurrences = useMemo<CalendarItem[]>(() => {
    return classes.flatMap((classData) => {
      const classDays = parseClassDays(classData.days);

      return weekDates
        .filter((day) => classDays.includes(day.weekday))
        .map((day) => ({
          type: "class" as const,
          id: `${classData.id}-${day.dateKey}`,
          dateKey: day.dateKey,
          start_time: classData.start_time || null,
          end_time: classData.end_time || null,
          classData,
        }));
    });
  }, [classes, weekDates]);

  const eventItems = useMemo<CalendarItem[]>(() => {
    return events.map((event) => ({
      type: "event" as const,
      id: event.id,
      dateKey: event.event_date,
      start_time: event.start_time,
      end_time: event.end_time,
      event,
    }));
  }, [events]);

  const itemsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarItem[]>();

    [...classOccurrences, ...eventItems].forEach((item) => {
      const current = grouped.get(item.dateKey) || [];
      current.push(item);
      grouped.set(item.dateKey, current);
    });

    grouped.forEach((items, dateKey) => {
      grouped.set(
        dateKey,
        [...items].sort((first, second) =>
          sortTimeValue(first.start_time).localeCompare(
            sortTimeValue(second.start_time)
          )
        )
      );
    });

    return grouped;
  }, [classOccurrences, eventItems]);

  const visibleDays = useMemo(() => {
    const saturday = weekDates[5];
    const saturdayHasItems = Boolean(
      saturday && (itemsByDate.get(saturday.dateKey) || []).length > 0
    );

    return saturdayHasItems ? weekDates : weekDates.slice(0, 5);
  }, [itemsByDate, weekDates]);

  useEffect(() => {
    if (
      visibleDays.length > 0 &&
      !visibleDays.some((day) => day.dateKey === selectedDateKey)
    ) {
      setSelectedDateKey(visibleDays[0].dateKey);
    }
  }, [selectedDateKey, visibleDays]);

  useEffect(() => {
    if (!reminderModalOpen) return;

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !reminderSaving) {
        closeReminderModal();
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [reminderModalOpen, reminderSaving]);

  function moveWeek(amount: number) {
    const currentStart = parseDateKey(weekStartKey);
    setWeekStartKey(toDateKey(addDays(currentStart, amount * 7)));
  }

  function goToToday() {
    setWeekStartKey(toDateKey(getWeekStart(new Date())));
  }

  function getDefaultReminderDate() {
    const selectedVisible = visibleDays.some(
      (day) => day.dateKey === selectedDateKey
    );

    return selectedVisible ? selectedDateKey : weekStartKey;
  }

  function updateReminderForm(field: keyof ReminderForm, value: string) {
    setReminderForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetReminderForm() {
    setReminderForm(emptyReminderForm);
    setEditingReminder(null);
    setReminderError("");
  }

  function openAddReminder() {
    setActionError("");
    setActionMessage("");
    setEditingReminder(null);
    setReminderError("");
    setReminderForm({
      ...emptyReminderForm,
      event_date: getDefaultReminderDate(),
    });
    setReminderModalOpen(true);
  }

  function openEditReminder(event: TeacherCalendarEvent) {
    if (!canManagePersonalReminder(event)) return;

    setActionError("");
    setActionMessage("");
    setEditingReminder(event);
    setReminderError("");
    setReminderForm({
      title: event.title || "",
      event_date: event.event_date || "",
      start_time: formatTimeValue(event.start_time),
      end_time: formatTimeValue(event.end_time),
      description: event.description || "",
    });
    setReminderModalOpen(true);
  }

  function closeReminderModal() {
    if (reminderSaving) return;

    setReminderModalOpen(false);
    resetReminderForm();
  }

  function validateReminderForm(): ReminderValidationResult {
    const title = reminderForm.title.trim();
    const eventDate = reminderForm.event_date.trim();
    const startTime = reminderForm.start_time.trim();
    const endTime = reminderForm.end_time.trim();
    const description = reminderForm.description.trim();

    if (!title) {
      return {
        ok: false,
        error: "Please enter a reminder title.",
      };
    }

    if (!isValidDateKey(eventDate)) {
      return {
        ok: false,
        error: "Please choose a valid reminder date.",
      };
    }

    if (endTime && !startTime) {
      return {
        ok: false,
        error: "Please add a start time before adding an end time.",
      };
    }

    if (startTime && endTime && endTime <= startTime) {
      return {
        ok: false,
        error: "End time must be later than start time.",
      };
    }

    return {
      ok: true,
      payload: {
        title,
        event_date: eventDate,
        start_time: startTime || null,
        end_time: startTime ? endTime || null : null,
        description: description || null,
      },
    };
  }

  function isEventInLoadedRange(event: TeacherCalendarEvent) {
    const rangeEnd = toDateKey(addDays(parseDateKey(weekStartKey), 5));

    return event.event_date >= weekStartKey && event.event_date <= rangeEnd;
  }

  function upsertVisibleEvent(event: TeacherCalendarEvent) {
    setEvents((current) => {
      const withoutEvent = current.filter((item) => item.id !== event.id);

      if (!isEventInLoadedRange(event)) {
        return withoutEvent;
      }

      return [...withoutEvent, event];
    });
  }

  async function handleReminderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReminderError("");
    setActionError("");
    setActionMessage("");

    const validation = validateReminderForm();

    if (!validation.ok) {
      setReminderError(validation.error);
      return;
    }

    setReminderSaving(true);

    try {
      const savedReminder = editingReminder
        ? await updateTeacherPersonalReminder(
            editingReminder.id,
            validation.payload
          )
        : await createTeacherPersonalReminder(validation.payload);

      upsertVisibleEvent(savedReminder);
      setReminderModalOpen(false);
      resetReminderForm();
      setActionMessage(
        editingReminder
          ? "Reminder updated successfully."
          : "Reminder added successfully."
      );
    } catch (error: any) {
      console.error("Unable to save reminder:", error);
      setReminderError(error.message || "Unable to save reminder.");
    } finally {
      setReminderSaving(false);
    }
  }

  async function handleToggleCompleted(event: TeacherCalendarEvent) {
    if (!canManagePersonalReminder(event)) return;

    setActionError("");
    setActionMessage("");
    setActiveActionId(event.id);

    try {
      const updatedReminder = await setTeacherPersonalReminderCompleted(
        event.id,
        !event.completed
      );
      upsertVisibleEvent(updatedReminder);
      setActionMessage(
        updatedReminder.completed
          ? "Reminder marked complete."
          : "Reminder marked incomplete."
      );
    } catch (error: any) {
      console.error("Unable to update reminder status:", error);
      setActionError(error.message || "Unable to update reminder status.");
    } finally {
      setActiveActionId("");
    }
  }

  async function handleDeleteReminder(event: TeacherCalendarEvent) {
    if (!canManagePersonalReminder(event)) return;

    const confirmed = window.confirm(
      "Delete this reminder? This cannot be undone."
    );

    if (!confirmed) return;

    setActionError("");
    setActionMessage("");
    setActiveActionId(event.id);

    try {
      await deleteTeacherPersonalReminder(event.id);
      setEvents((current) => current.filter((item) => item.id !== event.id));
      setActionMessage("Reminder deleted successfully.");
    } catch (error: any) {
      console.error("Unable to delete reminder:", error);
      setActionError(error.message || "Unable to delete reminder.");
    } finally {
      setActiveActionId("");
    }
  }

  function canManagePersonalReminder(event: TeacherCalendarEvent) {
    return (
      event.audience === "personal" &&
      event.teacher_id === teacherId &&
      event.created_by === teacherId
    );
  }

  function openClass(classId: string) {
    router.push(`/teacher/class?id=${encodeURIComponent(classId)}`);
  }

  function handleClassKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    classId: string
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openClass(classId);
    }
  }

  function renderClassCard(item: Extract<CalendarItem, { type: "class" }>) {
    const classData = item.classData;
    const online = isOnlineClass(classData);
    const meetLink = String(classData.meet_link || "").trim();

    return (
      <div
        key={item.id}
        className={`${styles.card} ${styles.classCard}`}
        role="link"
        tabIndex={0}
        onClick={() => openClass(String(classData.id))}
        onKeyDown={(event) => handleClassKeyDown(event, String(classData.id))}
      >
        <div className={styles.cardTop}>
          <span className={`${styles.badge} ${styles.classBadge}`}>Class</span>
          <span className={styles.time}>
            {formatTimeRange(item.start_time, item.end_time)}
          </span>
        </div>

        <h3 className={styles.cardTitle}>{getClassLevelName(classData)}</h3>

        <div className={styles.cardMeta}>
          <span>{getClassroomName(classData)}</span>
          <span>{formatCourseType(classData.course_type)}</span>
        </div>

        {online && meetLink && (
          <a
            className={styles.meetLink}
            href={meetLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            Join Google Meet
          </a>
        )}
      </div>
    );
  }

  function renderEventCard(item: Extract<CalendarItem, { type: "event" }>) {
    const event = item.event;
    const personalCompleted =
      event.audience === "personal" && Boolean(event.completed);
    const canManage = canManagePersonalReminder(event);
    const actionInProgress = activeActionId === event.id;

    return (
      <div key={item.id} className={getEventCardClass(event)}>
        <div className={styles.cardTop}>
          <span className={`${styles.badge} ${getEventBadgeClass(event)}`}>
            {getEventLabel(event)}
          </span>
          <span className={styles.time}>
            {formatTimeRange(event.start_time, event.end_time)}
          </span>
        </div>

        <h3 className={styles.cardTitle}>{event.title || "Untitled event"}</h3>

        {event.description && (
          <p className={styles.description}>{event.description}</p>
        )}

        {personalCompleted && (
          <span className={styles.completedLabel}>Completed</span>
        )}

        {canManage && (
          <div className={styles.cardActions}>
            <button
              type="button"
              className={styles.textAction}
              disabled={actionInProgress}
              onClick={() => openEditReminder(event)}
            >
              Edit
            </button>
            <button
              type="button"
              className={styles.textAction}
              disabled={actionInProgress}
              onClick={() => handleToggleCompleted(event)}
            >
              {event.completed ? "Mark incomplete" : "Mark complete"}
            </button>
            <button
              type="button"
              className={`${styles.textAction} ${styles.deleteAction}`}
              disabled={actionInProgress}
              onClick={() => handleDeleteReminder(event)}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderItem(item: CalendarItem) {
    if (item.type === "class") return renderClassCard(item);

    return renderEventCard(item);
  }

  function renderItemsForDay(day: WeekDay) {
    const items = itemsByDate.get(day.dateKey) || [];

    if (items.length === 0) {
      return <p className={styles.emptyState}>No classes or events scheduled.</p>;
    }

    return items.map(renderItem);
  }

  const selectedDay =
    visibleDays.find((day) => day.dateKey === selectedDateKey) ||
    visibleDays[0];

  return (
    <TeacherLayout>
      <section className={styles.page}>
        <section className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Teacher Calendar</p>
            <h1 className={styles.title}>{formatWeekHeading(visibleDays)}</h1>
            <p className={styles.subtitle}>
              Weekly view of your scheduled classes and visible calendar events.
            </p>
          </div>

          <div className={styles.controls} aria-label="Calendar week controls">
            <button
              type="button"
              className={styles.controlButton}
              onClick={() => moveWeek(-1)}
            >
              Previous Week
            </button>
            <button
              type="button"
              className={`${styles.controlButton} ${styles.todayButton}`}
              onClick={goToToday}
            >
              Today
            </button>
            <button
              type="button"
              className={styles.controlButton}
              onClick={() => moveWeek(1)}
            >
              Next Week
            </button>
            <button
              type="button"
              className={`${styles.controlButton} ${styles.addButton}`}
              onClick={openAddReminder}
            >
              Add Reminder
            </button>
          </div>
        </section>

        {(classLoading ||
          eventLoading ||
          classError ||
          eventError ||
          actionMessage ||
          actionError) && (
          <section className={styles.statusPanel}>
            {classLoading && <p>Loading scheduled classes...</p>}
            {eventLoading && <p>Loading calendar events...</p>}
            {classError && <p className={styles.errorText}>{classError}</p>}
            {eventError && <p className={styles.errorText}>{eventError}</p>}
            {actionMessage && (
              <p className={styles.successText}>{actionMessage}</p>
            )}
            {actionError && <p className={styles.errorText}>{actionError}</p>}
          </section>
        )}

        {!authChecked ? (
          <section className={styles.statusPanel}>
            <p>Checking teacher access...</p>
          </section>
        ) : (
          <>
            <section
              className={styles.desktopWeek}
              style={{
                gridTemplateColumns: `repeat(${visibleDays.length}, minmax(0, 1fr))`,
              }}
            >
              {visibleDays.map((day) => (
                <article key={day.dateKey} className={styles.dayColumn}>
                  <header className={styles.dayHeader}>
                    <span className={styles.weekday}>{day.weekday}</span>
                    <span className={styles.date}>{formatDayDate(day.date)}</span>
                  </header>
                  <div className={styles.itemList}>{renderItemsForDay(day)}</div>
                </article>
              ))}
            </section>

            <section className={styles.mobilePlanner}>
              <div className={styles.daySelector} aria-label="Select day">
                {visibleDays.map((day) => (
                  <button
                    key={day.dateKey}
                    type="button"
                    className={
                      day.dateKey === selectedDateKey
                        ? `${styles.dayButton} ${styles.dayButtonActive}`
                        : styles.dayButton
                    }
                    onClick={() => setSelectedDateKey(day.dateKey)}
                  >
                    <span>{day.weekday.slice(0, 3)}</span>
                    <strong>{day.date.getDate()}</strong>
                  </button>
                ))}
              </div>

              {selectedDay && (
                <article className={styles.mobileDayPanel}>
                  <header className={styles.dayHeader}>
                    <span className={styles.weekday}>{selectedDay.weekday}</span>
                    <span className={styles.date}>
                      {formatDayDate(selectedDay.date)}
                    </span>
                  </header>
                  <div className={styles.itemList}>
                    {renderItemsForDay(selectedDay)}
                  </div>
                </article>
              )}
            </section>
          </>
        )}

        {reminderModalOpen && (
          <div className={styles.modalOverlay} onClick={closeReminderModal}>
            <div
              className={styles.modal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="reminder-modal-title"
              onClick={(event) => event.stopPropagation()}
            >
              <form onSubmit={handleReminderSubmit} className={styles.form}>
                <div className={styles.modalHeader}>
                  <div>
                    <p className={styles.eyebrow}>Personal Reminder</p>
                    <h2 id="reminder-modal-title" className={styles.modalTitle}>
                      {editingReminder ? "Edit Reminder" : "Add Reminder"}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className={styles.closeButton}
                    onClick={closeReminderModal}
                    disabled={reminderSaving}
                    aria-label="Close reminder form"
                  >
                    ×
                  </button>
                </div>

                {reminderError && (
                  <p className={styles.formError}>{reminderError}</p>
                )}

                <label className={styles.field}>
                  <span>Title</span>
                  <input
                    required
                    value={reminderForm.title}
                    onChange={(event) =>
                      updateReminderForm("title", event.target.value)
                    }
                    placeholder="Reminder title"
                  />
                </label>

                <label className={styles.field}>
                  <span>Date</span>
                  <input
                    required
                    type="date"
                    value={reminderForm.event_date}
                    onChange={(event) =>
                      updateReminderForm("event_date", event.target.value)
                    }
                  />
                </label>

                <div className={styles.timeFields}>
                  <label className={styles.field}>
                    <span>Start time</span>
                    <input
                      type="time"
                      value={reminderForm.start_time}
                      onChange={(event) =>
                        updateReminderForm("start_time", event.target.value)
                      }
                    />
                  </label>

                  <label className={styles.field}>
                    <span>End time</span>
                    <input
                      type="time"
                      value={reminderForm.end_time}
                      onChange={(event) =>
                        updateReminderForm("end_time", event.target.value)
                      }
                    />
                  </label>
                </div>

                <label className={styles.field}>
                  <span>Notes</span>
                  <textarea
                    value={reminderForm.description}
                    onChange={(event) =>
                      updateReminderForm("description", event.target.value)
                    }
                    placeholder="Optional notes"
                  />
                </label>

                <div className={styles.formActions}>
                  <button
                    type="button"
                    className={styles.cancelButton}
                    onClick={closeReminderModal}
                    disabled={reminderSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.saveButton}
                    disabled={reminderSaving}
                  >
                    {reminderSaving ? "Saving..." : "Save Reminder"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>
    </TeacherLayout>
  );
}
