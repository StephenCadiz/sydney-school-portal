import Link from "next/link";

type Reminder = {
  id: string;
  student_name: string;
  class_label: string;
  category: string;
  url: string;
};

export default function TeacherFollowUpActionReminderCard({
  reminders,
}: {
  reminders: Reminder[];
}) {
  if (!reminders.length) return null;

  return (
    <section
      className="teacher-dashboard-section teacher-dashboard-follow-up-action"
      aria-labelledby="teacher-follow-up-action-title"
    >
      <div className="teacher-dashboard-section-title">
        <div>
          <p className="teacher-dashboard-duty-reminder-eyebrow">FOLLOW-UP UPDATE</p>
          <h2 id="teacher-follow-up-action-title">Admin action completed</h2>
          <p>Admin has added an action to one of your student follow-ups.</p>
        </div>
      </div>
      <div className="teacher-dashboard-follow-up-action-list">
        {reminders.map((reminder) => (
          <Link
            key={reminder.id}
            className="teacher-dashboard-follow-up-action-row"
            href={reminder.url}
          >
            <span>
              <strong>{reminder.student_name}</strong>
              <small>
                {reminder.category} follow-up
                {reminder.class_label ? ` · ${reminder.class_label}` : ""}
              </small>
            </span>
            <span aria-hidden="true">Open follow-up&nbsp;›</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
