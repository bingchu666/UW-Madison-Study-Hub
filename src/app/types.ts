export type TaskStatus = "Not started" | "In progress" | "Submitted";
export type ExamType = "Midterm" | "Final" | "Quiz";
export type CustomItemType = "Study Block" | "Personal Reminder" | "Custom Event";

export interface Task {
  id: string;
  courseCode: string;
  courseName: string;
  title: string;
  dueDate: Date;
  dueAtUtc?: string;
  sourceTimezone?: string | null;
  allDay?: boolean;
  sourceDate?: string | null;
  status: TaskStatus;
  externalTool?: string; // e.g., "Gradescope", "Course website"
  externalUrl?: string;
  steps?: TaskStep[];
  reminderSet?: boolean;
  reminderDays?: number;
  addToCalendar?: boolean;
  submittedDate?: Date;
  sync?: {
    sourceId: string;
    sourceName: string;
    uid?: string | null;
    lastSyncedAt?: string;
    classification?: "task" | "exam" | "ignored";
  };
}

export interface TaskStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  link?: string;
  linkText?: string;
}

export interface Exam {
  id: string;
  courseCode: string;
  courseName: string;
  type: ExamType;
  date: Date;
  startsAtUtc?: string;
  endsAtUtc?: string | null;
  sourceTimezone?: string | null;
  allDay?: boolean;
  sourceDate?: string | null;
  time: string;
  location: string;
  reminderSet?: boolean;
  reminderDays?: number;
  addToCalendar?: boolean;
  coursePageUrl?: string; // New: link to course page/resources
  sync?: {
    sourceId: string;
    sourceName: string;
    uid?: string | null;
    lastSyncedAt?: string;
    classification?: "exam";
  };
}

export interface CustomPlannerItem {
  id: string;
  type: CustomItemType;
  title: string;
  description?: string;
  date: Date;
  time?: string;
  color?: string; // Optional custom color for visual distinction
}

export interface SyncSource {
  id: string;
  name: string;
  url: string;
  type: "canvas_ics";
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  lastStatus: "success" | "error" | "skipped" | null;
  lastMessage: string | null;
  lastImportedCount?: number;
}

export type TimeFilter = "Upcoming" | "All" | "Due in 24 hours" | "This week" | "Later";
export type StatusFilter = "Active" | "All" | "Not started" | "In progress" | "Submitted";
