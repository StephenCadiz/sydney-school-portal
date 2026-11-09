/**
 * Keep mailbox projections small while remaining compatible with a database
 * that has not yet applied the conversation-thread migration.
 */
export const MESSAGE_COLUMNS =
  "id, sender_id, receiver_id, recipient_group, subject, message, attachment_link, attachments, conversation_id, created_at, read_at, recipient_deleted_at, sender_deleted_at, admin_deleted_at";

const LEGACY_MESSAGE_COLUMNS =
  "id, sender_id, receiver_id, recipient_group, subject, message, attachment_link, attachments, created_at, read_at, recipient_deleted_at, sender_deleted_at, admin_deleted_at";

function missingConversationColumn(error: any) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return (
    ["42703", "PGRST204", "PGRST205"].includes(code) ||
    /conversation_id.*does not exist|could not find.*conversation_id/i.test(message)
  );
}

export async function queryMessages(
  build: (columns: string) => PromiseLike<{ data: any; error: any; [key: string]: any }>
): Promise<{ data: any; error: any; [key: string]: any }> {
  const result = await build(MESSAGE_COLUMNS);
  if (result.error && missingConversationColumn(result.error)) {
    return build(LEGACY_MESSAGE_COLUMNS);
  }
  return result;
}
