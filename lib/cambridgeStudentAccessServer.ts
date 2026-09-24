import "server-only";

import { NextRequest } from "next/server";

import { supabaseAdmin } from "./supabaseAdmin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class CambridgeAccessError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export type AccessActor = {
  id: string;
  role: "admin" | "teacher";
};

export type CambridgeStudentAccess = {
  profile_id: string;
  email: string | null;
  auth_user_id: string | null;
  portal_access_active: boolean;
  invitation_sent: boolean;
  invitation_sent_at: string | null;
  invitation_pending: boolean;
  auth_confirmed: boolean;
};

function bearerToken(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

export function normalizeStudentEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidStudentEmail(value: string) {
  return value.length <= 254 && EMAIL_RE.test(value);
}

export async function authenticateAccessActor(request: NextRequest): Promise<AccessActor> {
  const token = bearerToken(request);
  if (!token) throw new CambridgeAccessError("Authentication required.", 401);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new CambridgeAccessError("Authentication required.", 401);
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) throw new CambridgeAccessError("Unable to verify account access.", 500);
  const role = String(profile?.role || "").toLowerCase();
  if ((role !== "admin" && role !== "teacher") || profile?.active === false) {
    throw new CambridgeAccessError("Admin or Teacher access required.", 403);
  }
  return { id: data.user.id, role };
}

async function assertCambridgeStudent(profileId: string, classId?: string) {
  const { data: student, error: studentError } = await supabaseAdmin
    .from("profiles")
    .select("id, email, role, active")
    .eq("id", profileId)
    .maybeSingle();
  if (studentError) throw new CambridgeAccessError("Unable to load the student profile.", 500);
  if (!student || student.role !== "student" || student.active === false) {
    throw new CambridgeAccessError("Cambridge student not found.", 404);
  }

  const query = supabaseAdmin
    .from("class_enrolment_periods")
    .select("class_id, starts_on, ends_before, cancelled_at, classes!inner(is_cambridge)")
    .eq("student_type", "profile")
    .eq("profile_student_id", profileId)
    .is("cancelled_at", null);
  const { data: enrolments, error: enrolmentError } = classId
    ? await query.eq("class_id", classId)
    : await query;
  if (enrolmentError) throw new CambridgeAccessError("Unable to verify Cambridge enrolment.", 500);
  const valid = (enrolments || []).some((row: any) =>
    row?.classes?.is_cambridge === true &&
    (!classId || String(row.class_id) === classId)
  );
  if (!valid) throw new CambridgeAccessError("Cambridge student access is not available for this class.", 403);
  return student;
}

export async function authorizeCambridgeAccess(
  actor: AccessActor,
  profileId: string,
  classId?: string
) {
  const student = await assertCambridgeStudent(profileId, classId);
  if (actor.role === "teacher") {
    if (!classId) throw new CambridgeAccessError("Class assignment is required.", 400);
    const { data: classroom, error: classError } = await supabaseAdmin
      .from("classes")
      .select("id, teacher_id, is_cambridge")
      .eq("id", classId)
      .maybeSingle();
    if (classError || !classroom || classroom.is_cambridge !== true || classroom.teacher_id !== actor.id) {
      throw new CambridgeAccessError("You can only manage students in your assigned Cambridge classes.", 403);
    }
  }
  return student;
}

export async function resolveStudentAuthUser(profile: { id: string; email?: string | null }) {
  const { data: linked } = await supabaseAdmin
    .from("student_portal_accounts")
    .select("auth_user_id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (linked?.auth_user_id) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(linked.auth_user_id);
    if (data.user) return data.user;
  }

  const direct = await supabaseAdmin.auth.admin.getUserById(profile.id);
  if (direct.data.user) return direct.data.user;

  const email = normalizeStudentEmail(profile.email);
  if (!email) return null;
  const { data: users, error: usersError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) throw new CambridgeAccessError("Unable to check duplicate email addresses.", 500);
  const matches = (users?.users || []).filter(
    (user) => normalizeStudentEmail(user.email) === email
  );
  if (matches.length > 1) {
    throw new CambridgeAccessError(
      "Multiple portal accounts match this student email. Account reconciliation is required.",
      409
    );
  }
  return matches[0] || null;
}

