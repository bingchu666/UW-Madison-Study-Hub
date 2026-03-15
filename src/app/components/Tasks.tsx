import { useState } from "react";
import { useAppContext } from "../context";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { ExternalLink, Clock } from "lucide-react";
import { useNavigate } from "react-router";
import { Task, TimeFilter, StatusFilter } from "../types";
import {
  formatAllDayLabel,
  formatLocalDate,
  formatLocalTime,
  getEventDeadlineDate,
  isAfterDays,
  isBetweenNowAndDays,
  isBetweenNowAndHours,
} from "../utils/time";
import { openExternalUrl } from "../utils/openExternal";

type PriorityMeta = {
  label: string;
  rank: number;
  className: string;
};

type TaskView = {
  task: Task;
  dueDate: Date;
  priority: PriorityMeta;
};

export default function Tasks() {
  const { tasks, loading, error, searchQuery } = useAppContext();
  const navigate = useNavigate();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Active");

  const now = new Date();
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const getTaskDueDate = (task: Task) => getEventDeadlineDate(task.dueDate, task.allDay, task.sourceDate);

  const getTaskPriority = (dueDate: Date): PriorityMeta => {
    if (dueDate < now) {
      return { label: "Past due", rank: 5, className: "bg-red-100 text-red-800 border-red-200" };
    }
    if (isBetweenNowAndHours(dueDate, 24, now)) {
      return { label: "Due in 24h", rank: 1, className: "bg-red-100 text-red-800 border-red-200" };
    }
    if (isBetweenNowAndDays(dueDate, 3, now)) {
      return { label: "Due soon", rank: 2, className: "bg-orange-100 text-orange-800 border-orange-200" };
    }
    if (isBetweenNowAndDays(dueDate, 7, now)) {
      return { label: "This week", rank: 3, className: "bg-yellow-100 text-yellow-800 border-yellow-200" };
    }
    return { label: "Upcoming", rank: 4, className: "bg-blue-100 text-blue-800 border-blue-200" };
  };

  const taskViews: TaskView[] = tasks
    .map((task) => {
      const dueDate = getTaskDueDate(task);
      return {
        task,
        dueDate,
        priority: getTaskPriority(dueDate),
      };
    })
    .filter(({ task, dueDate }) => {
      if (Number.isNaN(dueDate.getTime())) {
        return false;
      }

      let passesTimeFilter = true;
      if (timeFilter === "Upcoming") {
        passesTimeFilter = dueDate >= now;
      } else if (timeFilter === "Due in 24 hours") {
        passesTimeFilter = isBetweenNowAndHours(dueDate, 24, now);
      } else if (timeFilter === "This week") {
        passesTimeFilter = isBetweenNowAndDays(dueDate, 7, now);
      } else if (timeFilter === "Later") {
        passesTimeFilter = isAfterDays(dueDate, 7, now);
      }

      let passesStatusFilter = true;
      if (statusFilter === "Active") {
        passesStatusFilter = task.status === "Not started" || task.status === "In progress";
      } else if (statusFilter !== "All") {
        passesStatusFilter = task.status === statusFilter;
      }

      const matchesQuery =
        !normalizedQuery ||
        [task.courseCode, task.courseName, task.title, task.externalTool || ""]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return passesTimeFilter && passesStatusFilter && matchesQuery;
    });

  const statusPriority: Record<string, number> = {
    "Not started": 1,
    "In progress": 2,
    "Submitted": 3,
  };

  const sortUpcoming = (a: TaskView, b: TaskView) => {
    if (a.priority.rank !== b.priority.rank) {
      return a.priority.rank - b.priority.rank;
    }
    const statusA = statusPriority[a.task.status] || 4;
    const statusB = statusPriority[b.task.status] || 4;
    if (statusA !== statusB) {
      return statusA - statusB;
    }
    return a.dueDate.getTime() - b.dueDate.getTime();
  };

  const sortPast = (a: TaskView, b: TaskView) => {
    const statusA = statusPriority[a.task.status] || 4;
    const statusB = statusPriority[b.task.status] || 4;
    if (statusA !== statusB) {
      return statusA - statusB;
    }
    return b.dueDate.getTime() - a.dueDate.getTime();
  };

  const upcomingTasks = taskViews
    .filter((entry) => entry.dueDate >= now)
    .sort(sortUpcoming);

  const pastTasks = taskViews
    .filter((entry) => entry.dueDate < now)
    .sort(sortPast);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      "Not started": "outline",
      "In progress": "secondary",
      "Submitted": "default",
    };
    return variants[status] || "outline";
  };

  const renderRows = (entries: TaskView[]) =>
    entries.map(({ task, priority }) => (
      <TableRow
        key={task.id}
        className="cursor-pointer hover:bg-white/60 transition-all"
        onClick={() => navigate(`/tasks/${task.id}`)}
      >
        <TableCell>
          <Badge className="bg-[#c5050c] text-white hover:bg-[#c5050c]">{task.courseCode}</Badge>
        </TableCell>
        <TableCell>
          <div>
            <div className="font-medium">{task.title}</div>
            <div className="text-sm text-gray-500">{task.courseName}</div>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center text-sm">
            <Clock className="w-4 h-4 mr-2 text-gray-400" />
            <div>
              <div>{task.allDay && task.sourceDate ? formatAllDayLabel(task.sourceDate) : formatLocalDate(task.dueDate)}</div>
              <div className="text-gray-500">{task.allDay ? "All day" : formatLocalTime(task.dueDate)}</div>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className={`text-xs ${priority.className}`}>
            {priority.label}
          </Badge>
        </TableCell>
        <TableCell>
          {task.externalTool ? (
            task.externalUrl ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs border-gray-300"
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
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </TableCell>
        <TableCell>
          <Badge variant={getStatusBadge(task.status)}>{task.status}</Badge>
        </TableCell>
        <TableCell>
          <Button variant="ghost" size="sm" className="hover:bg-white/60">
            View
          </Button>
        </TableCell>
      </TableRow>
    ));

  if (loading) {
    return <div className="max-w-7xl mx-auto py-8 text-gray-600">Loading tasks...</div>;
  }

  if (error) {
    return <div className="max-w-7xl mx-auto py-8 text-red-700">{error}</div>;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Tasks</h1>
        <p className="text-gray-600">To-do list view: Upcoming first, Past at the bottom</p>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <Select value={timeFilter} onValueChange={(value) => setTimeFilter(value as TimeFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="Time filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Upcoming">Upcoming (To-do)</SelectItem>
              <SelectItem value="All">All</SelectItem>
              <SelectItem value="Due in 24 hours">Due in 24 hours</SelectItem>
              <SelectItem value="This week">This week</SelectItem>
              <SelectItem value="Later">Later</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="Status filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">Active (Not submitted)</SelectItem>
              <SelectItem value="All">All</SelectItem>
              <SelectItem value="Not started">Not started</SelectItem>
              <SelectItem value="In progress">In progress</SelectItem>
              <SelectItem value="Submitted">Submitted</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="backdrop-blur-xl bg-white/70 rounded-lg border border-white/20 shadow-lg">
        <div className="px-4 pt-4">
          <h2 className="text-lg font-semibold">Upcoming</h2>
          <p className="text-xs text-gray-500">Priority-ranked to-do items</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Course</TableHead>
              <TableHead>Assignment</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>External Tool</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {upcomingTasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                  No upcoming tasks in current filters
                </TableCell>
              </TableRow>
            ) : (
              renderRows(upcomingTasks)
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-6 backdrop-blur-xl bg-white/60 rounded-lg border border-white/20 shadow">
        <div className="px-4 pt-4">
          <h2 className="text-lg font-semibold">Past</h2>
          <p className="text-xs text-gray-500">Past tasks are separated at the bottom</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Course</TableHead>
              <TableHead>Assignment</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>External Tool</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pastTasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                  No past tasks in current filters
                </TableCell>
              </TableRow>
            ) : (
              renderRows(pastTasks)
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
