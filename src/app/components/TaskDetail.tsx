import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useAppContext } from "../context";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { ArrowLeft, ExternalLink, Clock, CheckCircle2, Bell } from "lucide-react";
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
import { Checkbox as DialogCheckbox } from "./ui/checkbox";
import { formatAllDayLabel, formatLocalFullDateTime, formatLocalTime } from "../utils/time";
import { openExternalUrl } from "../utils/openExternal";

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tasks, updateTaskStatus, updateTaskStep, setTaskReminder, loading, error } = useAppContext();
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [reminderDays, setReminderDays] = useState("1");
  const [addToCalendar, setAddToCalendar] = useState(false);

  const task = tasks.find((t) => t.id === id);

  if (loading) {
    return <div className="max-w-6xl mx-auto py-8 text-gray-600">Loading task...</div>;
  }

  if (error) {
    return <div className="max-w-6xl mx-auto py-8 text-red-700">{error}</div>;
  }

  if (!task) {
    return (
      <div className="max-w-5xl mx-auto">
        <Button variant="ghost" onClick={() => navigate("/tasks")} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Tasks
        </Button>
        <div className="text-center py-12">
          <p className="text-gray-500">Task not found</p>
        </div>
      </div>
    );
  }

  const handleMarkAsSubmitted = async () => {
    const now = new Date();
    await updateTaskStatus(task.id, "Submitted", now);
  };

  const handleStepToggle = async (stepId: string, completed: boolean) => {
    await updateTaskStep(task.id, stepId, completed);
  };

  const handleSetReminder = () => {
    setReminderDialogOpen(true);
  };

  const handleSaveReminder = async () => {
    await setTaskReminder(task.id, parseInt(reminderDays), addToCalendar);
    setReminderDialogOpen(false);
    setReminderDays("1");
    setAddToCalendar(false);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      "Not started": "outline",
      "In progress": "secondary",
      "Submitted": "default",
    };
    return variants[status] || "outline";
  };

  return (
    <div className="max-w-6xl mx-auto">
      <Button variant="ghost" onClick={() => navigate("/tasks")} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Tasks
      </Button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Badge className="bg-[#c5050c] text-white hover:bg-[#c5050c]">
            {task.courseCode}
          </Badge>
          <h1 className="text-3xl font-bold">{task.title}</h1>
        </div>
        <p className="text-gray-600 text-lg">{task.courseName}</p>
        <div className="flex items-center gap-2 mt-2 text-gray-600">
          <Clock className="w-4 h-4" />
          <span>
            Due: {task.allDay && task.sourceDate ? formatAllDayLabel(task.sourceDate) : formatLocalFullDateTime(task.dueDate)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side - Steps */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Assignment Workflow</CardTitle>
            </CardHeader>
            <CardContent>
              {task.steps && task.steps.length > 0 ? (
                <div className="space-y-4">
                  {task.steps.map((step, index) => (
                    <div
                      key={step.id}
                      className={`border rounded-lg p-4 transition-all backdrop-blur-sm shadow-sm ${
                        step.completed
                          ? "border-green-300/50 bg-green-50/60"
                          : "border-white/30 bg-white/40"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={step.id}
                          checked={step.completed}
                          onCheckedChange={(checked) =>
                            void handleStepToggle(step.id, checked as boolean)
                          }
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <label
                            htmlFor={step.id}
                            className="font-semibold text-lg cursor-pointer"
                          >
                            Step {index + 1}: {step.title}
                          </label>
                          <p className="text-gray-600 mt-1">{step.description}</p>
                          {step.link && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-3 border-white/40 hover:bg-white/60"
                              onClick={(e) => {
                                e.preventDefault();
                                openExternalUrl(step.link);
                              }}
                            >
                              <ExternalLink className="mr-2 h-4 w-4" />
                              {step.linkText || "Open Link"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No workflow steps available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Side - Status Panel */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">Current Status</p>
                <Badge variant={getStatusBadge(task.status)} className="text-base px-3 py-1">
                  {task.status}
                </Badge>
              </div>

              {task.status === "Submitted" ? (
                <div className="border border-green-300/50 bg-green-50/80 backdrop-blur-sm rounded-lg p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-green-700 mb-2">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-semibold">Submitted</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {task.submittedDate
                      ? `Today ${formatLocalTime(task.submittedDate)}`
                      : "Submitted"}
                  </p>
                  {task.externalTool && (
                    <div className="mt-3 pt-3 border-t border-green-200">
                      <p className="text-sm text-gray-600 mb-1">Submission via</p>
                      {task.externalUrl ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openExternalUrl(task.externalUrl)}
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          {task.externalTool}
                        </Button>
                      ) : (
                        <Badge variant="outline">
                          <ExternalLink className="w-3 h-3 mr-1" />
                          {task.externalTool}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-sm text-gray-600 mb-2">External Tool</p>
                    {task.externalTool ? (
                      task.externalUrl ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openExternalUrl(task.externalUrl)}
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          {task.externalTool}
                        </Button>
                      ) : (
                        <Badge variant="outline">
                          <ExternalLink className="w-3 h-3 mr-1" />
                          {task.externalTool}
                        </Badge>
                      )
                    ) : (
                      <span className="text-gray-400">None</span>
                    )}
                  </div>

                  <div className="pt-4 border-t space-y-3">
                    <Button
                      className="w-full bg-red-700 hover:bg-red-800"
                      onClick={() => void handleMarkAsSubmitted()}
                    >
                      Mark as Submitted
                    </Button>
                    <Button variant="outline" className="w-full" onClick={handleSetReminder}>
                      Set Reminder
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Reminder Dialog */}
      <Dialog open={reminderDialogOpen} onOpenChange={setReminderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Reminder</DialogTitle>
            <DialogDescription>
              Choose when you'd like to be reminded about this assignment
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="backdrop-blur-sm bg-gray-50/80 rounded-lg p-4 mb-4 border border-white/40">
              <div className="space-y-2 text-sm">
                <div className="flex items-center">
                  <Clock className="w-4 h-4 mr-2 text-gray-600" />
                  <span>
                    Due: {task.allDay && task.sourceDate ? formatAllDayLabel(task.sourceDate) : formatLocalFullDateTime(task.dueDate)}
                  </span>
                </div>
                {task.externalTool && (
                  <div className="flex items-center">
                    <ExternalLink className="w-4 h-4 mr-2 text-gray-600" />
                    <span>Submit via {task.externalTool}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="mb-3 block">Remind me</Label>
                <RadioGroup value={reminderDays} onValueChange={setReminderDays}>
                  <div className="flex items-center space-x-2 mb-2">
                    <RadioGroupItem value="1" id="reminder-1day" />
                    <Label htmlFor="reminder-1day" className="cursor-pointer">
                      1 day before
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 mb-2">
                    <RadioGroupItem value="3" id="reminder-3days" />
                    <Label htmlFor="reminder-3days" className="cursor-pointer">
                      3 days before
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="7" id="reminder-7days" />
                    <Label htmlFor="reminder-7days" className="cursor-pointer">
                      1 week before
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="flex items-center space-x-2">
                <DialogCheckbox
                  id="reminder-calendar"
                  checked={addToCalendar}
                  onCheckedChange={(checked) => setAddToCalendar(checked as boolean)}
                />
                <Label htmlFor="reminder-calendar" className="cursor-pointer">
                  Also add to my calendar
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminderDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveReminder()} className="bg-red-700 hover:bg-red-800">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
