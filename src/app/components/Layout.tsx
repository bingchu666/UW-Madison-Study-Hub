import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { Home, CheckSquare, Calendar, LayoutGrid, Search, User, Plus, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import uwLogo from "@/assets/255b6f0d4f200898c0161ce7819c2e4b1afac843.png";
import buckyBadger from "@/assets/efc4bf44a79ae7d745f21ee74034dc1d70a70728.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { useAppContext } from "../context";

const navItems = [
  { path: "/", label: "Home", icon: Home },
  { path: "/tasks", label: "Tasks", icon: CheckSquare },
  { path: "/exams", label: "Exams", icon: Calendar },
  { path: "/planner", label: "Planner", icon: LayoutGrid },
  { path: "/sync", label: "Sync", icon: RefreshCw },
];

export default function Layout() {
  const location = useLocation();
  const { searchQuery, setSearchQuery, error, clearError, refreshData, createTask, createExam } = useAppContext();

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [entityType, setEntityType] = useState<"Task" | "Exam">("Task");
  const [submitting, setSubmitting] = useState(false);

  const [taskCourseCode, setTaskCourseCode] = useState("");
  const [taskCourseName, setTaskCourseName] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskExternalTool, setTaskExternalTool] = useState("");

  const [examCourseCode, setExamCourseCode] = useState("");
  const [examCourseName, setExamCourseName] = useState("");
  const [examType, setExamType] = useState<"Midterm" | "Final" | "Quiz">("Midterm");
  const [examDate, setExamDate] = useState("");
  const [examTime, setExamTime] = useState("");
  const [examLocation, setExamLocation] = useState("");
  const [examCoursePageUrl, setExamCoursePageUrl] = useState("");

  const resetQuickAddForm = () => {
    setEntityType("Task");

    setTaskCourseCode("");
    setTaskCourseName("");
    setTaskTitle("");
    setTaskDueDate("");
    setTaskExternalTool("");

    setExamCourseCode("");
    setExamCourseName("");
    setExamType("Midterm");
    setExamDate("");
    setExamTime("");
    setExamLocation("");
    setExamCoursePageUrl("");
  };

  const canCreateTask = Boolean(taskCourseCode && taskCourseName && taskTitle && taskDueDate);
  const canCreateExam = Boolean(examCourseCode && examCourseName && examDate && examTime && examLocation);
  const canSubmit = entityType === "Task" ? canCreateTask : canCreateExam;

  const handleQuickAdd = async () => {
    setSubmitting(true);
    try {
      if (entityType === "Task") {
        if (!taskCourseCode || !taskCourseName || !taskTitle || !taskDueDate) {
          return;
        }

        await createTask({
          courseCode: taskCourseCode,
          courseName: taskCourseName,
          title: taskTitle,
          dueDate: new Date(taskDueDate),
          externalTool: taskExternalTool || undefined,
        });
      } else {
        if (!examCourseCode || !examCourseName || !examDate || !examTime || !examLocation) {
          return;
        }

        await createExam({
          courseCode: examCourseCode,
          courseName: examCourseName,
          type: examType,
          date: new Date(`${examDate}T00:00:00`),
          time: examTime,
          location: examLocation,
          coursePageUrl: examCoursePageUrl || undefined,
        });
      }

      setQuickAddOpen(false);
      resetQuickAddForm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-100 via-gray-50 to-red-50">
      <aside className="w-64 min-h-screen flex flex-col backdrop-blur-xl bg-white/70 border-r border-white/20 shadow-lg">
        <div className="p-6 border-b border-white/20">
          <div className="flex items-center gap-3 mb-2">
            <ImageWithFallback src={uwLogo} alt="UW-Madison Logo" className="w-32 h-auto object-contain" />
          </div>
          <div className="mt-2">
            <h1 className="text-xl font-semibold text-[#c5050c]">StudyHub</h1>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link key={item.path} to={item.path}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  className={`w-full justify-start transition-all duration-200 text-base ${
                    isActive
                      ? "bg-gradient-to-r from-red-50 to-red-100/50 text-[#c5050c] shadow-sm backdrop-blur-sm"
                      : "hover:bg-white/50 hover:backdrop-blur-sm"
                  }`}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  <span className="text-base font-medium">{item.label}</span>
                </Button>
              </Link>
            );
          })}
          <div className="flex justify-center pt-4">
            <ImageWithFallback src={buckyBadger} alt="Bucky Badger" className="w-24 h-auto object-contain" />
          </div>
        </nav>
        <div className="p-4 border-t border-white/20">
          <div className="text-xs text-gray-500 text-center">Spring 2026</div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="backdrop-blur-xl bg-white/60 border-b border-white/20 px-6 py-4 flex items-center justify-between shadow-sm gap-4">
          <div className="flex-1 max-w-xl">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search assignments, exams, courses..."
                className="pl-10 bg-white/60 backdrop-blur-sm border-white/40 focus:bg-white/80 transition-all"
              />
            </div>
          </div>
          <Button onClick={() => setQuickAddOpen(true)} className="bg-red-700 hover:bg-red-800">
            <Plus className="h-4 w-4 mr-2" />
            Quick Add
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="hover:bg-white/50 backdrop-blur-sm transition-all">
                <User className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="backdrop-blur-xl bg-white/95 border-white/40">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {error && (
          <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void refreshData()}>
                Retry
              </Button>
              <Button variant="ghost" size="sm" onClick={clearError}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-x-auto p-6">
          <Outlet />
        </main>
      </div>

      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Add</DialogTitle>
            <DialogDescription>Create a new task or exam without leaving the page.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="mb-2 block">Item Type</Label>
              <Select value={entityType} onValueChange={(value) => setEntityType(value as "Task" | "Exam")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Task">Task</SelectItem>
                  <SelectItem value="Exam">Exam</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {entityType === "Task" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-2 block">Course Code</Label>
                    <Input value={taskCourseCode} onChange={(e) => setTaskCourseCode(e.target.value)} placeholder="CS 540" />
                  </div>
                  <div>
                    <Label className="mb-2 block">Course Name</Label>
                    <Input value={taskCourseName} onChange={(e) => setTaskCourseName(e.target.value)} placeholder="Intro to AI" />
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block">Task Title</Label>
                  <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Homework 4" />
                </div>
                <div>
                  <Label className="mb-2 block">Due Time</Label>
                  <Input type="datetime-local" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-2 block">External Tool (optional)</Label>
                  <Input value={taskExternalTool} onChange={(e) => setTaskExternalTool(e.target.value)} placeholder="Canvas / Gradescope" />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-2 block">Course Code</Label>
                    <Input value={examCourseCode} onChange={(e) => setExamCourseCode(e.target.value)} placeholder="MATH 340" />
                  </div>
                  <div>
                    <Label className="mb-2 block">Course Name</Label>
                    <Input value={examCourseName} onChange={(e) => setExamCourseName(e.target.value)} placeholder="Linear Algebra" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-2 block">Exam Type</Label>
                    <Select value={examType} onValueChange={(value) => setExamType(value as "Midterm" | "Final" | "Quiz")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Midterm">Midterm</SelectItem>
                        <SelectItem value="Final">Final</SelectItem>
                        <SelectItem value="Quiz">Quiz</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-2 block">Date</Label>
                    <Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-2 block">Time</Label>
                    <Input value={examTime} onChange={(e) => setExamTime(e.target.value)} placeholder="2:30 PM - 4:00 PM" />
                  </div>
                  <div>
                    <Label className="mb-2 block">Location</Label>
                    <Input value={examLocation} onChange={(e) => setExamLocation(e.target.value)} placeholder="Humanities 3650" />
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block">Course Page URL (optional)</Label>
                  <Input value={examCoursePageUrl} onChange={(e) => setExamCoursePageUrl(e.target.value)} placeholder="https://..." />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickAddOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleQuickAdd()}
              disabled={submitting || !canSubmit}
              className="bg-red-700 hover:bg-red-800"
            >
              {submitting ? "Saving..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
