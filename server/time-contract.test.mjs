import assert from "node:assert/strict";
import test from "node:test";

import { __test } from "./index.js";

test("timed event keeps UTC timestamp and source timezone", () => {
  const start = new Date("2026-03-14T18:30:00.000Z");
  start.tz = "America/Chicago";
  const end = new Date("2026-03-14T19:30:00.000Z");
  end.tz = "America/Chicago";

  const meta = __test.parseEventTimeMeta({
    start,
    end,
    datetype: "date-time",
  });

  assert.equal(meta?.allDay, false);
  assert.equal(meta?.startsAtUtc, "2026-03-14T18:30:00.000Z");
  assert.equal(meta?.dueAtUtc, "2026-03-14T18:30:00.000Z");
  assert.equal(meta?.endsAtUtc, "2026-03-14T19:30:00.000Z");
  assert.equal(meta?.sourceTimezone, "America/Chicago");
  assert.equal(meta?.sourceDate, "2026-03-14");
});

test("all-day event pins stable UTC noon and keeps calendar date", () => {
  const start = new Date(2026, 2, 14, 0, 0, 0, 0);
  start.dateOnly = true;

  const meta = __test.parseEventTimeMeta({
    start,
    datetype: "date",
  });

  assert.equal(meta?.allDay, true);
  assert.equal(meta?.sourceDate, "2026-03-14");
  assert.equal(meta?.startsAtUtc, "2026-03-14T12:00:00.000Z");
  assert.equal(meta?.dueAtUtc, "2026-03-14T12:00:00.000Z");
});

test("DST boundary date key remains correct in America/Chicago", () => {
  const dstBefore = new Date("2026-03-08T07:30:00.000Z");
  const dstAfter = new Date("2026-03-08T08:30:00.000Z");
  assert.equal(__test.getSourceDateKey(dstBefore, "America/Chicago"), "2026-03-08");
  assert.equal(__test.getSourceDateKey(dstAfter, "America/Chicago"), "2026-03-08");
});

test("canvas office hour events are ignored but assignments are kept", () => {
  assert.equal(
    __test.isIgnoredCanvasEvent("Samto office hours for Geog 170", "Join Zoom meeting", ""),
    true,
  );
  assert.equal(__test.isIgnoredCanvasEvent("HW2: Probability", "Submit to Gradescope", ""), false);
});

test("external tool detection prefers known platforms", () => {
  assert.equal(
    __test.detectExternalTool({
      title: "HW2",
      description: "Please submit this on Gradescope",
      url: "",
    }),
    "Gradescope",
  );
  assert.equal(
    __test.detectExternalTool({
      title: "Lab",
      description: "Open assignment in Canvas",
      url: "https://canvas.wisc.edu/courses/123/assignments/456",
    }),
    "Canvas",
  );
});

test("short MyUW input infers current term year and noon anchor", () => {
  const parsed = __test.parseMyUwShortTextExams("cs 400 3.17 midterm", {
    now: new Date("2026-03-15T14:00:00.000Z"),
    userTimezone: "America/Chicago",
  });

  assert.equal(parsed.matchedAny, true);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].courseCode, "COMPSCI 400");
  assert.equal(parsed.items[0].startsAtUtc, "2026-03-17T17:00:00.000Z");
  assert.equal(parsed.items[0].time, "TBA");
  assert.equal(parsed.items[0].location, "TBA");
});

test("short MyUW input rejects passed month/day without explicit year", () => {
  const parsed = __test.parseMyUwShortTextExams("cs 400 3.01 midterm", {
    now: new Date("2026-03-15T14:00:00.000Z"),
    userTimezone: "America/Chicago",
  });

  assert.equal(parsed.matchedAny, true);
  assert.equal(parsed.items.length, 0);
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.errors[0].reason, "missing year");
});

test("short MyUW input respects explicit future year", () => {
  const parsed = __test.parseMyUwShortTextExams("cs 400 2027-03-01 midterm", {
    now: new Date("2026-03-15T14:00:00.000Z"),
    userTimezone: "America/Chicago",
  });

  assert.equal(parsed.matchedAny, true);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].startsAtUtc, "2027-03-01T18:00:00.000Z");
});

