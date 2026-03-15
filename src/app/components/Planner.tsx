import { useState } from "react";
import { useAppContext } from "../context";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Clock, MapPin, FileText, Plus, X, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { startOfWeek, addDays, addWeeks, format } from "date-fns";
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
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { CustomItemType } from "../types";
import {
  formatAllDayLabel,
  formatEnglishDayNumber,
  formatEnglishShortWeekday,
  formatLocalDate,
  formatLocalTime,
  formatTimeRange,
  isSameLocalDay,
  isSameLocalDayForEvent,
} from "../utils/time";
import { openExternalUrl } from "../utils/openExternal";

export default function Planner() {
  const { tasks, exams, customItems, addCustomItem, deleteCustomItem, loading, error, searchQuery } = useAppContext();
  const navigate = useNavigate();
  const [customItemDialogOpen, setCustomItemDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [newItemType, setNewItemType] = useState<CustomItemType>("Study Block");
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [newItemTime, setNewItemTime] = useState("");
  const [visibleWeekAnchor, setVisibleWeekAnchor] = useState(new Date());

  const now = new Date();
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const weekStart = startOfWeek(visibleWeekAnchor, { weekStartsOn: 0 }); // Sunday
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = weekDays[6];
  const weekRangeLabel = `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`;

  const getItemsForDay = (day: Date) => {
    const dayTasks = tasks.filter(
      (task) =>
        isSameLocalDayForEvent(task.dueDate, day, task.allDay, task.sourceDate) &&
        task.status !== "Submitted" &&
        (!normalizedQuery ||
          [task.courseCode, task.courseName, task.title].join(" ").toLowerCase().includes(normalizedQuery)),
    );
    const dayExams = exams.filter(
      (exam) =>
        isSameLocalDayForEvent(exam.date, day, exam.allDay, exam.sourceDate) &&
        (!normalizedQuery ||
          [exam.courseCode, exam.courseName, exam.type].join(" ").toLowerCase().includes(normalizedQuery)),
    );
    const dayCustomItems = customItems.filter(
      (item) =>
        isSameLocalDay(item.date, day) &&
        (!normalizedQuery || [item.type, item.title, item.description || ""].join(" ").toLowerCase().includes(normalizedQuery)),
    );

    return {
      tasks: dayTasks,
      exams: dayExams,
      customItems: dayCustomItems,
    };
  };

  const handleAddCustomItem = (day: Date) => {
    setSelectedDate(day);
    setCustomItemDialogOpen(true);
  };

  const handleSaveCustomItem = async () => {
    if (selectedDate && newItemTitle.trim()) {
      await addCustomItem({
        type: newItemType,
        title: newItemTitle,
        description: newItemDescription,
        date: selectedDate,
        time: newItemTime || undefined,
        color: getCustomItemColor(newItemType),
      });
      setCustomItemDialogOpen(false);
      setNewItemTitle("");
      setNewItemDescription("");
      setNewItemTime("");
      setNewItemType("Study Block");
    }
  };

  const getCustomItemColor = (type: CustomItemType) => {
    switch (type) {
      case "Study Block":
        return "blue";
      case "Personal Reminder":
        return "yellow";
      case "Custom Event":
        return "green";
      default:
        return "gray";
    }
  };

  const getCustomItemColorClasses = (color?: string) => {
    switch (color) {
      case "blue":
        return "bg-blue-50/60 border-blue-300/50 hover:border-blue-500 hover:bg-blue-50/80";
      case "yellow":
        return "bg-yellow-50/60 border-yellow-300/50 hover:border-yellow-500 hover:bg-yellow-50/80";
      case "green":
        return "bg-green-50/60 border-green-300/50 hover:border-green-500 hover:bg-green-50/80";
      default:
        return "bg-gray-50/60 border-gray-300/50 hover:border-gray-500 hover:bg-gray-50/80";
    }
  };

  if (loading) {
    return <div className="max-w-7xl mx-auto py-8 text-gray-600">Loading planner...</div>;
  }

  if (error) {
    return <div className="max-w-7xl mx-auto py-8 text-red-700">{error}</div>;
  }

  return (
    <div className="max-w-7xl mx-auto pb-24">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Planner</h1>
          <p className="text-gray-600">
            Weekly overview combining assignments, exams, and custom items
          </p>
        </div>
        <Button
          onClick={() => handleAddCustomItem(visibleWeekAnchor)}
          className="bg-red-700 hover:bg-red-800"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Custom Item
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setVisibleWeekAnchor((prev) => addWeeks(prev, -1))}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Previous Week
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setVisibleWeekAnchor(new Date())}
        >
          <RotateCcw className="w-4 h-4 mr-1" />
          This Week
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setVisibleWeekAnchor((prev) => addWeeks(prev, 1))}
        >
          Next Week
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
        <p className="text-sm text-gray-600 ml-2">{weekRangeLabel}</p>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[980px] grid-cols-7 gap-4">
          {weekDays.map((day) => {
            const { tasks: dayTasks, exams: dayExams, customItems: dayCustomItems } = getItemsForDay(day);
            const isToday = isSameLocalDay(day, now);

            return (
              <div key={day.toISOString()}>
                <div
                  className={`text-center mb-3 pb-2 border-b-2 ${
                    isToday ? "border-red-700" : "border-gray-200"
                  }`}
                >
                  <div
                    className={`text-sm font-medium ${
                      isToday ? "text-red-700" : "text-gray-600"
                    }`}
                  >
                    {formatEnglishShortWeekday(day)}
                  </div>
                  <div
                    className={`text-2xl font-bold ${
                      isToday ? "text-red-700" : "text-gray-900"
                    }`}
                  >
                    {formatEnglishDayNumber(day)}
                  </div>
                </div>

                <div className="space-y-2">
                  {/* Exams */}
                  {dayExams.map((exam) => (
                    <Card
                      key={exam.id}
                      className="bg-purple-50/60 border-purple-300/50 cursor-pointer hover:border-purple-500 hover:bg-purple-50/80 transition-all backdrop-blur-sm shadow-sm"
                      onClick={() => navigate("/exams")}
                    >
                      <CardContent className="p-3">
                        <Badge className="bg-purple-600 hover:bg-purple-600 mb-2 text-xs">
                          {exam.courseCode}
                        </Badge>
                        <div className="text-sm font-semibold mb-1">
                          {exam.type}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center text-xs text-gray-600">
                            <Clock className="w-3 h-3 mr-1" />
                            {formatTimeRange(exam.startsAtUtc, exam.endsAtUtc, exam.allDay, exam.sourceDate) || exam.time}
                          </div>
                          <div className="flex items-center text-xs text-gray-600">
                            <MapPin className="w-3 h-3 mr-1" />
                            <span className="truncate">{exam.location}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                {/* Tasks */}
                {dayTasks.map((task) => (
                  <Card
                    key={task.id}
                    className="bg-red-50/60 border-red-200/50 cursor-pointer hover:border-red-400 hover:bg-red-50/80 transition-all backdrop-blur-sm shadow-sm"
                    onClick={() => navigate(`/tasks/${task.id}`)}
                  >
                    <CardContent className="p-3">
                      <Badge className="bg-[#c5050c] text-white hover:bg-[#c5050c] mb-2 text-xs">
                        {task.courseCode}
                      </Badge>
                      <div className="text-sm font-semibold mb-1 line-clamp-2">
                        {task.title}
                      </div>
                      <div className="flex items-center text-xs text-gray-600">
                        <FileText className="w-3 h-3 mr-1" />
                        Due {task.allDay && task.sourceDate ? formatAllDayLabel(task.sourceDate) : formatLocalTime(task.dueDate)}
                      </div>
                      {task.externalTool && (
                        task.externalUrl ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 h-6 px-2 text-xs border-gray-300"
                            onClick={(e) => {
                              e.stopPropagation();
                              openExternalUrl(task.externalUrl);
                            }}
                          >
                            {task.externalTool}
                          </Button>
                        ) : (
                          <Badge variant="outline" className="mt-2 text-xs border-gray-300">
                            {task.externalTool}
                          </Badge>
                        )
                      )}
                    </CardContent>
                  </Card>
                ))}

                {/* Custom Items */}
                {dayCustomItems.map((item) => (
                  <Card
                    key={item.id}
                    className={`cursor-pointer transition-all backdrop-blur-sm shadow-sm ${getCustomItemColorClasses(item.color)}`}
                  >
                    <CardContent className="p-3 relative">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-1 right-1 h-6 w-6 p-0 hover:bg-white/60"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteCustomItem(item.id);
                        }}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                      <Badge variant="outline" className="mb-2 text-xs border-gray-400">
                        {item.type}
                      </Badge>
                      <div className="text-sm font-semibold mb-1 line-clamp-2 pr-6">
                        {item.title}
                      </div>
                      {item.time && (
                        <div className="flex items-center text-xs text-gray-600">
                          <Clock className="w-3 h-3 mr-1" />
                          {item.time}
                        </div>
                      )}
                      {item.description && (
                        <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {item.description}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}

                {/* Add custom item button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-dashed border-gray-300 hover:bg-white/60 text-xs"
                  onClick={() => handleAddCustomItem(day)}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add
                </Button>

                {/* Empty state */}
                {dayTasks.length === 0 && dayExams.length === 0 && dayCustomItems.length === 0 && (
                  <div className="text-center text-gray-400 text-sm py-4">
                    No items
                  </div>
                )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom Item Dialog */}
      <Dialog open={customItemDialogOpen} onOpenChange={setCustomItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Item</DialogTitle>
            <DialogDescription>
              Create a personal study block, reminder, or custom event
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="item-type" className="mb-2 block">
                Type
              </Label>
              <Select value={newItemType} onValueChange={(value) => setNewItemType(value as CustomItemType)}>
                <SelectTrigger id="item-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Study Block">Study Block</SelectItem>
                  <SelectItem value="Personal Reminder">Personal Reminder</SelectItem>
                  <SelectItem value="Custom Event">Custom Event</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="item-title" className="mb-2 block">
                Title *
              </Label>
              <Input
                id="item-title"
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                placeholder="e.g., Study for CS 540 midterm"
              />
            </div>

            <div>
              <Label htmlFor="item-time" className="mb-2 block">
                Time (optional)
              </Label>
              <Input
                id="item-time"
                type="time"
                value={newItemTime}
                onChange={(e) => setNewItemTime(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="item-description" className="mb-2 block">
                Description (optional)
              </Label>
              <Textarea
                id="item-description"
                value={newItemDescription}
                onChange={(e) => setNewItemDescription(e.target.value)}
                placeholder="Add notes or details..."
                rows={3}
              />
            </div>

            {selectedDate && (
              <div className="backdrop-blur-sm bg-gray-50/80 rounded-lg p-3 border border-white/40">
                <p className="text-sm text-gray-600">
                  Date: <span className="font-medium">{formatLocalDate(selectedDate, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomItemDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleSaveCustomItem()}
              disabled={!newItemTitle.trim()}
              className="bg-red-700 hover:bg-red-800"
            >
              Add Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
