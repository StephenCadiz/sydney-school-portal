import "server-only";

import { supabaseAdmin } from "./supabaseAdmin";

export const DELETE_ADMIN_MESSAGES_PERMISSION = "delete_admin_messages";

export async function hasAdminStaffPermission(
  adminId: string,
  permissionKey: string
) {
  const { data, error } = await supabaseAdmin
    .from("admin_staff_permissions")
    .select("id")
    .eq("admin_id", adminId)
    .eq("permission_key", permissionKey)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}
