import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { Task, Exam, CustomPlannerItem, SyncSource } from "./types";
import { api } from "./api";

interface CreateTaskInput {
  courseCode: string;
  courseName: string;
  title: string;
  dueDate: Date;
  externalTool?: string;
  externalUrl?: string;
}

interface CreateExamInput {
  courseCode: string;
  courseName: string;
  type: Exam["type"];
  date: Date;
  time: string;
  location: string;
  coursePageUrl?: string;
}

interface AppContextType {
  tasks: Task[];
  exams: Exam[];
  customItems: CustomPlannerItem[];
  syncSources: SyncSource[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  clearError: () => void;
  refreshData: () => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<void>;
  createExam: (input: CreateExamInput) => Promise<void>;
  addSyncSource: (input: { name: string; url: string }) => Promise<void>;
  deleteSyncSource: (id: string) => Promise<void>;
  runAllSync: () => Promise<void>;
  runSyncSource: (id: string) => Promise<void>;
  rebuildSync: () => Promise<void>;
  importCanvasJson: (
    items: Array<{ title: string; dueDate: string; courseCode?: string; courseName?: string; externalUrl?: string }>,
  ) => Promise<{ created: number; updated: number; total: number } | null>;
  importMyUwExams: (
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
    }>,
  ) => Promise<{ created: number; updated: number; removedStale: number; totalActive: number; total: number } | null>;
  parseMyUwExams: (input: {
    text?: string;
    userTimezone?: string;
  }) => Promise<{
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
  } | null>;
  updateTaskStatus: (taskId: string, status: Task["status"], submittedDate?: Date) => Promise<void>;
  updateTaskStep: (taskId: string, stepId: string, completed: boolean) => Promise<void>;
  setExamReminder: (examId: string, days: number, addToCalendar: boolean) => Promise<void>;
  setTaskReminder: (taskId: string, days: number, addToCalendar: boolean) => Promise<void>;
  addCustomItem: (item: Omit<CustomPlannerItem, "id">) => Promise<void>;
  deleteCustomItem: (id: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const toTask = (task: any): Task => ({
  ...task,
  dueDate: new Date(task.dueAtUtc || task.dueDate),
  dueAtUtc: task.dueAtUtc || task.dueDate,
  sourceTimezone: task.sourceTimezone || null,
  allDay: Boolean(task.allDay),
  sourceDate: task.sourceDate || null,
  submittedDate: task.submittedDate ? new Date(task.submittedDate) : undefined,
});

const toExam = (exam: any): Exam => ({
  ...exam,
  date: new Date(exam.startsAtUtc || exam.date),
  startsAtUtc: exam.startsAtUtc || exam.date,
  endsAtUtc: exam.endsAtUtc || null,
  sourceTimezone: exam.sourceTimezone || null,
  allDay: Boolean(exam.allDay),
  sourceDate: exam.sourceDate || null,
});

const toCustomItem = (item: any): CustomPlannerItem => ({
  ...item,
  date: new Date(item.date),
});

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [customItems, setCustomItems] = useState<CustomPlannerItem[]>([]);
  const [syncSources, setSyncSources] = useState<SyncSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const clearError = () => setError(null);

  const runAction = async (action: () => Promise<void>, fallbackMessage: string) => {
    try {
      await action();
      setError(null);
    } catch (err) {
      const detail = err instanceof Error ? err.message.trim() : "";
      setError(detail ? `${fallbackMessage} (${detail})` : fallbackMessage);
    }
  };

  const refreshData = async () => {
    await runAction(async () => {
      setLoading(true);
      const data = await api.getBootstrap();
      setTasks(data.tasks.map(toTask));
      setExams(data.exams.map(toExam));
      setCustomItems(data.customItems.map(toCustomItem));
      setSyncSources((data.syncSources || []) as SyncSource[]);
      setLoading(false);
    }, "Unable to load data. Please make sure the backend server is running.");
    setLoading(false);
  };

  useEffect(() => {
    void refreshData();
  }, []);

  const createTask = async (input: CreateTaskInput) => {
    await runAction(async () => {
      const created = await api.createTask({
        ...input,
        dueDate: input.dueDate.toISOString(),
      });
      setTasks((prev) => [toTask(created), ...prev]);
    }, "Failed to create task. Please try again.");
  };

  const createExam = async (input: CreateExamInput) => {
    await runAction(async () => {
      const created = await api.createExam({
        ...input,
        date: input.date.toISOString(),
      });
      setExams((prev) => [toExam(created), ...prev]);
    }, "Failed to create exam. Please try again.");
  };

  const addSyncSource = async (input: { name: string; url: string }) => {
    await runAction(async () => {
      const source = await api.addSyncSource(input);
      setSyncSources((prev) => [...prev, source]);
    }, "Failed to add sync source. Please try again.");
  };

  const deleteSyncSource = async (id: string) => {
    await runAction(async () => {
      await api.deleteSyncSource(id);
      setSyncSources((prev) => prev.filter((item) => item.id !== id));
    }, "Failed to delete sync source. Please try again.");
  };

  const runAllSync = async () => {
    await runAction(async () => {
      await api.runAllSync();
      await refreshData();
    }, "Sync failed. Please try again.");
  };

  const rebuildSync = async () => {
    await runAction(async () => {
      await api.rebuildSync();
      await refreshData();
    }, "Failed to rebuild synced data. Please try again.");
  };

  const runSyncSource = async (id: string) => {
    await runAction(async () => {
      await api.runSyncSource(id);
      await refreshData();
    }, "Sync failed. Please try again.");
  };

  const importCanvasJson = async (
    items: Array<{ title: string; dueDate: string; courseCode?: string; courseName?: string; externalUrl?: string }>,
  ) => {
    let result: { created: number; updated: number; total: number } | null = null;
    await runAction(async () => {
      const response = await api.importCanvasJson({ items });
      result = {
        created: response.created,
        updated: response.updated,
        total: response.total,
      };
      await refreshData();
    }, "Failed to import Canvas JSON. Please try again.");
    return result;
  };

  const importMyUwExams = async (
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
    }>,
  ) => {
    let result: { created: number; updated: number; removedStale: number; totalActive: number; total: number } | null = null;
    await runAction(async () => {
      const response = await api.importMyUwExams({ items });
      result = {
        created: response.created,
        updated: response.updated,
        removedStale: response.removedStale,
        totalActive: response.totalActive,
        total: response.total,
      };
      await refreshData();
    }, "Failed to import MyUW exams. Please try again.");
    return result;
  };

