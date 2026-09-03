import {
  findSchoolClosure,
  type SchoolClosureSummary,
} from "./schoolClosures";

export const FRIDAY_TUTORIAL_SESSION_TYPES = {
  KIDS_2_TO_JUNIOR_3: "kids2_junior3",
  JUNIOR_4_TEENS_1_B1: "junior4_teens_b1",
} as const;

export type FridayTutorialSessionType =
  (typeof FRIDAY_TUTORIAL_SESSION_TYPES)[keyof typeof FRIDAY_TUTORIAL_SESSION_TYPES];

export type FridayTutorialRotationSettings = {
  first_friday_date?: string | null;
  first_session_type?: string | null;
};

export type FridayTutorialRotationClosure = Pick<
  SchoolClosureSummary,
  "id" | "name" | "closure_type" | "start_date" | "end_date"
>;

export type FridayTutorialRotationEntry = {
  session_date: string;
  tutorial_group: FridayTutorialSessionType | null;
  tutorial_group_label: string;
  start_time: string;
  end_time: string;
  date: string;
  session_type: FridayTutorialSessionType | null;
  session_label: string;
  time: string;
  school_closed: boolean;
  closure: FridayTutorialRotationClosure | null;
};

export type OpenFridayTutorialRotationEntry = FridayTutorialRotationEntry & {
  tutorial_group: FridayTutorialSessionType;
  session_type: FridayTutorialSessionType;
  school_closed: false;
  closure: null;
};

const sessionLabels: Record<FridayTutorialSessionType, string> = {
  kids2_junior3: "Kids 2 - Junior 3",
  junior4_teens_b1: "Junior 4 - Teens + B1 Training",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ROTATION_WEEKS = 5200;

function getDateOnlyUtcTime(value: unknown) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;

  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const date = new Date(time);
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    return null;
  }
  return time;
}