export async function ensureStudentPortalAccountMapping(
  profileId: string,
  authUserId: string
) {
  const { data: byProfile, error: profileLookupError } = await supabaseAdmin
    .from("student_portal_accounts")
    .select("profile_id, auth_user_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (profileLookupError) {
    throw new CambridgeAccessError("Unable to verify the student portal account link.", 500);
  }
  if (byProfile?.auth_user_id && byProfile.auth_user_id !== authUserId) {
    throw new CambridgeAccessError("This student profile is linked to another portal account.", 409);
  }

  const { data: byAuth, error: authLookupError } = await supabaseAdmin
    .from("student_portal_accounts")
    .select("profile_id, auth_user_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (authLookupError) {
    throw new CambridgeAccessError("Unable to verify the student portal account link.", 500);
  }
  if (byAuth?.profile_id && byAuth.profile_id !== profileId) {
    throw new CambridgeAccessError("This portal account is linked to another student profile.", 409);
  }

  if (!byProfile) {
    const { error: linkError } = await supabaseAdmin
      .from("student_portal_accounts")
      .insert({ profile_id: profileId, auth_user_id: authUserId });
    if (linkError) {
      throw new CambridgeAccessError("Unable to link the student portal account.", 500);
    }
  }
}

export async function resolveProfileIdForAuthUser(authUserId: string) {
  const { data } = await supabaseAdmin
    .from("student_portal_accounts")
    .select("profile_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (data?.profile_id) return data.profile_id;

  // Legacy roster-only Cambridge profiles may predate the mapping table. A
  // safe fallback uses only an exact, unique email match plus an active
  // Cambridge enrolment; names are never used for account linking.
  const { data: directProfile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", authUserId)
    .maybeSingle();
  if (directProfile?.id) return authUserId;

  const { data: authResult } = await supabaseAdmin.auth.admin.getUserById(authUserId);
  const email = normalizeStudentEmail(authResult.user?.email);
  if (!email) return authUserId;

  const { data: profiles, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("role", "student")
    .limit(1000);
  const matchingProfiles = (profiles || []).filter(
    (profile: any) => normalizeStudentEmail(profile.email) === email
  );
  if (profileError || matchingProfiles.length !== 1) return authUserId;

  const profileId = String(matchingProfiles[0].id || "");
  if (!profileId) return authUserId;
  const { data: enrolments, error: enrolmentError } = await supabaseAdmin
    .from("current_class_enrolments")
    .select("class_id, classes!inner(is_cambridge)")
    .eq("student_id", profileId);
  if (
    enrolmentError ||
    !(enrolments || []).some((row: any) => row?.classes?.is_cambridge === true)
  ) {
    return authUserId;
  }

  try {
    await ensureStudentPortalAccountMapping(profileId, authUserId);
    return profileId;
  } catch {
    // Fail closed if the verified identity cannot be linked atomically.
    return authUserId;
  }
}

export async function loadStudentAccess(profileId: string): Promise<CambridgeStudentAccess> {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("id", profileId)
    .single();
  if (error || !profile) throw new CambridgeAccessError("Cambridge student not found.", 404);
  const authUser = await resolveStudentAuthUser(profile);
  if (authUser) {
    await ensureStudentPortalAccountMapping(profile.id, authUser.id);
  }
  const invitedAt = authUser?.invited_at || authUser?.confirmation_sent_at || null;
  const authConfirmed = Boolean(authUser?.email_confirmed_at);
  const invitationPending = Boolean(authUser && !authConfirmed);
  return {
    profile_id: profile.id,
    email: profile.email || null,
    auth_user_id: authUser?.id || null,
    portal_access_active: Boolean(authUser && authConfirmed),
    invitation_sent: Boolean(invitedAt),
    invitation_sent_at: invitedAt,
    invitation_pending: invitationPending,
    auth_confirmed: authConfirmed,
  };
}

export async function ensureUniqueEmail(email: string, profileId: string) {
  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .neq("id", profileId)
    .limit(1);
  if (error) throw new CambridgeAccessError("Unable to check duplicate email addresses.", 500);
  if (profiles?.length) throw new CambridgeAccessError("An account with this email already exists.", 409);
  const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if ((users?.users || []).some((user) => normalizeStudentEmail(user.email) === email)) {
    const current = await loadStudentAccess(profileId);
    if (!current.auth_user_id || normalizeStudentEmail((users?.users || []).find((u) => u.id === current.auth_user_id)?.email) !== email) {
      throw new Error("An account with this email already exists.");
    }
  }
}

export async function saveStudentEmail(profileId: string, email: string) {
  const normalized = normalizeStudentEmail(email);
  if (normalized && !isValidStudentEmail(normalized)) throw new CambridgeAccessError("Enter a valid email address.", 400);
  await ensureUniqueEmail(normalized, profileId);
  const { data: profile, error: profileError } = await supabaseAdmin.from("profiles").select("id, email").eq("id", profileId).single();
  if (profileError || !profile) throw new CambridgeAccessError("Cambridge student not found.", 404);
  const authUser = await resolveStudentAuthUser(profile);
  if (authUser && !normalized) {
    throw new CambridgeAccessError(
      "Remove the existing portal account before clearing its login email.",
      409
    );
  }
  if (authUser && normalized) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
      email: normalized,
      ...(authUser.email_confirmed_at ? { email_confirm: true } : {}),
    });
    if (error) throw new CambridgeAccessError("Unable to update the student login email.", 500);
  }
  const { error } = await supabaseAdmin.from("profiles").update({ email: normalized || null }).eq("id", profileId).eq("role", "student");
  if (error) throw new CambridgeAccessError("Unable to save the student email.", 500);
  return loadStudentAccess(profileId);
}

