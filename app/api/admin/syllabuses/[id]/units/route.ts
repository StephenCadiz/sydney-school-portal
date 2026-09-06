import { NextRequest, NextResponse } from "next/server";

import {
  loadSyllabusById,
  logSyllabusFailure,
  requireSyllabusAdmin,
  syllabusJsonError,
} from "../../../../../../lib/syllabusServer";
import {
  isSyllabusUuid,
  validateSyllabusOrderedIds,
  validateSyllabusUnitInput,
} from "../../../../../../lib/syllabusValidation";
import { supabaseAdmin } from "../../../../../../lib/supabaseAdmin";

type RouteContext = { params: Promise<{ id: string }> };

async function syllabusId(context: RouteContext) {
  const { id } = await context.params;
  return String(id || "").trim();
}

async function syllabusExists(id: string) {
  const { data, error } = await supabaseAdmin
    .from("syllabuses")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireSyllabusAdmin(request);
  if (admin.response) return admin.response;

  const id = await syllabusId(context);
  if (!isSyllabusUuid(id)) return syllabusJsonError("Choose a valid syllabus.", 400);

  try {
    const validation = validateSyllabusUnitInput(
      await request.json().catch(() => null)
    );
    if (validation.error || !validation.value) {
      return syllabusJsonError(validation.error || "Invalid syllabus unit.", 422);
    }
    if (!(await syllabusExists(id))) {
      return syllabusJsonError("Syllabus was not found.", 404);
    }

    const { data: lastUnit, error: orderError } = await supabaseAdmin
      .from("syllabus_units")
      .select("sort_order")
      .eq("syllabus_id", id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (orderError) throw orderError;

    const { error } = await supabaseAdmin.from("syllabus_units").insert({
      syllabus_id: id,
      ...validation.value,
      sort_order: Number(lastUnit?.sort_order || 0) + 1,
    });
    if (error) throw error;

    await supabaseAdmin
      .from("syllabuses")
      .update({ updated_by: admin.userId })
      .eq("id", id);
    return NextResponse.json({ syllabus: await loadSyllabusById(id) }, { status: 201 });
  } catch (error) {
    logSyllabusFailure("admin-unit-create", error);
    return syllabusJsonError("Unable to add the syllabus unit.", 500);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await requireSyllabusAdmin(request);
  if (admin.response) return admin.response;

  const id = await syllabusId(context);
  if (!isSyllabusUuid(id)) return syllabusJsonError("Choose a valid syllabus.", 400);

  try {
    const body = await request.json().catch(() => null);
    const orderedIds = validateSyllabusOrderedIds(
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>).unit_ids
        : null,
      "unit"
    );
    if (orderedIds.error || !orderedIds.value) {
      return syllabusJsonError(orderedIds.error || "Invalid unit order.", 422);
    }
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => key !== "unit_ids")
    ) {
      return syllabusJsonError("The request contains unsupported unit fields.", 400);
    }

    const { error } = await supabaseAdmin.rpc("reorder_syllabus_units", {
      p_actor_id: admin.userId,
      p_syllabus_id: id,
      p_unit_ids: orderedIds.value,
    });
    if (error) {
      if (error.code === "42501") {
        return syllabusJsonError("Admin access required.", 403);
      }
      if (error.code === "P0002") {
        return syllabusJsonError("Syllabus was not found.", 404);
      }
      if (error.code === "22023") return syllabusJsonError(error.message, 422);
      throw error;
    }
    return NextResponse.json({ syllabus: await loadSyllabusById(id) });
  } catch (error) {
    logSyllabusFailure("admin-unit-reorder", error);
    return syllabusJsonError("Unable to reorder syllabus units.", 500);
  }
}
