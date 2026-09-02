import "server-only";

import {
  SCHOOL_CLOSURE_TYPES,
  type SchoolClosure,
  type SchoolClosureSummary,
  type SchoolClosureType,
  findSchoolClosure,
} from "./schoolClosures";
import { supabaseAdmin } from "./supabaseAdmin";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class SchoolClosureError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "SchoolClosureError";
  }
}

export type SchoolClosureInput = {
  name: string;
  closure_type: SchoolClosureType;
  start_date: string;
  end_date: string;
  notes: string | null;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function parseSchoolClosureInput(value: unknown): SchoolClosureInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SchoolClosureError("Invalid School Closure details.", 400);
  }

  const record = value as Record<string, unknown>;
  const allowed = new Set([
    "name",
    "closure_type",
    "start_date",
    "end_date",
    "notes",
  ]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new SchoolClosureError(
      "The request contains unsupported School Closure fields.",
      400
    );
  }

  const name = text(record.name);
  const closureType = text(record.closure_type) as SchoolClosureType;
  const startDate = text(record.start_date);
  const endDate = text(record.end_date);
  const notes = text(record.notes);

  if (!name) {
    throw new SchoolClosureError("Add a name for the School Closure.", 422);
  }
  if (name.length > 160) {
    throw new SchoolClosureError(
      "School Closure names must be 160 characters or fewer.",
      422
    );
  }
  if (!SCHOOL_CLOSURE_TYPES.includes(closureType)) {
    throw new SchoolClosureError("Choose a valid closure type.", 422);
  }
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    throw new SchoolClosureError("Choose valid start and end dates.", 422);
  }
  if (endDate < startDate) {
    throw new SchoolClosureError(
      "The end date must be on or after the start date.",
      422
    );
  }
  if (notes.length > 2000) {
    throw new SchoolClosureError(
      "School Closure notes must be 2,000 characters or fewer.",
      422
    );
  }

  return {
    name,
    closure_type: closureType,
    start_date: startDate,
    end_date: endDate,
    notes: notes || null,
  };
}

export async function loadSchoolClosures(options: {
  startDate?: string;
  endDate?: string;
  ascending?: boolean;
} = {}): Promise<SchoolClosure[]> {
  let query = supabaseAdmin
    .from("school_closures")
    .select(
      "id, name, closure_type, start_date, end_date, notes, created_by, created_at, updated_at"
    );

  if (options.startDate) query = query.gte("end_date", options.startDate);
  if (options.endDate) query = query.lte("start_date", options.endDate);

  const { data, error } = await query
    .order("start_date", { ascending: options.ascending !== false })
    .order("end_date", { ascending: options.ascending !== false });
  if (error) throw error;
  return (data || []) as SchoolClosure[];
}

export async function getSchoolClosureForDate(
  date: string
): Promise<SchoolClosureSummary | null> {
  if (!isValidDate(date)) return null;
  const closures = await loadSchoolClosures({ startDate: date, endDate: date });
  return findSchoolClosure(date, closures);
}

export async function isSchoolClosed(date: string) {
  return Boolean(await getSchoolClosureForDate(date));
}

export function excludeSchoolClosureDates<
  T extends Record<K, string>,
  K extends keyof T,
>(rows: readonly T[], dateKey: K, closures: readonly SchoolClosureSummary[]) {
  return rows.filter((row) => !findSchoolClosure(row[dateKey], closures));
}

export function schoolClosedMessage(
  date: string,
  closure: Pick<SchoolClosure, "name">
) {
  return `School is closed on ${date} for ${closure.name}. No lesson obligation is required.`;
}
