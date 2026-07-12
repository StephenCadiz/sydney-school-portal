import { supabase } from "./supabase";

type AdminAnnouncementInput = {
  title: string;
  content: string;
  audience_type: string;
  target_level?: string | null;
  created_by?: string | null;
};

function buildSupabaseErrorMessage(prefix: string, error: any) {
  return [
    `${prefix}: ${error.message}`,
    error.details ? `Details: ${error.details}` : "",
    error.hint ? `Hint: ${error.hint}` : "",
    error.code ? `Code: ${error.code}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function sortNewestFirst(items: any[]) {
  return [...items].sort((a, b) => {
    const firstDate = a.created_at ? new Date(a.created_at).getTime() : 0;
    const secondDate = b.created_at ? new Date(b.created_at).getTime() : 0;

    return secondDate - firstDate;
  });
}

function removeDuplicateAnnouncements(items: any[]) {
  const seenIds = new Set<string>();

  return items.filter((item) => {
    if (!item.id) return true;
    if (seenIds.has(item.id)) return false;

    seenIds.add(item.id);
    return true;
  });
}

export async function getClassAnnouncements(classId: string) {
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .eq("classes_id", classId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      buildSupabaseErrorMessage("Unable to load class announcements", error)
    );
  }

  return data || [];
}

export async function createAdminAnnouncement({
  title,
  content,
  audience_type,
  target_level = null,
  created_by = null,
}: AdminAnnouncementInput) {
  const { error } = await supabase.from("announcements").insert([
    {
      classes_id: null,
      title,
      content,
      audience_type,
      target_level,
      created_by,
    },
  ]);

  if (error) {
    throw new Error(
      buildSupabaseErrorMessage("Unable to publish announcement", error)
    );
  }
}

export async function getAdminAnnouncements() {
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .neq("audience_type", "class")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      buildSupabaseErrorMessage("Unable to load admin announcements", error)
    );
  }

  return data || [];
}

export async function deleteAnnouncement(id: string) {
  const { error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(
      buildSupabaseErrorMessage("Unable to delete announcement", error)
    );
  }
}

export async function getStudentRelevantAnnouncements(
  studentLevel: string | null | undefined,
  classId: string
) {
  const classAnnouncements = await getClassAnnouncements(classId);

  const { data: cambridgeAnnouncements, error: cambridgeError } =
    await supabase
      .from("announcements")
      .select("*")
      .eq("audience_type", "all_cambridge_students")
      .order("created_at", { ascending: false });

  if (cambridgeError) {
    throw new Error(
      buildSupabaseErrorMessage(
        "Unable to load Cambridge announcements",
        cambridgeError
      )
    );
  }

  let levelAnnouncements: any[] = [];

  if (studentLevel) {
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .eq("audience_type", "level")
      .eq("target_level", studentLevel)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(
        buildSupabaseErrorMessage(
          "Unable to load level announcements",
          error
        )
      );
    }

    levelAnnouncements = data || [];
  }

  return sortNewestFirst(
    removeDuplicateAnnouncements([
      ...classAnnouncements,
      ...(cambridgeAnnouncements || []),
      ...levelAnnouncements,
    ])
  );
}

async function getReadAnnouncementIds(userId: string, announcementIds: string[]) {
  if (!userId || announcementIds.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await supabase
    .from("announcement_reads")
    .select("announcement_id")
    .eq("user_id", userId)
    .in("announcement_id", announcementIds);

  if (error) {
    throw new Error(
      buildSupabaseErrorMessage("Unable to load announcement reads", error)
    );
  }

  return new Set((data || []).map((item) => item.announcement_id));
}

export async function getUnreadStudentAnnouncements(
  userId: string,
  studentLevel: string | null | undefined,
  classId: string
) {
  const announcements = await getStudentRelevantAnnouncements(
    studentLevel,
    classId
  );
  const announcementIds = announcements
    .map((announcement) => announcement.id)
    .filter(Boolean);
  const readAnnouncementIds = await getReadAnnouncementIds(
    userId,
    announcementIds
  );

  return sortNewestFirst(
    announcements.filter(
      (announcement) => !readAnnouncementIds.has(announcement.id)
    )
  );
}

export async function getUnreadTeacherAnnouncements(userId: string) {
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .eq("audience_type", "all_teachers")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      buildSupabaseErrorMessage("Unable to load teacher announcements", error)
    );
  }

  const announcements = data || [];
  const announcementIds = announcements
    .map((announcement) => announcement.id)
    .filter(Boolean);
  const readAnnouncementIds = await getReadAnnouncementIds(
    userId,
    announcementIds
  );

  return sortNewestFirst(
    announcements.filter(
      (announcement) => !readAnnouncementIds.has(announcement.id)
    )
  );
}

export async function markAnnouncementAsRead(
  announcementId: string,
  userId: string
) {
  const { error } = await supabase.from("announcement_reads").upsert(
    [
      {
        announcement_id: announcementId,
        user_id: userId,
        read_at: new Date().toISOString(),
      },
    ],
    {
      onConflict: "announcement_id,user_id",
      ignoreDuplicates: true,
    }
  );

  if (error) {
    throw new Error(
      buildSupabaseErrorMessage("Unable to mark announcement as read", error)
    );
  }
}
