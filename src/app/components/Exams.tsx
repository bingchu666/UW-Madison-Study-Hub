import { useState } from "react";
import { useAppContext } from "../context";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
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
import { Calendar, Clock, MapPin, Bell, CalendarPlus, ExternalLink, BookOpen } from "lucide-react";
import { Exam } from "../types";
import { formatAllDayLabel, formatLocalDate, formatTimeRange, getEventDeadlineDate } from "../utils/time";
import { openExternalUrl } from "../utils/openExternal";

export default function Exams() {
  const { exams, setExamReminder, loading, error, searchQuery } = useAppContext();
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [reminderDays, setReminderDays] = useState("1");
  const [addToCalendar, setAddToCalendar] = useState(false);

  const now = new Date();
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchesExam = (exam: Exam) =>
    !normalizedQuery ||
    [exam.courseCode, exam.courseName, exam.type, exam.location]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);

  const upcomingExams = exams
    .filter((exam) => getEventDeadlineDate(exam.date, exam.allDay, exam.sourceDate) >= now && matchesExam(exam))
    .sort(
      (a, b) =>
        getEventDeadlineDate(a.date, a.allDay, a.sourceDate).getTime() -
        getEventDeadlineDate(b.date, b.allDay, b.sourceDate).getTime(),
    )
    .slice(0, 3);

  const allExams = exams
    .filter(matchesExam)
    .sort(
      (a, b) =>
        getEventDeadlineDate(a.date, a.allDay, a.sourceDate).getTime() -
        getEventDeadlineDate(b.date, b.allDay, b.sourceDate).getTime(),
    );

  const handleSetReminder = (exam: Exam) => {
    setSelectedExam(exam);
    setReminderDialogOpen(true);
  };

  const handleSaveReminder = async () => {
    if (selectedExam) {
      await setExamReminder(selectedExam.id, parseInt(reminderDays, 10), addToCalendar);
      setReminderDialogOpen(false);
      setReminderDays("1");
      setAddToCalendar(false);
    }
  };

  if (loading) {
    return <div className="max-w-7xl mx-auto py-8 text-gray-600">Loading exams...</div>;
  }

  if (error) {
    return <div className="max-w-7xl mx-auto py-8 text-red-700">{error}</div>;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Exams</h1>
        <p className="text-gray-600">
          Official exam times and locations from MyUW
        </p>
      </div>

      {/* Upcoming Exams Cards */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Upcoming Exams</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {upcomingExams.length === 0 ? (
            <p className="text-gray-500 col-span-3 text-center py-8">
              No upcoming exams
            </p>
          ) : (
            upcomingExams.map((exam) => (
              <Card key={exam.id} className="hover:border-red-300 transition-all hover:shadow-xl">
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <Badge className="bg-[#c5050c] text-white hover:bg-[#c5050c]">
                      {exam.courseCode}
                    </Badge>
                    <Badge variant="secondary">{exam.type}</Badge>
                  </div>
                  <CardTitle className="text-lg">{exam.courseName}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-gray-600 mb-4">
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-2" />
                      {exam.allDay && exam.sourceDate
                        ? formatAllDayLabel(exam.sourceDate)
                        : formatLocalDate(exam.date, { weekday: "long", month: "long", day: "numeric" })}
                    </div>
                    <div className="flex items-center">
                      <Clock className="w-4 h-4 mr-2" />
                      {formatTimeRange(exam.startsAtUtc, exam.endsAtUtc, exam.allDay, exam.sourceDate) || exam.time}
                    </div>
                    <div className="flex items-center">
                      <MapPin className="w-4 h-4 mr-2" />
                      {exam.location}
                    </div>
                  </div>
                  <div className="space-y-2">
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
                        onClick={() => handleSetReminder(exam)}
                      >
                        <Bell className="w-4 h-4 mr-2" />
                        Set Reminder
                      </Button>
                    )}
                    {exam.coursePageUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full border-white/40 hover:bg-white/60"
                        onClick={() => openExternalUrl(exam.coursePageUrl)}
                      >
                        <BookOpen className="w-4 h-4 mr-2" />
                        Open Course Page
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* All Exams Table */}
      <div>
        <h2 className="text-xl font-semibold mb-4">All Exams</h2>
        <div className="backdrop-blur-xl bg-white/70 rounded-lg border border-white/20 shadow-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead>Exam Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allExams.map((exam) => (
                <TableRow key={exam.id} className="hover:bg-white/60 transition-all">
                  <TableCell>
                    <div>
                      <Badge className="bg-[#c5050c] text-white hover:bg-[#c5050c] mb-1">
                        {exam.courseCode}
                      </Badge>
                      <div className="text-sm text-gray-600">{exam.courseName}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{exam.type}</Badge>
                  </TableCell>
                  <TableCell>
                    {exam.allDay && exam.sourceDate
                      ? formatAllDayLabel(exam.sourceDate)
                      : formatLocalDate(exam.date)}
                  </TableCell>
                  <TableCell>{formatTimeRange(exam.startsAtUtc, exam.endsAtUtc, exam.allDay, exam.sourceDate) || exam.time}</TableCell>
                  <TableCell>{exam.location}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {exam.reminderSet ? (
                        <Badge variant="outline" className="text-green-700 border-green-300">
                          <Bell className="w-3 h-3 mr-1" />
                          Set
                        </Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSetReminder(exam)}
                        >
                          Set Reminder
                        </Button>
                      )}
                      <Button variant="ghost" size="sm">
                        <CalendarPlus className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Reminder Dialog */}
      <Dialog open={reminderDialogOpen} onOpenChange={setReminderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Set reminder for {selectedExam?.courseCode} {selectedExam?.type}
            </DialogTitle>
            <DialogDescription>
              Choose when you'd like to be reminded about this exam
            </DialogDescription>
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
                    <MapPin className="w-4 h-4 mr-2 text-gray-600" />
                    <span>{selectedExam.location}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="mb-3 block">Remind me</Label>
                  <RadioGroup value={reminderDays} onValueChange={setReminderDays}>
                    <div className="flex items-center space-x-2 mb-2">
                      <RadioGroupItem value="1" id="1day" />
                      <Label htmlFor="1day" className="cursor-pointer">
                        1 day before
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 mb-2">
                      <RadioGroupItem value="3" id="3days" />
                      <Label htmlFor="3days" className="cursor-pointer">
                        3 days before
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="7" id="7days" />
                      <Label htmlFor="7days" className="cursor-pointer">
                        1 week before
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="calendar"
                    checked={addToCalendar}
                    onCheckedChange={(checked) => setAddToCalendar(checked as boolean)}
                  />
                  <Label htmlFor="calendar" className="cursor-pointer">
                    Also add to my calendar
                  </Label>
                </div>
              </div>
            </div>
          )}
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