test("short parser handles non-ASCII separators used in copied text", () => {
  const parsed = __test.parseMyUwShortTextExams("cs 400 3·17 midterm", {
    now: new Date("2026-03-15T14:00:00.000Z"),
    userTimezone: "America/Chicago",
  });

  assert.equal(parsed.matchedAny, true);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].startsAtUtc, "2026-03-17T17:00:00.000Z");
});

test("MyUW merge key is stable for repeated imports", () => {
  const keyA = __test.makeMyUwExamMergeKey({
    courseCode: "COMPSCI 400",
    type: "Midterm",
    startsAtUtc: "2026-03-17T17:00:00.000Z",
    location: "Room A",
  });
  const keyB = __test.makeMyUwExamMergeKey({
    courseCode: "COMPSCI 400",
    type: "Midterm",
    startsAtUtc: "2026-03-17T17:00:00.000Z",
    location: "Room B",
  });
  assert.equal(keyA, keyB);
});

test("re-importing same short exam updates instead of creating duplicate", () => {
  const incoming = [
    {
      courseCode: "COMPSCI 400",
      courseName: "COMPSCI 400 (MyUW)",
      type: "Midterm",
      startsAtUtc: "2026-03-17T17:00:00.000Z",
      endsAtUtc: null,
      location: "TBA",
      time: "TBA",
    },
  ];

  const first = __test.mergeMyUwImportedExams({
    existingExams: [],
    incomingItems: incoming,
    now: new Date("2026-03-15T14:00:00.000Z"),
  });
  assert.equal(first.created, 1);
  assert.equal(first.updated, 0);
  assert.equal(first.totalActive, 1);
  assert.equal(first.exams.length, 1);

  const second = __test.mergeMyUwImportedExams({
    existingExams: first.exams,
    incomingItems: incoming,
    now: new Date("2026-03-15T15:00:00.000Z"),
  });
  assert.equal(second.created, 0);
  assert.equal(second.updated, 1);
  assert.equal(second.totalActive, 1);
  assert.equal(second.exams.length, 1);
});

test("structured MyUW schedule text with Chinese month and AM/PM parses exam rows", () => {
  const input =
    "COMP SCI 570: Introduction to Human-Computer Interaction\n" +
    "Weekly Meetings\n" +
    "LEC 001 MWF 11:00 \u4e0a\u5348 - 11:50 \u4e0a\u5348 Brogden Psychology Building Room 105\n" +
    "Exams\n" +
    "\u4e94\u6708 7, 10:05 \u4e0a\u5348 - 12:05 \u4e0b\u5348 - Location not specified\n" +
    "COMP SCI 540: Introduction to Artificial Intelligence\n" +
    "Exams\n" +
    "\u4e94\u6708 7, 12:25 \u4e0b\u5348 - 2:25 \u4e0b\u5348 - Location not specified\n" +
    "COMP SCI 400: Programming III\n" +
    "Exams\n" +
    "\u4e94\u6708 5, 5:05 \u4e0b\u5348 - 7:05 \u4e0b\u5348 - Location not specified\n" +
    "COMP SCI 320: Data Science Programming II\n" +
    "Exams\n" +
    "\u4e94\u6708 6, 2:45 \u4e0b\u5348 - 4:45 \u4e0b\u5348 - Location not specified\n";

  const items = __test.parseMyUwStructuredScheduleText(input, {
    now: new Date("2026-03-15T14:00:00.000Z"),
    userTimezone: "America/Chicago",
  });

  assert.equal(items.length, 4);
  assert.equal(items[0].type, "Final");
  assert.equal(items[0].location, "TBA");
  assert.equal(items[0].startsAtUtc, "2026-05-07T15:05:00.000Z");
  assert.equal(items[1].startsAtUtc, "2026-05-07T17:25:00.000Z");
  assert.equal(items[2].startsAtUtc, "2026-05-05T22:05:00.000Z");
  assert.equal(items[3].startsAtUtc, "2026-05-06T19:45:00.000Z");
});
