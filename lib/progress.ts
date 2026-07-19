import { supabase } from "./supabase";
import { getMadridDateString, normalizeHomeworkSkill } from "./homework";
import {
  getEmptyFridayTutorialProgressSummary,
  type FridayTutorialProgressSummary,
} from "./fridayTutorialResults";

export { getEmptyFridayTutorialProgressSummary };

export async function getStudentResults(studentId: string) {
  const { data, error } = await supabase
    .from("results")
    .select("*")
    .eq("student_id", studentId);

  if (error) throw error;

  return (data || []).filter(
    (result) =>
      result.result_type !== "mock" ||
      (result.published_at !== null && result.published_at !== undefined)
  );
}

export async function getStudentFridayTutorialProgress(): Promise<FridayTutorialProgressSummary> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("No user logged in.");
  }

  const response = await fetch("/api/friday-tutorial-progress", {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload?.error || "Unable to load Friday tutorial progress."
    );
  }

  return (
    (payload.summary as FridayTutorialProgressSummary | undefined) ||
    getEmptyFridayTutorialProgressSummary()
  );
}

export function toResultNumber(value: any) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

export function getResultWeekNumber(result: any) {
  const storedWeek = Number(result?.week_number);

  if (Number.isFinite(storedWeek) && storedWeek > 0) {
    return storedWeek;
  }

  const match = /week\s+(\d+)/i.exec(String(result?.title || ""));

  return match ? Number(match[1]) : null;
}

export function getHomeworkWeekNumber(homework: any) {
  const week = Number(homework?.week_number);

  return Number.isFinite(week) && week > 0 ? week : null;
}

export function getHomeworkResultKey(
  weekNumber: number | string | null | undefined,
  skill: unknown
) {
  const week = Number(weekNumber);
  const normalisedSkill = normalizeHomeworkSkill(skill);

  if (!Number.isFinite(week) || week < 1 || !normalisedSkill) {
    return "";
  }

  return `${week}:${normalisedSkill}`;
}

function getResultUpdatedTime(result: any) {
  const dateValue = result?.updated_at || result?.created_at || "";
  const timestamp = Date.parse(dateValue);

  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function buildHomeworkResultMap(results: any[], releasedHomework: any[]) {
  const releasedKeys = new Set(
    releasedHomework
      .map((homework) =>
        getHomeworkResultKey(
          getHomeworkWeekNumber(homework),
          homework.homework_skill
        )
      )
      .filter(Boolean)
  );

  const sortedResults = [...results]
    .filter((result) => {
      if (result?.result_type !== "homework") return false;
      if (toResultNumber(result?.percentage) === null) return false;

      const key = getHomeworkResultKey(
        getResultWeekNumber(result),
        result?.skill
      );

      return releasedKeys.has(key);
    })
    .sort((a, b) => {
      const timeDifference = getResultUpdatedTime(b) - getResultUpdatedTime(a);

      if (timeDifference !== 0) return timeDifference;

      return String(b?.id || "").localeCompare(String(a?.id || ""));
    });

  const resultMap = new Map<string, any>();

  sortedResults.forEach((result) => {
    const key = getHomeworkResultKey(
      getResultWeekNumber(result),
      result?.skill
    );

    if (key && !resultMap.has(key)) {
      resultMap.set(key, result);
    }
  });

  return resultMap;
}

function getMetadataCreatedTime(item: any) {
  const dateValue = item?.created_at || item?.updated_at || "";
  const timestamp = Date.parse(dateValue);

  return Number.isFinite(timestamp) ? timestamp : null;
}

function getResultCreatedTime(result: any) {
  const timestamp = Date.parse(result?.created_at || "");

  return Number.isFinite(timestamp) ? timestamp : null;
}

function isActiveHomeworkMetadata(item: any) {
  return item?.active !== false;
}

function buildHomeworkMetadataMap(homeworkMetadata: any[]) {
  const metadataMap = new Map<string, any[]>();

  homeworkMetadata.forEach((item) => {
    const key = getHomeworkResultKey(
      getHomeworkWeekNumber(item),
      item?.homework_skill
    );

    if (!key) return;

    metadataMap.set(key, [...(metadataMap.get(key) || []), item]);
  });

  return metadataMap;
}

function resultClearlyPredatesFutureMetadata(result: any, futureMetadata: any[]) {
  const resultCreatedTime = getResultCreatedTime(result);

  if (resultCreatedTime === null) {
    return false;
  }

  const metadataCreatedTimes = futureMetadata
    .map(getMetadataCreatedTime)
    .filter((value): value is number => value !== null);

  if (metadataCreatedTimes.length === 0) {
    return false;
  }

  return resultCreatedTime < Math.min(...metadataCreatedTimes);
}

function isBlockedByFutureHomeworkMetadata(
  result: any,
  matchingMetadata: any[],
  todayMadrid: string
) {
  const activeMetadata = matchingMetadata.filter(isActiveHomeworkMetadata);

  if (activeMetadata.length === 0) {
    return false;
  }

  const futureMetadata = activeMetadata.filter(
    (item) => item?.release_date && item.release_date > todayMadrid
  );

  if (futureMetadata.length === 0) {
    return false;
  }

  if (resultClearlyPredatesFutureMetadata(result, futureMetadata)) {
    return false;
  }

  const hasFutureMetadataTimestamps = futureMetadata.some(
    (item) => getMetadataCreatedTime(item) !== null
  );

  if (hasFutureMetadataTimestamps) {
    return true;
  }

  const hasReleasedMetadata = activeMetadata.some(
    (item) => !item?.release_date || item.release_date <= todayMadrid
  );

  return !hasReleasedMetadata;
}

export function buildProgressHomeworkResultMap(
  results: any[],
  homeworkMetadata: any[],
  todayMadrid = getMadridDateString()
) {
  const metadataMap = buildHomeworkMetadataMap(homeworkMetadata);
  const sortedResults = [...results]
    .filter((result) => {
      if (result?.result_type !== "homework") return false;
      if (toResultNumber(result?.percentage) === null) return false;

      const key = getHomeworkResultKey(
        getResultWeekNumber(result),
        result?.skill
      );

      if (!key) return false;

      const matchingMetadata = metadataMap.get(key) || [];

      if (matchingMetadata.length === 0) {
        return true;
      }

      return !isBlockedByFutureHomeworkMetadata(
        result,
        matchingMetadata,
        todayMadrid
      );
    })
    .sort((a, b) => {
      const timeDifference = getResultUpdatedTime(b) - getResultUpdatedTime(a);

      if (timeDifference !== 0) return timeDifference;

      return String(b?.id || "").localeCompare(String(a?.id || ""));
    });

  const resultMap = new Map<string, any>();

  sortedResults.forEach((result) => {
    const key = getHomeworkResultKey(
      getResultWeekNumber(result),
      result?.skill
    );

    if (key && !resultMap.has(key)) {
      resultMap.set(key, result);
    }
  });

  return resultMap;
}

export function getEligibleProgressHomeworkResults(
  results: any[],
  homeworkMetadata: any[],
  todayMadrid = getMadridDateString()
) {
  return Array.from(
    buildProgressHomeworkResultMap(
      results,
      homeworkMetadata,
      todayMadrid
    ).values()
  );
}

export function getEligibleHomeworkResults(
  results: any[],
  releasedHomework: any[]
) {
  return Array.from(buildHomeworkResultMap(results, releasedHomework).values());
}
