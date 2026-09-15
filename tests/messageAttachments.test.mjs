import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const migration = read(
  "supabase/migrations/20260915130000_add_private_message_attachments.sql"
);
const config = read("lib/messageAttachmentConfig.ts");
const uploadRoute = read("app/api/messages/attachments/route.ts");
const openRoute = read(
  "app/api/messages/attachments/[messageId]/[attachmentId]/route.ts"
);
const picker = read("app/components/messages/MessageAttachmentPicker.tsx");
const display = read("app/components/messages/MessageAttachments.tsx");
const adminPage = read("app/admin/messages/page.tsx");
const teacherPage = read("app/teacher/messages/page.tsx");
const teacherStudentInbox = read(
  "app/teacher/messages/TeacherStudentMessagesInbox.tsx"
);
const classMessages = read("app/teacher/class/ClassMessagesTab.tsx");
const studentPanel = read("app/teacher/class/StudentMessagePanelSection.tsx");
const studentPage = read("app/student/messages/page.tsx");
const studentApi = read("app/api/teacher/student-messages/route.ts");
const styles = read("app/globals.css");

test("private attachment storage and message metadata are constrained", () => {
  assert.match(migration, /add column if not exists attachments jsonb not null default '\[\]'::jsonb/i);
  assert.match(migration, /public = false/);
  assert.match(migration, /26214400/);
  assert.match(migration, /messages_validate_attachments/);
  assert.match(migration, /set search_path = public, pg_temp/);
  assert.match(migration, /attachment_path <> new\.sender_id::text \|\| '\/' \|\| attachment_id/);
  assert.match(migration, /attachment_type not in \(/);
  assert.match(migration, /No direct access to private message attachments/);
  assert.match(migration, /using \(bucket_id = 'message-attachments' and false\)/i);
  assert.match(config, /MESSAGE_ATTACHMENT_MAX_BYTES = 25 \* 1024 \* 1024/);
  assert.match(config, /MESSAGE_ATTACHMENT_MAX_COUNT = 10/);
  assert.match(config, /application\/pdf/);
  assert.doesNotMatch(config, /application\/javascript|text\/html|application\/x-msdownload/);
});

test("file picker supports accessible selection, drag and drop, validation, and removal", () => {
  assert.match(picker, /type="file"/);
  assert.match(picker, /multiple/);
  assert.match(picker, /Attach files/);
  assert.match(picker, /onDragOver/);
  assert.match(picker, /onDrop/);
  assert.match(picker, /dataTransfer\.files/);
  assert.match(picker, /Remove \$\{file\.name\}/);
  assert.match(picker, /validateMessageFile/);
  assert.match(picker, /role="alert"/);
  assert.match(styles, /\.message-attachment-picker[\s\S]*min-width: 0/);
  assert.match(styles, /\.message-attachment-button:focus-visible/);
});

test("uploads are authenticated, limited, and cleaned up on failure", () => {
  assert.match(uploadRoute, /auth\.getUser\(token\)/);
  assert.match(uploadRoute, /validateMessageFile/);
  assert.match(uploadRoute, /MESSAGE_ATTACHMENT_MAX_COUNT/);
  assert.match(uploadRoute, /upsert: false/);
  assert.match(uploadRoute, /uploadedPaths/);
  assert.match(uploadRoute, /storage\.from\(BUCKET\)\.remove\(uploadedPaths\)/);
  assert.match(uploadRoute, /Cache-Control.*no-store/);
  assert.match(uploadRoute, /safeFilename/);
  assert.match(uploadRoute, /startsWith\(`\$\{auth\.user\.id\}\/`\)/);
  assert.match(uploadRoute, /hasExpectedSignature/);
  assert.match(uploadRoute, /declared file type/);
});

test("attachment opening checks message permissions and returns short-lived signed URLs", () => {
  assert.match(openRoute, /auth\.getUser\(token\)/);
  assert.match(openRoute, /message\.sender_id === authData\.user\.id/);
  assert.match(openRoute, /message\.receiver_id === authData\.user\.id/);
  assert.match(openRoute, /profile\.role === "admin" && message\.recipient_group === "admin"/);
  assert.match(openRoute, /!message\.admin_deleted_at/);
  assert.match(openRoute, /!message\.sender_deleted_at/);
  assert.match(openRoute, /!message\.recipient_deleted_at/);
  assert.match(openRoute, /createSignedUrl\(attachment\.path, 120\)/);
  assert.match(openRoute, /Attachment not found/);
  assert.match(display, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(display, /Open \/ download/);
});

test("all Admin, Teacher, and Student composers attach files and render received attachments", () => {
  for (const source of [adminPage, teacherPage, teacherStudentInbox, classMessages, studentPanel, studentPage]) {
    assert.match(source, /MessageAttachmentPicker/);
    assert.match(source, /uploadMessageAttachments/);
    assert.match(source, /attachments:/);
    assert.match(source, /MessageAttachments/);
  }
  assert.match(adminPage, /replyAttachmentFiles/);
  assert.match(teacherPage, /replyAttachmentFiles/);
  assert.match(teacherStudentInbox, /replyToTeacherStudentMessage/);
  assert.match(studentPage, /startReply/);
  assert.match(studentApi, /attachments/);
  assert.match(studentApi, /Array\.isArray\(record\.attachments\)/);
  assert.match(styles, /\.message-attachment-item/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.message-attachment-item/);
});

test("legacy resource links and existing privacy identities remain intact", () => {
  assert.match(adminPage, /Attachment \/ resource link/);
  assert.match(teacherPage, /Attachment or resource link/);
  assert.match(studentPage, /Attachment \/ resource link/);
  assert.match(adminPage, /senderIdentity/);
  assert.match(teacherPage, /Rosa Vara/);
  assert.match(migration, /message-attachments/);
});
