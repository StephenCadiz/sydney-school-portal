export type UpcomingCalendarGroupItem = {
  id: string;
  label: string;
  start_time: string | null;
  end_time: string | null;
};

export type UpcomingCalendarGroup = {
  id: string;
  kind: "friday_tutorial" | "friday_at_6" | "exam_week";
  title: string;
  event_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  description: string;
  items: UpcomingCalendarGroupItem[];
};