export function addDaysToFridayTutorialDate(dateValue: string, days: number) {
  const time = getDateOnlyUtcTime(dateValue);
  if (time === null) return "";
  const date = new Date(time);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isFridayDate(dateValue: string) {
  const time = getDateOnlyUtcTime(dateValue);
  return time !== null && new Date(time).getUTCDay() === 5;
}

function getFirstSessionType(settings: FridayTutorialRotationSettings) {
  const value = String(settings?.first_session_type || "");
  return Object.prototype.hasOwnProperty.call(sessionLabels, value)
    ? (value as FridayTutorialSessionType)
    : null;
}

export function getNextFridayTutorialSessionType(
  sessionType: FridayTutorialSessionType
): FridayTutorialSessionType {
  return sessionType === FRIDAY_TUTORIAL_SESSION_TYPES.KIDS_2_TO_JUNIOR_3
    ? FRIDAY_TUTORIAL_SESSION_TYPES.JUNIOR_4_TEENS_1_B1
    : FRIDAY_TUTORIAL_SESSION_TYPES.KIDS_2_TO_JUNIOR_3;
}

export function getTutorialGroupLabel(group: string | null | undefined) {
  const sessionType = String(group || "") as FridayTutorialSessionType;
  return sessionLabels[sessionType] || group || "-";
}

export function isB1FridayTutorialSession(
  sessionType: string | null | undefined
) {
  return sessionType === FRIDAY_TUTORIAL_SESSION_TYPES.JUNIOR_4_TEENS_1_B1;
}

/**
 * The sole A/B rotation calculation. The session type is based on how many
 * eligible, open Friday dates occurred before the requested date. A closure
 * never consumes a rotation slot.
 */
export function getFridayTutorialSessionTypeForDate(
  settings: FridayTutorialRotationSettings,
  sessionDate: string,
  closures: readonly FridayTutorialRotationClosure[]
): FridayTutorialSessionType | null {
  const firstDate = String(settings?.first_friday_date || "");
  const firstDateTime = getDateOnlyUtcTime(firstDate);
  const sessionDateTime = getDateOnlyUtcTime(sessionDate);
  const firstSessionType = getFirstSessionType(settings);

  if (
    firstDateTime === null ||
    sessionDateTime === null ||
    !firstSessionType ||
    !isFridayDate(firstDate)
  ) {
    return null;
  }

  const differenceInDays = (sessionDateTime - firstDateTime) / DAY_MS;
  if (differenceInDays < 0 || differenceInDays % 7 !== 0) return null;
  if (findSchoolClosure(sessionDate, closures)) return null;

  const requestedWeek = differenceInDays / 7;
  let openFridayCount = 0;
  for (let week = 0; week < requestedWeek; week += 1) {
    const candidateDate = addDaysToFridayTutorialDate(firstDate, week * 7);
    if (!findSchoolClosure(candidateDate, closures)) openFridayCount += 1;
  }

  return openFridayCount % 2 === 0
    ? firstSessionType
    : getNextFridayTutorialSessionType(firstSessionType);
}

function rotationEntry(
  settings: FridayTutorialRotationSettings,
  sessionDate: string,
  closures: readonly FridayTutorialRotationClosure[]
): FridayTutorialRotationEntry {
  const closure = findSchoolClosure(sessionDate, closures);
  const sessionType = getFridayTutorialSessionTypeForDate(
    settings,
    sessionDate,
    closures
  );
  const label = sessionType ? getTutorialGroupLabel(sessionType) : "No Friday Tutorial";

  return {
    session_date: sessionDate,
    tutorial_group: sessionType,
    tutorial_group_label: label,
    start_time: "18:00",
    end_time: "19:00",
    date: sessionDate,
    session_type: sessionType,
    session_label: label,
    time: "18:00-19:00",
    school_closed: Boolean(closure),
    closure,
  };
}

export function calculateFridayTutorialCalendar(
  settings: FridayTutorialRotationSettings,
  calendarFridayCount: number,
  closures: readonly FridayTutorialRotationClosure[]
) {
  const firstDate = String(settings?.first_friday_date || "");
  if (
    calendarFridayCount <= 0 ||
    !isFridayDate(firstDate) ||
    !getFirstSessionType(settings)
  ) {
    return [];
  }

  return Array.from({ length: calendarFridayCount }, (_, index) =>
    rotationEntry(
      settings,
      addDaysToFridayTutorialDate(firstDate, index * 7),
      closures
    )
  );
}

export function calculateUpcomingFridayTutorials(
  settings: FridayTutorialRotationSettings,
  openFridayCount: number,
  closures: readonly FridayTutorialRotationClosure[]
) {
  const firstDate = String(settings?.first_friday_date || "");
  if (
    openFridayCount <= 0 ||
    !isFridayDate(firstDate) ||
    !getFirstSessionType(settings)
  ) {
    return [];
  }

  const entries: OpenFridayTutorialRotationEntry[] = [];
  for (
    let week = 0;
    week < MAX_ROTATION_WEEKS && entries.length < openFridayCount;
    week += 1
  ) {
    const entry = rotationEntry(
      settings,
      addDaysToFridayTutorialDate(firstDate, week * 7),
      closures
    );
    if (!entry.school_closed && entry.tutorial_group) {
      entries.push({
        ...entry,
        tutorial_group: entry.tutorial_group,
        session_type: entry.tutorial_group,
        school_closed: false,
        closure: null,
      });
    }
  }
  return entries;
}

export type FridayTutorialExistingSession = {
  id: string;
  session_date: string;
  tutorial_group: string;
};

export type FridayTutorialReconciliationAction =
  | { action: "delete"; id: string; session_date: string }
  | {
      action: "update";
      id: string;
      session_date: string;
      tutorial_group: FridayTutorialSessionType;
    };

export type FridayTutorialDutyRecord = {
  id: string;
  session_date: string;
  active?: boolean | null;
  [key: string]: unknown;
};

export type EffectiveFridayTutorialDuty<T extends FridayTutorialDutyRecord> = T & {
  original_session_date: string;
  effective_session_date: string;
  deferred_by_school_closure: boolean;
};

/**
 * Duty rows retain their originally planned date. This derives the effective
 * open Friday without rewriting the source row, so removing a future closure
 * restores the original duty sequence automatically.
 */
export function assignEffectiveFridayTutorialDutyDates<
  T extends FridayTutorialDutyRecord,
>(
  settings: FridayTutorialRotationSettings,
  closures: readonly FridayTutorialRotationClosure[],
  duties: readonly T[]
) {
  const occupiedDates = new Set<string>();
  const ordered = [...duties].sort((first, second) =>
    first.session_date.localeCompare(second.session_date)
  );

  return ordered.map((duty): EffectiveFridayTutorialDuty<T> => {
    const firstDate = String(settings.first_friday_date || "");
    if (duty.active === false || !firstDate || duty.session_date < firstDate) {
      return {
        ...duty,
        original_session_date: duty.session_date,
        effective_session_date: duty.session_date,
        deferred_by_school_closure: false,
      };
    }

    let effectiveDate = duty.session_date;
    let attempts = 0;
    while (
      attempts < MAX_ROTATION_WEEKS &&
      (!getFridayTutorialSessionTypeForDate(settings, effectiveDate, closures) ||
        occupiedDates.has(effectiveDate))
    ) {
      effectiveDate = addDaysToFridayTutorialDate(effectiveDate, 7);
      attempts += 1;
    }
    occupiedDates.add(effectiveDate);

    return {
      ...duty,
      original_session_date: duty.session_date,
      effective_session_date: effectiveDate,
      deferred_by_school_closure: effectiveDate !== duty.session_date,
    };
  });
}

export function buildFridayTutorialReconciliationPlan(
  settings: FridayTutorialRotationSettings,
  closures: readonly FridayTutorialRotationClosure[],
  sessions: readonly FridayTutorialExistingSession[],
  completedSessionIds: ReadonlySet<string>,
  todayMadrid: string
) {
  const actions: FridayTutorialReconciliationAction[] = [];
  const preservedSessionIds: string[] = [];

  for (const session of sessions) {
    if (
      session.session_date < todayMadrid ||
      completedSessionIds.has(session.id)
    ) {
      preservedSessionIds.push(session.id);
      continue;
    }

    const expectedGroup = getFridayTutorialSessionTypeForDate(
      settings,
      session.session_date,
      closures
    );
    if (!expectedGroup) {
      actions.push({
        action: "delete",
        id: session.id,
        session_date: session.session_date,
      });
    } else if (session.tutorial_group !== expectedGroup) {
      actions.push({
        action: "update",
        id: session.id,
        session_date: session.session_date,
        tutorial_group: expectedGroup,
      });
    }
  }

  return { actions, preservedSessionIds };
}
