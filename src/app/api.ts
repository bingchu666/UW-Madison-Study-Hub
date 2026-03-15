const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const jsonHeaders = {
  "Content-Type": "application/json",
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, init);

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = await response.json().catch(() => null);
      const message = payload?.error || payload?.message;
      const suggestion = payload?.suggestion;
      if (message) {
        throw new Error(suggestion ? `${message} Suggestion: ${suggestion}` : message);
      }
    }
    const errorText = await response.text();
    throw new Error(errorText || `Request failed (${response.status})`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};

export const api = {
  getBootstrap: () => request<{ tasks: any[]; exams: any[]; customItems: any[]; syncSources: any[] }>("/api/bootstrap"),
  getSyncSources: () => request<any[]>("/api/sync/sources"),
  addSyncSource: (payload: { name: string; url: string; type?: "canvas_ics"; active?: boolean }) =>
    request<any>("/api/sync/sources", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    }),
  deleteSyncSource: (sourceId: string) =>
    request<void>(`/api/sync/sources/${sourceId}`, {
      method: "DELETE",
    }),
  runAllSync: () =>
    request<{ results: any[] }>("/api/sync/run", {
      method: "POST",
      headers: jsonHeaders,
    }),
  rebuildSync: () =>
    request<{ results: any[]; rebuilt: boolean }>("/api/sync/rebuild", {
      method: "POST",
      headers: jsonHeaders,
    }),
  runSyncSource: (sourceId: string) =>
    request<any>(`/api/sync/sources/${sourceId}/run`, {
      method: "POST",
      headers: jsonHeaders,
    }),
  importCanvasJson: (payload: {
    sourceName?: string;
    items: Array<{
      title: string;
      dueDate: string;
      courseCode?: string;
      courseName?: string;
      externalUrl?: string;
    }>;
  }) =>
    request<{ ok: boolean; created: number; updated: number; total: number }>("/api/sync/import-json", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    }),
  importMyUwExams: (payload: {
    items: Array<{
      courseCode: string;
      courseName: string;
      type: string;
      startsAtUtc: string;
      endsAtUtc?: string | null;
      location?: string;
      time?: string;
      coursePageUrl?: string;
      uid?: string;
    }>;
  }) =>
    request<{ ok: boolean; created: number; updated: number; removedStale: number; totalActive: number; total: number }>(
      "/api/sync/import-myuw-exams",
      {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
      },
    ),
  parseMyUwExams: (payload: {
    text?: string;
    userTimezone?: string;
  }) =>
    request<{
      ok: boolean;
      provider: string;
      usedAi: boolean;
      count: number;
      warnings: string[];
      items: Array<{
        courseCode: string;
        courseName: string;
        type: string;
        startsAtUtc: string;
        endsAtUtc?: string | null;
        location?: string;
        time?: string;
        coursePageUrl?: string;
        uid?: string;
      }>;
    }>("/api/sync/parse-myuw-exams", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    }),
  updateTaskStatus: (taskId: string, status: string, submittedDate?: string) =>
    request<any>(`/api/tasks/${taskId}/status`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ status, submittedDate }),
    }),
  updateTaskStep: (taskId: string, stepId: string, completed: boolean) =>
    request<any>(`/api/tasks/${taskId}/steps/${stepId}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ completed }),
    }),
  setTaskReminder: (taskId: string, days: number, addToCalendar: boolean) =>
    request<any>(`/api/tasks/${taskId}/reminder`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ days, addToCalendar }),
    }),
  setExamReminder: (examId: string, days: number, addToCalendar: boolean) =>
    request<any>(`/api/exams/${examId}/reminder`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ days, addToCalendar }),
    }),
  createTask: (payload: {
    courseCode: string;
    courseName: string;
    title: string;
    dueDate: string;
    externalTool?: string;
    externalUrl?: string;
  }) =>
    request<any>("/api/tasks", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    }),
  createExam: (payload: {
    courseCode: string;
    courseName: string;
    type: string;
    date: string;
    time: string;
    location: string;
    coursePageUrl?: string;
  }) =>
    request<any>("/api/exams", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    }),
  addCustomItem: (payload: {
    type: string;
    title: string;
    description?: string;
    date: string;
    time?: string;
    color?: string;
  }) =>
    request<any>("/api/custom-items", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    }),
  deleteCustomItem: (itemId: string) =>
    request<void>(`/api/custom-items/${itemId}`, {
      method: "DELETE",
    }),
};
