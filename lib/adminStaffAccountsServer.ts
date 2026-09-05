import "server-only";

import { NextRequest } from "next/server";

import {
  getMadridDate,
  isAdminTimeRegistrationRequired,
  type StaffTimeAdminEnrollmentEvent,
} from "./staffTime";
import { supabaseAdmin } from "./supabaseAdmin";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdminStaffProfile = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
};

export type AdminStaffAccount = AdminStaffProfile & {
  auth_linked: boolean;
  requires_time_registration: boolean;
  time_registration_effective_from: string | null;
  time_registration_changed_at: string | null;
};

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isUuid(value: string) {
  return UUID.test(value);
}

export function isDuplicateAuthEmailError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const authError = error as { code?: unknown; message?: unknown };
  const code = String(authError.code || "").toLowerCase();
  const message = String(authError.message || "").toLowerCase();

  return (
    code === "email_exists" ||
    code === "user_already_exists" ||
    message.includes("already been registered") ||
    message.includes("email address is already") ||
    message.includes("email already exists")
  );
}

export function logAdminStaffAccountFailure(stage: string, details: unknown) {
  console.error("Admin staff account request failed:", { stage, details });
}

export async function authenticateAdminRequest(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (!token) {
    return {
      actorId: "",
      error: { message: "Authentication required.", status: 401 },
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) {
    logAdminStaffAccountFailure("actor-authentication", userError);
    return {
      actorId: "",
      error: { message: "Authentication required.", status: 401 },
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    logAdminStaffAccountFailure("actor-profile", profileError);
    return {
      actorId: "",
      error: { message: "Unable to verify Admin access.", status: 500 },
    };
  }
  if (profile?.role !== "admin") {
    return {
      actorId: "",
      error: { message: "Admin access required.", status: 403 },
    };
  }

  return { actorId: user.id, error: null };
}

export async function loadAdminProfileAndAuthUser(profileId: string) {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, email, first_name, last_name, role")
    .eq("id", profileId)
    .maybeSingle();
  if (profileError) throw profileError;

  const {
    data: { user: authUser },
    error: authError,
  } = await supabaseAdmin.auth.admin.getUserById(profileId);

  return {
    profile: (profile || null) as AdminStaffProfile | null,
    authUser: authUser || null,
    authError,
  };
}

export async function reconcileAdminProfileEmail(
  profile: AdminStaffProfile,
  authUser: { id: string; email?: string | null }
) {
  if (authUser.id !== profile.id) {
    throw new Error("The profile and Auth user identifiers do not match.");
  }

  const authEmail = normalizeEmail(authUser.email);
  if (!authEmail) {
    throw new Error("The linked Auth user has no email address.");
  }

  if (normalizeEmail(profile.email) === authEmail) {
    return { ...profile, email: authEmail };
  }

  const { data: updatedProfile, error } = await supabaseAdmin
    .from("profiles")
    .update({ email: authEmail })
    .eq("id", profile.id)
    .eq("role", "admin")
    .select("id, email, first_name, last_name, role")
    .maybeSingle();
  if (error || !updatedProfile) {
    throw error || new Error("The Admin profile could not be reconciled.");
  }

  return updatedProfile as AdminStaffProfile;
}

export async function loadReconciledAdminStaffAccounts() {
  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, first_name, last_name, role")
    .eq("role", "admin");
  if (error) throw error;

  const today = getMadridDate();
  const { data: enrollmentRows, error: enrollmentError } = await supabaseAdmin
    .from("staff_time_admin_enrollment_events")
    .select("id, admin_id, requires_time_registration, effective_from, changed_by, changed_at")
    .lte("effective_from", today)
    .order("effective_from", { ascending: false })
    .order("changed_at", { ascending: false })
    .order("id", { ascending: false });
  if (enrollmentError) throw enrollmentError;
  const enrollmentEvents = (enrollmentRows || []) as StaffTimeAdminEnrollmentEvent[];

  return Promise.all(
    ((profiles || []) as AdminStaffProfile[]).map(async (profile) => {
      const accountEvents = enrollmentEvents.filter(
        (event) => event.admin_id === profile.id
      );
      const currentEvent = accountEvents[0] || null;
      const tracking = {
        requires_time_registration: isAdminTimeRegistrationRequired(
          accountEvents,
          today
        ),
        time_registration_effective_from: currentEvent?.effective_from || null,
        time_registration_changed_at: currentEvent?.changed_at || null,
      };
      const {
        data: { user: authUser },
        error: authError,
      } = await supabaseAdmin.auth.admin.getUserById(profile.id);

      if (authError || !authUser) {
        return {
          ...profile,
          auth_linked: false,
          ...tracking,
        } satisfies AdminStaffAccount;
      }

      const reconciledProfile = await reconcileAdminProfileEmail(
        profile,
        authUser
      );
      return {
        ...reconciledProfile,
        auth_linked: true,
        ...tracking,
      } satisfies AdminStaffAccount;
    })
  );
}

export async function loadAdminTimeRegistrationStatus(
  adminId: string,
  date = getMadridDate()
) {
  const { data, error } = await supabaseAdmin
    .from("staff_time_admin_enrollment_events")
    .select("id, admin_id, requires_time_registration, effective_from, changed_by, changed_at")
    .eq("admin_id", adminId)
    .lte("effective_from", date)
    .order("effective_from", { ascending: false })
    .order("changed_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw error;
  const events = (data || []) as StaffTimeAdminEnrollmentEvent[];
  const current = events[0] || null;
  return {
    requires_time_registration: isAdminTimeRegistrationRequired(events, date),
    time_registration_effective_from: current?.effective_from || null,
    time_registration_changed_at: current?.changed_at || null,
  };
}

export async function setAdminTimeRegistrationRequirement(input: {
  actorId: string;
  adminId: string;
  required: boolean;
  effectiveFrom: string;
}) {
  const { data, error } = await supabaseAdmin.rpc("set_staff_time_admin_enrollment", {
    p_actor_id: input.actorId,
    p_admin_id: input.adminId,
    p_requires_time_registration: input.required,
    p_effective_from: input.effectiveFrom,
  });
  if (error) throw error;
  return data as StaffTimeAdminEnrollmentEvent;
}