  const parseMyUwExams = async (input: {
    text?: string;
    userTimezone?: string;
  }) => {
    let result: {
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
    } | null = null;
    await runAction(async () => {
      const response = await api.parseMyUwExams(input);
      result = {
        provider: response.provider,
        usedAi: response.usedAi,
        count: response.count,
        warnings: response.warnings || [],
        items: response.items || [],
      };
    }, "Failed to parse MyUW exam input.");
    return result;
  };

  const updateTaskStatus = async (taskId: string, status: Task["status"], submittedDate?: Date) => {
    await runAction(async () => {
      const updated = await api.updateTaskStatus(taskId, status, submittedDate?.toISOString());
      setTasks((prev) => prev.map((task) => (task.id === taskId ? toTask(updated) : task)));
    }, "Failed to update task status. Please try again.");
  };

  const updateTaskStep = async (taskId: string, stepId: string, completed: boolean) => {
    await runAction(async () => {
      const updated = await api.updateTaskStep(taskId, stepId, completed);
      setTasks((prev) => prev.map((task) => (task.id === taskId ? toTask(updated) : task)));
    }, "Failed to update task step. Please try again.");
  };

  const setExamReminder = async (examId: string, days: number, addToCalendar: boolean) => {
    await runAction(async () => {
      const updated = await api.setExamReminder(examId, days, addToCalendar);
      setExams((prev) => prev.map((exam) => (exam.id === examId ? toExam(updated) : exam)));
    }, "Failed to set exam reminder. Please try again.");
  };

  const setTaskReminder = async (taskId: string, days: number, addToCalendar: boolean) => {
    await runAction(async () => {
      const updated = await api.setTaskReminder(taskId, days, addToCalendar);
      setTasks((prev) => prev.map((task) => (task.id === taskId ? toTask(updated) : task)));
    }, "Failed to set task reminder. Please try again.");
  };

  const addCustomItem = async (item: Omit<CustomPlannerItem, "id">) => {
    await runAction(async () => {
      const created = await api.addCustomItem({
        ...item,
        date: item.date.toISOString(),
      });
      setCustomItems((prev) => [...prev, toCustomItem(created)]);
    }, "Failed to add custom item. Please try again.");
  };

  const deleteCustomItem = async (id: string) => {
    await runAction(async () => {
      await api.deleteCustomItem(id);
      setCustomItems((prev) => prev.filter((item) => item.id !== id));
    }, "Failed to delete custom item. Please try again.");
  };

  const value = useMemo(
    () => ({
      tasks,
      exams,
      customItems,
      syncSources,
      loading,
      error,
      searchQuery,
      setSearchQuery,
      clearError,
      refreshData,
      createTask,
      createExam,
      addSyncSource,
      deleteSyncSource,
      runAllSync,
      runSyncSource,
      rebuildSync,
      importCanvasJson,
      importMyUwExams,
      parseMyUwExams,
      updateTaskStatus,
      updateTaskStep,
      setExamReminder,
      setTaskReminder,
      addCustomItem,
      deleteCustomItem,
    }),
    [tasks, exams, customItems, syncSources, loading, error, searchQuery],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within AppProvider");
  }
  return context;
};
