import { useState } from "react";
import { useAppContext } from "../context";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ExternalLink, Calendar, Clock, Bell } from "lucide-react";
import { useNavigate } from "react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Checkbox } from "./ui/checkbox";
import { Task, Exam } from "../types";
import {
  formatAllDayLabel,
  getEventDeadlineDate,
  formatLocalDate,
  formatLocalFullDateTime,
  formatTimeRange,
  getLocalWeekEnd,
  isBetweenNowAndDays,
} from "../utils/time";
import { openExternalUrl } from "../utils/openExternal";

export default function Home() {
  const { tasks, exams, setTaskReminder, setExamReminder, loading, error, searchQuery } = useAppContext();
  const navigate = useNavigate();
  const [taskReminderDialogOpen, setTaskReminderDialogOpen] = useState(false);
  const [examReminderDialogOpen, setExamReminderDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [reminderDays, setReminderDays] = useState("1");
  const [addToCalendar, setAddToCalendar] = useState(false);

  const now = new Date();
  const weekEnd = getLocalWeekEnd(now);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const matchesTask = (task: Task) =>
    !normalizedQuery ||
    [task.courseCode, task.courseName, task.title, task.externalTool || ""]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);

  const matchesExam = (exam: Exam) =>
    !normalizedQuery ||
    [exam.courseCode, exam.courseName, exam.type, exam.location]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);

  const thisWeekTasks = tasks
    .filter(
      (task) =>
        task.status !== "Submitted" &&
        getEventDeadlineDate(task.dueDate, task.allDay, task.sourceDate) >= now &&
        getEventDeadlineDate(task.dueDate, task.allDay, task.sourceDate) <= weekEnd &&
        matchesTask(task),
    )
    .sort(
      (a, b) =>
        getEventDeadlineDate(a.dueDate, a.allDay, a.sourceDate).getTime() -
        getEventDeadlineDate(b.dueDate, b.allDay, b.sourceDate).getTime(),
    )
    .slice(0, 6);

  const activeTasks = tasks
    .filter((task) => task.status !== "Submitted" && matchesTask(task))
    .sort((a, b) => {
      const dueA = getEventDeadlineDate(a.dueDate, a.allDay, a.sourceDate);
      const dueB = getEventDeadlineDate(b.dueDate, b.allDay, b.sourceDate);
      const upcomingA = dueA >= now;
      const upcomingB = dueB >= now;
      if (upcomingA !== upcomingB) {
        return upcomingA ? -1 : 1;
      }
      if (upcomingA) {
        return dueA.getTime() - dueB.getTime();
      }
      return dueB.getTime() - dueA.getTime();
    })
    .slice(0, 6);

  const taskPreview = thisWeekTasks.length > 0 ? thisWeekTasks : activeTasks;
  const taskCardTitle = thisWeekTasks.length > 0 ? "This Week's Tasks" : "To-do Tasks";

  const upcomingExams = exams
    .filter((exam) => getEventDeadlineDate(exam.date, exam.allDay, exam.sourceDate) >= now && matchesExam(exam))
    .sort(
      (a, b) =>
        getEventDeadlineDate(a.date, a.allDay, a.sourceDate).getTime() -
        getEventDeadlineDate(b.date, b.allDay, b.sourceDate).getTime(),
    )
    .slice(0, 3);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      "Not started": "outline",
      "In progress": "secondary",
      Submitted: "default",
    };
    return variants[status] || "outline";
  };

  const handleSetTaskReminder = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTask(task);
    setTaskReminderDialogOpen(true);
  };

  const handleSetExamReminder = (exam: Exam, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedExam(exam);
    setExamReminderDialogOpen(true);
  };

  const handleSaveTaskReminder = async () => {
    if (!selectedTask) {
      return;
    }

    await setTaskReminder(selectedTask.id, parseInt(reminderDays, 10), addToCalendar);
    setTaskReminderDialogOpen(false);
    setReminderDays("1");
    setAddToCalendar(false);
  };

  const handleSaveExamReminder = async () => {
    if (!selectedExam) {
      return;
    }

    await setExamReminder(selectedExam.id, parseInt(reminderDays, 10), addToCalendar);
    setExamReminderDialogOpen(false);
    setReminderDays("1");
    setAddToCalendar(false);
  };

  const assignmentsDueThisWeek = thisWeekTasks.length;
  const examsNextWeek = exams.filter((exam) =>
    isBetweenNowAndDays(getEventDeadlineDate(exam.date, exam.allDay, exam.sourceDate), 7, now),
  ).length;

  if (loading) {
    return <div className="max-w-7xl mx-auto py-8 text-gray-600">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="max-w-7xl mx-auto py-8 text-red-700">{error}</div>;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Welcome back!</h1>
        <p className="text-gray-600">Here&apos;s your weekly overview</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{taskCardTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {taskPreview.length === 0 ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-gray-500">No active tasks yet</p>
                <Button
                  variant="outline"
                  className="border-white/40 hover:bg-white/60"
                  onClick={() => navigate("/sync")}
                >
                  Open Sync Center
                </Button>
              </div>
            ) : (
              taskPreview.map((task) => (
                <div
                  key={task.id}
                  onClick={() => navigate(`/tasks/${task.id}`)}
                  className="border border-white/30 rounded-lg p-4 hover:border-red-300 hover:bg-white/60 transition-all cursor-pointer backdrop-blur-sm bg-white/40 shadow-sm"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-[#c5050c] text-white hover:bg-[#c5050c]">{task.courseCode}</Badge>
                      {task.externalTool && (
                        task.externalUrl ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-xs border-gray-300"
                            onClick={(e) => {
                              e.stopPropagation();
                              openExternalUrl(task.externalUrl);
                            }}
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            {task.externalTool}
                          </Button>
                        ) : (
                          <Badge variant="outline" className="text-xs border-gray-300">
                            <ExternalLink className="w-3 h-3 mr-1" />
                            {task.externalTool}
                          </Badge>
                        )
                      )}
                    </div>
                    <Badge variant={getStatusBadge(task.status)}>{task.status}</Badge>
                  </div>
                  <h3 className="font-semibold mb-1">{task.title}</h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center text-sm text-gray-600">
                      <Clock className="w-4 h-4 mr-1" />
                      {task.allDay && task.sourceDate
                        ? formatAllDayLabel(task.sourceDate)
                        : formatLocalFullDateTime(task.dueDate)}
                    </div>
                    {task.reminderSet ? (
                      <Badge variant="outline" className="text-green-700 border-green-300">
                        <Bell className="w-3 h-3 mr-1" />
                        Set
                      </Badge>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="hover:bg-white/60 text-xs"
                        onClick={(e) => handleSetTaskReminder(task, e)}
                      >
                        <Bell className="w-3 h-3 mr-1" />
                        Remind
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
            <Button
              variant="outline"
              className="w-full mt-4 border-white/40 hover:bg-white/60 backdrop-blur-sm"
              onClick={() => navigate("/tasks")}
            >
              View All Tasks
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Exams</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingExams.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No upcoming exams</p>
            ) : (
              upcomingExams.map((exam) => (
                <div
                  key={exam.id}
                  className="border border-white/30 rounded-lg p-4 hover:border-red-300 hover:bg-white/60 transition-all backdrop-blur-sm bg-white/40 shadow-sm"
                >
                  <div className="flex items-start justify-between mb-2">
                    <Badge className="bg-[#c5050c] text-white hover:bg-[#c5050c]">{exam.courseCode}</Badge>
                    <Badge variant="secondary">{exam.type}</Badge>
                  </div>
                  <h3 className="font-semibold mb-2">{exam.courseName}</h3>
                  <div className="space-y-1 text-sm text-gray-600 mb-3">
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-2" />
                      {exam.allDay && exam.sourceDate
                        ? formatAllDayLabel(exam.sourceDate)
                        : formatLocalDate(exam.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                    </div>
                    <div className="flex items-center">
                      <Clock className="w-4 h-4 mr-2" />
                      {formatTimeRange(exam.startsAtUtc, exam.endsAtUtc, exam.allDay, exam.sourceDate) || exam.time}
                    </div>
                    <div className="flex items-center">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      {exam.location}
                    </div>
                  </div>
                  {exam.reminderSet ? (
                    <div className="flex items-center gap-2 text-green-700 bg-green-50/80 backdrop-blur-sm rounded-lg px-3 py-2">
                      <Bell className="w-4 h-4" />
                      <span className="text-sm font-medium">Reminder set</span>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-white/40 hover:bg-white/60"
                      onClick={(e) => handleSetExamReminder(exam, e)}
                    >
                      <Bell className="w-4 h-4 mr-2" />
                      Set Reminder
                    </Button>
                  )}
                </div>
              ))
            )}
            <Button
              variant="outline"
              className="w-full mt-4 border-white/40 hover:bg-white/60 backdrop-blur-sm"
              onClick={() => navigate("/exams")}
            >
              View All Exams
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardContent className="py-4">
          <p className="text-center text-gray-600">
            <span className="font-semibold text-red-700">{assignmentsDueThisWeek}</span> assignments due this week
            {" · "}
            <span className="font-semibold text-red-700">{examsNextWeek}</span> exam{examsNextWeek !== 1 ? "s" : ""} next week
          </p>
        </CardContent>
      </Card>

      <Dialog open={taskReminderDialogOpen} onOpenChange={setTaskReminderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Set reminder for {selectedTask?.courseCode} - {selectedTask?.title}
            </DialogTitle>
            <DialogDescription>Choose when you&apos;d like to be reminded about this assignment</DialogDescription>
          </DialogHeader>
          {selectedTask && (
            <div className="py-4">
              <div className="backdrop-blur-sm bg-gray-50/80 rounded-lg p-4 mb-4 border border-white/40">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 mr-2 text-gray-600" />
                    <span>
                      Due:{" "}
                      {selectedTask.allDay && selectedTask.sourceDate
                        ? formatAllDayLabel(selectedTask.sourceDate)
                        : formatLocalFullDateTime(selectedTask.dueDate)}
                    </span>
                  </div>
                  {selectedTask.externalTool && (
                    <div className="flex items-center">
                      <ExternalLink className="w-4 h-4 mr-2 text-gray-600" />
                      {selectedTask.externalUrl ? (
                        <button
                          type="button"
                          className="text-red-700 underline underline-offset-2"
                          onClick={() => openExternalUrl(selectedTask.externalUrl)}
                        >
                          Submit via {selectedTask.externalTool}
                        </button>
                      ) : (
                        <span>Submit via {selectedTask.externalTool}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="mb-3 block">Remind me</Label>
                  <RadioGroup value={reminderDays} onValueChange={setReminderDays}>
                    <div className="flex items-center space-x-2 mb-2">
                      <RadioGroupItem value="1" id="task-1day" />
                      <Label htmlFor="task-1day" className="cursor-pointer">
                        1 day before
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 mb-2">
                      <RadioGroupItem value="3" id="task-3days" />
                      <Label htmlFor="task-3days" className="cursor-pointer">
                        3 days before
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="7" id="task-7days" />
                      <Label htmlFor="task-7days" className="cursor-pointer">
                        1 week before
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="task-calendar"
                    checked={addToCalendar}
                    onCheckedChange={(checked) => setAddToCalendar(checked as boolean)}
                  />
                  <Label htmlFor="task-calendar" className="cursor-pointer">
                    Also add to my calendar
                  </Label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskReminderDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveTaskReminder()} className="bg-red-700 hover:bg-red-800">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={examReminderDialogOpen} onOpenChange={setExamReminderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Set reminder for {selectedExam?.courseCode} {selectedExam?.type}
            </DialogTitle>
            <DialogDescription>Choose when you&apos;d like to be reminded about this exam</DialogDescription>
          </DialogHeader>
          {selectedExam && (
            <div className="py-4">
              <div className="backdrop-blur-sm bg-gray-50/80 rounded-lg p-4 mb-4 border border-white/40">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 mr-2 text-gray-600" />
                    <span>
                      {selectedExam.allDay && selectedExam.sourceDate
                        ? formatAllDayLabel(selectedExam.sourceDate)
                        : formatLocalDate(selectedExam.date, {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 mr-2 text-gray-600" />
                    <span>{formatTimeRange(selectedExam.startsAtUtc, selectedExam.endsAtUtc, selectedExam.allDay, selectedExam.sourceDate)}</span>
                  </div>
                  <div className="flex items-center">
                    <ExternalLink className="w-4 h-4 mr-2 text-gray-600" />
                    <span>{selectedExam.location}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="mb-3 block">Remind me</Label>
                  <RadioGroup value={reminderDays} onValueChange={setReminderDays}>
                    <div className="flex items-center space-x-2 mb-2">
                      <RadioGroupItem value="1" id="exam-1day" />
                      <Label htmlFor="exam-1day" className="cursor-pointer">
                        1 day before
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 mb-2">
                      <RadioGroupItem value="3" id="exam-3days" />
                      <Label htmlFor="exam-3days" className="cursor-pointer">
                        3 days before
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="7" id="exam-7days" />
                      <Label htmlFor="exam-7days" className="cursor-pointer">
                        1 week before
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="exam-calendar"
                    checked={addToCalendar}
                    onCheckedChange={(checked) => setAddToCalendar(checked as boolean)}
                  />
                  <Label htmlFor="exam-calendar" className="cursor-pointer">
                    Also add to my calendar
                  </Label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExamReminderDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveExamReminder()} className="bg-red-700 hover:bg-red-800">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