export async function sendStudentInvitation(
  profileId: string,
  redirectTo: string,
  options: { resend?: boolean } = {}
) {
  const { data: profile, error } = await supabaseAdmin.from("profiles").select("id, email").eq("id", profileId).single();
  if (error || !profile || !profile.email) throw new CambridgeAccessError("Add a valid email address before sending an invitation.", 400);
  const existing = await resolveStudentAuthUser(profile);
  if (existing) {
    await ensureStudentPortalAccountMapping(profileId, existing.id);
    if (existing.email && normalizeStudentEmail(existing.email) !== normalizeStudentEmail(profile.email)) {
      throw new CambridgeAccessError("Save the corrected email before sending an invitation.", 400);
    }
    if (existing.email_confirmed_at) {
      throw new CambridgeAccessError(
        "This Student Portal account is already confirmed. Use password reset instead of sending another invitation.",
        409
      );
    }
    if (!options.resend) {
      throw new CambridgeAccessError("An invitation is already pending. Use Resend invitation to send it again.", 409);
    }
    const { data: resent, error: resendError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      normalizeStudentEmail(existing.email || profile.email),
      { redirectTo }
    );
    if (resendError || !resent.user) {
      throw new CambridgeAccessError(
        resendError?.message || "Invitation email could not be resent.",
        resendError?.status === 429 ? 429 : 500
      );
    }
    return { access: await loadStudentAccess(profileId), already_active: false, resent: true };
  }
  const { data, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(profile.email, { redirectTo });
  if (inviteError || !data.user) {
    throw new CambridgeAccessError(
      inviteError?.message || "Invitation email could not be sent.",
      inviteError?.status === 429 ? 429 : 500
    );
  }
  try {
    await ensureStudentPortalAccountMapping(profileId, data.user.id);
  } catch (error) {
    await supabaseAdmin.auth.admin.deleteUser(data.user.id);
    throw error;
  }
  return { access: await loadStudentAccess(profileId), already_active: false };
}
