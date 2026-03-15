import cors from "cors";
import express from "express";
import { promises as fs } from "node:fs";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import ical from "node-ical";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadLocalEnv = () => {
  const candidates = [path.join(__dirname, "..", ".env.local"), path.join(process.cwd(), ".env.local")];
  const envFile = candidates.find((item) => existsSync(item));
  if (!envFile) {
    return;
  }

  const raw = readFileSync(envFile, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }
    const key = match[1];
    if (process.env[key] !== undefined) {
      continue;
    }
    let value = match[2] || "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
};

loadLocalEnv();

const DATA_FILE = path.join(__dirname, "data", "store.json");
const DIST_DIR = path.join(__dirname, "..", "dist");
const PORT = Number(process.env.PORT || 4000);
const AUTO_SYNC_INTERVAL_MS = Number(process.env.AUTO_SYNC_INTERVAL_MS || 15 * 60 * 1000);
const DEFAULT_MYUW_TIMEZONE = "America/Chicago";
const MYUW_STALE_WINDOW_DAYS = 90;
const DEEPSEEK_API_BASE = String(process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com").replace(/\/+$/g, "");
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const ENGLISH_MONTH_TO_NUMBER = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const app = express();
if (process.env.NODE_ENV !== "production") {
  app.use(cors());
}
app.use(express.json());

let isAutoSyncRunning = false;

const ensureStoreShape = (store) => ({
  tasks: Array.isArray(store.tasks) ? store.tasks : [],
  exams: Array.isArray(store.exams) ? store.exams : [],
  customItems: Array.isArray(store.customItems) ? store.customItems : [],
  syncSources: Array.isArray(store.syncSources) ? store.syncSources : [],
});

const readStore = async () => {
  const raw = await fs.readFile(DATA_FILE, "utf8");
  return ensureStoreShape(JSON.parse(raw));
};

const writeStore = async (data) => {
  await fs.writeFile(DATA_FILE, `${JSON.stringify(ensureStoreShape(data), null, 2)}\n`, "utf8");
};

const updateStore = async (updater) => {
  const store = await readStore();
  const nextStore = updater(store);
  await writeStore(nextStore);
  return nextStore;
};

const notFound = (res, entity = "Record") => res.status(404).json({ error: `${entity} not found` });
const badRequest = (res, message) => res.status(400).json({ error: message });
const isValidIsoDate = (value) => {
  if (!value || typeof value !== "string") {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
};

const makeSyncTaskId = (sourceId, event) => {
  const basis = `${event.uid || "no-uid"}-${event.start?.toISOString?.() || "no-start"}-${event.summary || "no-summary"}`;
  const digest = crypto.createHash("sha1").update(basis).digest("hex");
  return `sync-${sourceId}-${digest.slice(0, 24)}`;
};

const makeManualImportTaskId = (item) => {
  const key = `${item.courseCode}|${item.courseName}|${item.title}|${item.dueDate}`;
  return `import-${crypto.createHash("sha1").update(key).digest("hex").slice(0, 16)}`;
};
const makeMyUwExamMergeKey = (item) => {
  const courseCode = String(item?.courseCode || "")
    .trim()
    .toUpperCase();
  const type = String(item?.type || "")
    .trim()
    .toLowerCase();
  const startsAtUtc = String(item?.startsAtUtc || item?.date || "").trim();
  if (!courseCode || !type || !startsAtUtc) {
    return "";
  }
  return `${courseCode}|${type}|${startsAtUtc}`;
};
const makeMyUwExamId = (item) => {
  const key = makeMyUwExamMergeKey(item) || `${item.courseCode}|${item.type}|${item.startsAtUtc || item.date || ""}`;
  return `myuw-exam-${crypto.createHash("sha1").update(key).digest("hex").slice(0, 20)}`;
};
const makeSyncExamId = (sourceId, event) => {
  const basis = `${event.uid || "no-uid"}-${event.start?.toISOString?.() || "no-start"}-${event.summary || "no-summary"}`;
  const digest = crypto.createHash("sha1").update(`exam-${basis}`).digest("hex");
  return `sync-exam-${sourceId}-${digest.slice(0, 24)}`;
};

const isLegacySeedTask = (task) => /^\d+$/.test(String(task?.id || ""));
const isLegacySeedExam = (exam) => /^e\d+$/.test(String(exam?.id || ""));
const isSyncedTask = (task) => String(task?.id || "").startsWith("sync-") || task?.externalTool === "Canvas Sync";
const isSyncedExam = (exam) => String(exam?.id || "").startsWith("sync-exam-");

const toMinuteKey = (dateLike) => {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) {
    return String(dateLike || "");
  }
  return d.toISOString().slice(0, 16);
};

const taskDedupKey = (task) =>
  `${String(task.courseCode || "").trim().toLowerCase()}|${String(task.title || "").trim().toLowerCase()}|${toMinuteKey(task.dueAtUtc || task.dueDate)}`;

const dedupeTasks = (tasks) => {
  const map = new Map();

  for (const task of tasks) {
    const key = taskDedupKey(task);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, task);
      continue;
    }

    const prevIsSynced = Boolean(prev.sync?.sourceId);
    const curIsSynced = Boolean(task.sync?.sourceId);

    if (!prevIsSynced && curIsSynced) {
      map.set(key, task);
      continue;
    }

    if (prevIsSynced === curIsSynced) {
      map.set(key, task);
    }
  }

  return Array.from(map.values());
};

const examDedupKey = (exam) =>
  `${String(exam.courseCode || "").trim().toLowerCase()}|${String(exam.type || "").trim().toLowerCase()}|${toMinuteKey(
    exam.startsAtUtc || exam.date,
  )}|${String(exam.time || "").trim().toLowerCase()}`;

const dedupeExams = (exams) => {
  const map = new Map();
  for (const exam of exams) {
    map.set(examDedupKey(exam), exam);
  }
  return Array.from(map.values());
};

const normalizeTitle = (summary = "") =>
  String(summary)
    .replace(/\s*\[[^\]]+\]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();

const isExamTitle = (title = "") => /\b(midterm|final|exam)\b/i.test(title);

const isLikelyTaskTitle = (title = "") =>
  /\b(homework|hw\d*|assignment|project|quiz|lab|problem set|submission|discussion|worksheet|p\d+\.|q\d+\.|a\d+\.)\b/i.test(
    title,
  );

const isIgnoredTitle = (title = "") =>
  /\b(office hour|office hours|hourse|reminder|lecture|class meeting|recitation|discussion section|seminar|review session|orientation|advising)\b/i.test(
    title,
  );

const extractCourseCode = (summary = "") => {
  const bracketMatch = String(summary).match(/\[(?:[A-Z0-9]+\s+)?([A-Z&]{2,16})\s+(\d{3})\s+\d{3}\]/i);
  if (bracketMatch) {
    return `${bracketMatch[1].toUpperCase()} ${bracketMatch[2]}`;
  }

  const prefixMatch = String(summary).match(/\b([A-Z&]{2,16})\s?(\d{3})\b/i);
  if (prefixMatch) {
    return `${prefixMatch[1].toUpperCase()} ${prefixMatch[2]}`;
  }

  return "CANVAS";
};

const extractCourseName = (summary = "", courseCode = "CANVAS") => {
  const clean = normalizeTitle(summary);
  const colonMatch = clean.match(/^[A-Z&]{2,16}\s?\d{3}\s*:\s*(.+)$/i);
  if (colonMatch) {
    return colonMatch[1].trim();
  }
  return `${courseCode} (Canvas)`;
};

const getSourceTimezone = (event) =>
  event?.start?.tz || event?.end?.tz || event?.tz || event?.timezone || null;

const formatDateKeyInTimezone = (date, timezone) => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
    return null;
  } catch (_error) {
    return null;
  }
};

const getSourceDateKey = (eventDate, sourceTimezone) => {
  if (!eventDate) {
    return null;
  }

  const date = new Date(eventDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (eventDate?.dateOnly) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  if (sourceTimezone) {
    const key = formatDateKeyInTimezone(date, sourceTimezone);
    if (key) {
      return key;
    }
  }

  return date.toISOString().slice(0, 10);
};

const getStableUtcForSourceDate = (sourceDate) => {
  if (!sourceDate || !/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) {
    return null;
  }

  const stable = new Date(`${sourceDate}T12:00:00.000Z`);
  if (Number.isNaN(stable.getTime())) {
    return null;
  }
  return stable.toISOString();
};

const sanitizeDescription = (value = "") => {
  const lines = String(value)
    .replace(/\\n/g, "\n")
    .replace(/\[(.*?)\]\((https?:\/\/[^)\s]+)\)/g, "$1 $2")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !/passcode|meeting id|one tap mobile|dial by your location|join from pc/i.test(line),
    );

  const compact = lines
    .filter((line) => !/^(table of contents|[-_*]{3,}|\d+\.)$/i.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!compact) {
    return "";
  }

  return compact.length > 280 ? `${compact.slice(0, 277)}...` : compact;
};

const extractPrimaryUrl = (event) => {
  const direct = typeof event?.url === "string" ? event.url.trim() : "";
  if (direct && /^https?:\/\//i.test(direct)) {
    return direct;
  }

  const description = String(event?.description || "");
  const markdownMatch = description.match(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/i);
  if (markdownMatch) {
    return markdownMatch[1];
  }

  const plainMatch = description.match(/https?:\/\/[^\s)]+/i);
  if (plainMatch) {
    return plainMatch[0];
  }

  return null;
};

const detectExternalTool = ({ title = "", description = "", url = "" }) => {
  const text = `${title} ${description} ${url}`.toLowerCase();
  if (text.includes("canvas.wisc.edu")) {
    return "Canvas";
  }
  if (text.includes("gradescope")) {
    return "Gradescope";
  }
  if (text.includes("prairielearn")) {
    return "PrairieLearn";
  }
  if (text.includes("git.doit.wisc.edu")) {
    return "GitLab";
  }
  if (text.includes("myuw") || text.includes("my.wisc.edu")) {
    return "MyUW";
  }
  if (text.includes("zybooks")) {
    return "zyBooks";
  }
  if (text.includes("github")) {
    return "GitHub";
  }
  if (url) {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./i, "");
      if (hostname.includes("wisc.edu")) {
        return "Course Website";
      }
      return hostname || "Course Website";
    } catch (_error) {
      return "Course Website";
    }
  }
  return "Course Website";
};

const isIgnoredCanvasEvent = (title = "", description = "", location = "") => {
  if (isIgnoredTitle(title)) {
    return true;
  }

  const text = `${title} ${description} ${location}`;
  if (/\boffice hours?\b/i.test(text)) {
    return true;
  }

  if (/\b(class meeting|recitation|lecture|seminar|review session|ta session)\b/i.test(text)) {
    return true;
  }

  if (/\bzoom\b/i.test(text) && !isLikelyTaskTitle(title) && !isExamTitle(title)) {
    return true;
  }

  return false;
};

const buildTaskSteps = (taskId, event, description, existingSteps = [], externalTool = "Canvas") => {
  const stepId = `${taskId}-open`;
  const existing = existingSteps.find((step) => step.id === stepId);
  const link = extractPrimaryUrl(event);
  const baseDescription = description || "Open assignment in Canvas to view full instructions and submit your work.";
  const linkText = externalTool === "Canvas" ? "Open in Canvas" : `Open in ${externalTool}`;

  return [
    {
      id: stepId,
      title: "Open assignment details",
      description: baseDescription,
      completed: Boolean(existing?.completed),
      ...(link ? { link, linkText } : {}),
    },
  ];
};

const parseEventTimeMeta = (event) => {
  const start = event?.start ? new Date(event.start) : null;
  const end = event?.end ? new Date(event.end) : null;

  if (!start || Number.isNaN(start.getTime())) {
    return null;
  }

  const allDay = event.datetype === "date" || Boolean(event?.start?.dateOnly);
  const sourceTimezone = getSourceTimezone(event);
  const sourceDate = getSourceDateKey(event.start, sourceTimezone) || start.toISOString().slice(0, 10);
  const stableUtc = allDay ? getStableUtcForSourceDate(sourceDate) : null;
  const startsAtUtc = stableUtc || start.toISOString();

  return {
    allDay,
    sourceTimezone,
    sourceDate,
    dueAtUtc: startsAtUtc,
    startsAtUtc,
    endsAtUtc: end && !Number.isNaN(end.getTime()) ? end.toISOString() : null,
  };
};

const detectExamType = (title = "") => {
  if (/final/i.test(title)) {
    return "Final";
  }
  if (/quiz/i.test(title)) {
    return "Quiz";
  }
  return "Midterm";
};

const formatExamTime = (event, timeMeta) => {
  if (timeMeta?.allDay || event.datetype === "date") {
    return "TBA";
  }

  const start = new Date(timeMeta?.startsAtUtc || event.start);
  if (Number.isNaN(start.getTime())) {
    return "TBA";
  }

  const fmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
  const startText = fmt.format(start);
  const end = timeMeta?.endsAtUtc ? new Date(timeMeta.endsAtUtc) : event.end ? new Date(event.end) : null;
  if (end && !Number.isNaN(end.getTime())) {
    return `${startText} - ${fmt.format(end)}`;
  }
  return startText;
};

const normalizeExamType = (value = "") => {
  if (/final/i.test(value)) {
    return "Final";
  }
  if (/quiz/i.test(value)) {
    return "Quiz";
  }
  return "Midterm";
};

const normalizeCourseCode = (value = "") => {
  const raw = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!raw) {
    return "";
  }

  const compact = raw.replace(/\s+/g, "");
  const compactMatch = compact.match(/^([A-Za-z&]{2,20})(\d{3})$/);
  if (compactMatch) {
    return `${compactMatch[1].toUpperCase()} ${compactMatch[2]}`;
  }

  const spacedMatch = raw.match(/^([A-Za-z&]{2,20}(?:\s+[A-Za-z&]{2,20})?)\s*[- ]?\s*(\d{3})$/);
  if (spacedMatch) {
    return `${spacedMatch[1].toUpperCase().replace(/\s+/g, " ")} ${spacedMatch[2]}`;
  }

  return raw.toUpperCase();
};

const parseDateCandidate = (value = "") => {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
};

const parseTimeZoneOffsetMinutes = (token = "") => {
  const match = String(token || "").match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/i);
  if (!match) {
    return 0;
  }
  const sign = match[1].startsWith("-") ? -1 : 1;
  const hours = Math.abs(Number.parseInt(match[1], 10));
  const minutes = Number.parseInt(match[2] || "0", 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }
  return sign * (hours * 60 + minutes);
};

const getTimeZoneOffsetMinutes = (timeZone, date) => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || DEFAULT_MYUW_TIMEZONE,
      timeZoneName: "shortOffset",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(date);
    const token = parts.find((part) => part.type === "timeZoneName")?.value || "GMT+0";
    return parseTimeZoneOffsetMinutes(token);
  } catch (_error) {
    return 0;
  }
};

const toUtcIsoFromLocalParts = ({ year, month, day, hour = 12, minute = 0, timeZone = DEFAULT_MYUW_TIMEZONE }) => {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const h = Number(hour);
  const mm = Number(minute);
  if (
    !Number.isInteger(y) ||
    !Number.isInteger(m) ||
    !Number.isInteger(d) ||
    !Number.isInteger(h) ||
    !Number.isInteger(mm)
  ) {
    return null;
  }

  const baseUtcMs = Date.UTC(y, m - 1, d, h, mm, 0, 0);
  if (Number.isNaN(baseUtcMs)) {
    return null;
  }

  let resolvedUtcMs = baseUtcMs;
  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMinutes(timeZone, new Date(resolvedUtcMs));
    const next = baseUtcMs - offset * 60 * 1000;
    if (Math.abs(next - resolvedUtcMs) < 1000) {
      resolvedUtcMs = next;
      break;
    }
    resolvedUtcMs = next;
  }

  const resolved = new Date(resolvedUtcMs);
  if (Number.isNaN(resolved.getTime())) {
    return null;
  }
  return resolved.toISOString();
};

const getDatePartsInTimezone = (date, timeZone = DEFAULT_MYUW_TIMEZONE) => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = Number.parseInt(parts.find((part) => part.type === "year")?.value || "", 10);
    const month = Number.parseInt(parts.find((part) => part.type === "month")?.value || "", 10);
    const day = Number.parseInt(parts.find((part) => part.type === "day")?.value || "", 10);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return null;
    }
    return { year, month, day };
  } catch (_error) {
    return null;
  }
};

const isValidMonthDay = (year, month, day) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const test = new Date(Date.UTC(year, month - 1, day));
  return (
    test.getUTCFullYear() === year &&
    test.getUTCMonth() === month - 1 &&
    test.getUTCDate() === day
  );
};

const normalizeShortCourseSubject = (value = "") => {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
  if (!normalized) {
    return "";
  }
  const compact = normalized.replace(/\s+/g, "");
  if (compact === "CS" || compact === "COMPSCI" || compact === "COMPSCIENCE" || compact === "COMPUTERSCIENCE") {
    return "COMPSCI";
  }
  if (normalized === "COMP SCI" || normalized === "COMP SCIENCE" || normalized === "COMPUTER SCIENCE") {
    return "COMPSCI";
  }
  return normalized;
};

const extractShortCourseCode = (input = "", dateIndex = -1) => {
  const source = String(input || "").trim();
  if (!source) {
    return "";
  }

  const beforeDate = dateIndex > 0 ? source.slice(0, dateIndex).trim() : source;
  const contexts = [beforeDate, source];
  const spacedPattern = /\b([A-Za-z&]{2,20}(?:\s+[A-Za-z&]{2,20}){0,2})\s*[- ]?\s*(\d{3})\b/i;
  const compactPattern = /\b([A-Za-z&]{2,20})(\d{3})\b/i;

  for (const context of contexts) {
    const spaced = context.match(spacedPattern);
    if (spaced) {
      const subject = normalizeShortCourseSubject(spaced[1]);
      const number = spaced[2];
      return normalizeCourseCode(`${subject} ${number}`);
    }
    const compact = context.match(compactPattern);
    if (compact) {
      const subject = normalizeShortCourseSubject(compact[1]);
      const number = compact[2];
      return normalizeCourseCode(`${subject} ${number}`);
    }
  }

  return "";
};

const extractShortDateParts = (input = "") => {
  const source = String(input || "").trim();
  if (!source) {
    return null;
  }

  const ymd = source.match(/\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/);
  if (ymd) {
    return {
      year: Number.parseInt(ymd[1], 10),
      month: Number.parseInt(ymd[2], 10),
      day: Number.parseInt(ymd[3], 10),
      explicitYear: true,
      token: ymd[0],
      index: ymd.index ?? -1,
    };
  }

  const mdy = source.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/);
  if (mdy) {
    return {
      year: Number.parseInt(mdy[3], 10),
      month: Number.parseInt(mdy[1], 10),
      day: Number.parseInt(mdy[2], 10),
      explicitYear: true,
      token: mdy[0],
      index: mdy.index ?? -1,
    };
  }

  const md = source.match(/\b(\d{1,2})[./-](\d{1,2})\b/);
  if (md) {
    return {
      year: null,
      month: Number.parseInt(md[1], 10),
      day: Number.parseInt(md[2], 10),
      explicitYear: false,
      token: md[0],
      index: md.index ?? -1,
    };
  }

  return null;
};

const normalizeMeridiem = (value = "") => {
  const compact = String(value || "")
    .toLowerCase()
    .replace(/\./g, "");
  if (compact === "am") {
    return "AM";
  }
  if (compact === "pm") {
    return "PM";
  }
  return "";
};

const normalizeShortSyntaxText = (value = "") =>
  String(value || "")
    .replace(/[，]/g, ",")
    .replace(/[：]/g, ":")
    .replace(/[。．·•]/g, ".")
    .replace(/[／]/g, "/")
    .replace(/[－—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const normalizeMyUwLocaleText = (value = "") => {
  let text = String(value || "");
  const replacements = [
    ["十二月", "December"],
    ["十一月", "November"],
    ["十月", "October"],
    ["九月", "September"],
    ["八月", "August"],
    ["七月", "July"],
    ["六月", "June"],
    ["五月", "May"],
    ["四月", "April"],
    ["三月", "March"],
    ["二月", "February"],
    ["一月", "January"],
    ["上午", "AM"],
    ["下午", "PM"],
  ];
  for (const [from, to] of replacements) {
    text = text.replaceAll(from, to);
  }

  return text
    .replace(/[，]/g, ",")
    .replace(/[：]/g, ":")
    .replace(/[。．·•]/g, ".")
    .replace(/[／]/g, "/")
    .replace(/[－—]/g, "-");
};

const parseClockTime = ({ hour, minute = 0, meridiem = "" }) => {
  const rawHour = Number.parseInt(String(hour), 10);
  const rawMinute = Number.parseInt(String(minute), 10);
  if (!Number.isInteger(rawHour) || !Number.isInteger(rawMinute) || rawMinute < 0 || rawMinute > 59) {
    return null;
  }

  const normalizedMeridiem = normalizeMeridiem(meridiem);
  if (normalizedMeridiem) {
    if (rawHour < 1 || rawHour > 12) {
      return null;
    }
    let normalizedHour = rawHour % 12;
    if (normalizedMeridiem === "PM") {
      normalizedHour += 12;
    }
    return { hour: normalizedHour, minute: rawMinute };
  }

  if (rawHour < 0 || rawHour > 23) {
    return null;
  }
  return { hour: rawHour, minute: rawMinute };
};

const extractShortTimeRange = (input = "") => {
  const source = String(input || "");

  const twelveHourRange = source.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\b/i,
  );
  if (twelveHourRange) {
    const start = parseClockTime({
      hour: twelveHourRange[1],
      minute: twelveHourRange[2] || "0",
      meridiem: twelveHourRange[3],
    });
    const end = parseClockTime({
      hour: twelveHourRange[4],
      minute: twelveHourRange[5] || "0",
      meridiem: twelveHourRange[6] || twelveHourRange[3],
    });
    if (start && end) {
      return { start, end };
    }
  }

  const twentyFourHourRange = source.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*(?:-|–|to)\s*([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFourHourRange) {
    const start = parseClockTime({
      hour: twentyFourHourRange[1],
      minute: twentyFourHourRange[2],
    });
    const end = parseClockTime({
      hour: twentyFourHourRange[3],
      minute: twentyFourHourRange[4],
    });
    if (start && end) {
      return { start, end };
    }
  }

  const twelveHourSingle = source.match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)\b/i);
  if (twelveHourSingle) {
    const start = parseClockTime({
      hour: twelveHourSingle[1],
      minute: twelveHourSingle[2] || "0",
      meridiem: twelveHourSingle[3],
    });
    if (start) {
      return { start, end: null };
    }
  }

  const twentyFourHourSingle = source.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFourHourSingle) {
    const start = parseClockTime({
      hour: twentyFourHourSingle[1],
      minute: twentyFourHourSingle[2],
    });
    if (start) {
      return { start, end: null };
    }
  }

  return null;
};

const formatTimeLabelInTimezone = (isoValue, timeZone = DEFAULT_MYUW_TIMEZONE) => {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) {
    return "TBA";
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const extractLocationFromShortInput = (input = "") => {
  const source = String(input || "");
  const labeled = source.match(/(?:location|room|where)\s*[:\-]\s*([^\n,;]+)/i)?.[1]?.trim();
  if (labeled) {
    return labeled;
  }
  return "TBA";
};

const extractCoursePageUrl = (input = "") => {
  const match = String(input || "").match(/https?:\/\/[^\s)]+/i);
  if (!match) {
    return undefined;
  }
  return match[0];
};

const isExamPastForGuardrail = (item, now = new Date(), timeZone = DEFAULT_MYUW_TIMEZONE) => {
  const startsAtUtc = parseDateCandidate(item?.startsAtUtc || item?.date || "");
  if (!startsAtUtc) {
    return true;
  }
  if (String(item?.time || "").trim().toUpperCase() !== "TBA") {
    return new Date(startsAtUtc).getTime() < now.getTime();
  }

  const sourceDate =
    item?.sourceDate ||
    formatDateKeyInTimezone(new Date(startsAtUtc), timeZone) ||
    startsAtUtc.slice(0, 10);
  const [yearText, monthText, dayText] = String(sourceDate).split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  if (!isValidMonthDay(year, month, day)) {
    return new Date(startsAtUtc).getTime() < now.getTime();
  }

  const endOfDayUtc = toUtcIsoFromLocalParts({
    year,
    month,
    day,
    hour: 23,
    minute: 59,
    timeZone,
  });
  if (!endOfDayUtc) {
    return new Date(startsAtUtc).getTime() < now.getTime();
  }
  return new Date(endOfDayUtc).getTime() < now.getTime();
};

const parseMyUwShortExamLine = (line = "", { now = new Date(), userTimezone = DEFAULT_MYUW_TIMEZONE } = {}) => {
  const text = String(line || "").trim();
  if (!text) {
    return { matched: false, item: null, error: null };
  }

  const dateParts = extractShortDateParts(text);
  if (!dateParts) {
    return { matched: false, item: null, error: null };
  }

  const courseCode = extractShortCourseCode(text, dateParts.index);
  if (!courseCode) {
    return { matched: false, item: null, error: null };
  }

  const nowParts = getDatePartsInTimezone(now, userTimezone);
  if (!nowParts) {
    return {
      matched: true,
      item: null,
      error: {
        reason: "invalid timezone",
        message: `Could not evaluate local date for timezone ${userTimezone}.`,
      },
    };
  }

  const inferredYear = dateParts.explicitYear ? dateParts.year : nowParts.year;
  if (!isValidMonthDay(inferredYear, dateParts.month, dateParts.day)) {
    return {
      matched: true,
      item: null,
      error: {
        reason: "invalid date",
        message: `Invalid date in short input: ${dateParts.token}.`,
      },
    };
  }

  const monthDayPassed =
    !dateParts.explicitYear &&
    (dateParts.month < nowParts.month || (dateParts.month === nowParts.month && dateParts.day < nowParts.day));
  if (monthDayPassed) {
    const parsedIsoDate = `${inferredYear}-${String(dateParts.month).padStart(2, "0")}-${String(dateParts.day).padStart(2, "0")}`;
    const suggestionYear = inferredYear + 1;
    return {
      matched: true,
      item: null,
      error: {
        reason: "missing year",
        message: `date already passed for this term (${parsedIsoDate}); please include year explicitly.`,
        suggestion: `${courseCode} ${suggestionYear}-${String(dateParts.month).padStart(2, "0")}-${String(dateParts.day).padStart(2, "0")} 7:00 PM ${normalizeExamType(text)}`,
      },
    };
  }

  const timeRange = extractShortTimeRange(text);
  const hasTime = Boolean(timeRange?.start);
  const startUtcIso = toUtcIsoFromLocalParts({
    year: inferredYear,
    month: dateParts.month,
    day: dateParts.day,
    hour: hasTime ? timeRange.start.hour : 12,
    minute: hasTime ? timeRange.start.minute : 0,
    timeZone: userTimezone,
  });
  if (!startUtcIso) {
    return {
      matched: true,
      item: null,
      error: {
        reason: "invalid date",
        message: "Unable to convert short input date/time into UTC.",
      },
    };
  }

  const endUtcIso =
    hasTime && timeRange?.end
      ? toUtcIsoFromLocalParts({
          year: inferredYear,
          month: dateParts.month,
          day: dateParts.day,
          hour: timeRange.end.hour,
          minute: timeRange.end.minute,
          timeZone: userTimezone,
        })
      : null;

  const sourceDate = `${inferredYear}-${String(dateParts.month).padStart(2, "0")}-${String(dateParts.day).padStart(2, "0")}`;
  const startLabel = hasTime ? formatTimeLabelInTimezone(startUtcIso, userTimezone) : "TBA";
  const endLabel = hasTime && endUtcIso ? formatTimeLabelInTimezone(endUtcIso, userTimezone) : "";

  return {
    matched: true,
    item: {
      courseCode,
      courseName: `${courseCode} (MyUW)`,
      type: normalizeExamType(text),
      startsAtUtc: startUtcIso,
      endsAtUtc: endUtcIso || null,
      sourceTimezone: userTimezone,
      sourceDate,
      allDay: false,
      time: hasTime ? (endLabel ? `${startLabel} - ${endLabel}` : startLabel) : "TBA",
      location: extractLocationFromShortInput(text),
      coursePageUrl: extractCoursePageUrl(text),
      source: "short-text",
    },
    error: null,
  };
};

const parseMyUwShortTextExams = (input = "", { now = new Date(), userTimezone = DEFAULT_MYUW_TIMEZONE } = {}) => {
  const normalizedInput = normalizeShortSyntaxText(input);
  const lines = String(normalizedInput || "")
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const sourceLines = lines.length ? lines : [String(normalizedInput || "").trim()].filter(Boolean);
  const items = [];
  const errors = [];
  let matchedAny = false;

  for (const line of sourceLines) {
    const parsed = parseMyUwShortExamLine(line, { now, userTimezone });
    if (!parsed.matched) {
      continue;
    }
    matchedAny = true;
    if (parsed.error) {
      errors.push(parsed.error);
      continue;
    }
    if (parsed.item) {
      items.push(parsed.item);
    }
  }

  return {
    matchedAny,
    items: dedupeMyUwExamCandidates(items),
    errors,
  };
};

const parseClockToken = (value = "") => {
  const token = String(value || "").trim();
  const match = token.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) {
    return null;
  }
  return parseClockTime({
    hour: match[1],
    minute: match[2] || "0",
    meridiem: match[3],
  });
};

const parseMonthDayFromExamLine = (line = "") => {
  const monthNameMatch = String(line || "").match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\b/i,
  );
  if (monthNameMatch) {
    const month = ENGLISH_MONTH_TO_NUMBER[String(monthNameMatch[1] || "").toLowerCase()];
    const day = Number.parseInt(monthNameMatch[2], 10);
    if (month && Number.isInteger(day)) {
      return { month, day };
    }
  }

  const numericMatch = String(line || "").match(/\b(\d{1,2})[\/.-](\d{1,2})\b/);
  if (numericMatch) {
    const month = Number.parseInt(numericMatch[1], 10);
    const day = Number.parseInt(numericMatch[2], 10);
    if (Number.isInteger(month) && Number.isInteger(day)) {
      return { month, day };
    }
  }

  return null;
};

const parseTimeRangeFromExamLine = (line = "") => {
  const rangeMatch = String(line || "").match(/(\d{1,2}:\d{2}\s*(?:AM|PM))\s*(?:-|–|to)\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
  if (rangeMatch) {
    const start = parseClockToken(rangeMatch[1]);
    const end = parseClockToken(rangeMatch[2]);
    if (start && end) {
      return { start, end };
    }
  }

  const singleMatch = String(line || "").match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
  if (singleMatch) {
    const start = parseClockToken(singleMatch[1]);
    if (start) {
      return { start, end: null };
    }
  }

  return null;
};

const parseMyUwStructuredScheduleText = (input = "", { now = new Date(), userTimezone = DEFAULT_MYUW_TIMEZONE } = {}) => {
  const normalized = normalizeMyUwLocaleText(input);
  const lines = normalized
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    return [];
  }

  const nowParts = getDatePartsInTimezone(now, userTimezone);
  if (!nowParts) {
    return [];
  }

  const results = [];
  let currentCourseCode = "";
  let currentCourseName = "";
  let shouldReadExamLine = false;

  for (const line of lines) {
    const courseHeaderMatch = line.match(/^([A-Za-z&]+(?:\s+[A-Za-z&]+)*)\s+(\d{3})\s*:\s*(.+)$/i);
    if (courseHeaderMatch) {
      currentCourseCode = normalizeCourseCode(
        `${normalizeShortCourseSubject(courseHeaderMatch[1] || "")} ${courseHeaderMatch[2]}`,
      );
      currentCourseName = String(courseHeaderMatch[3] || "").trim() || `${currentCourseCode} (MyUW)`;
      shouldReadExamLine = false;
      continue;
    }

    if (/^Exams?$/i.test(line)) {
      shouldReadExamLine = true;
      continue;
    }

    if (!shouldReadExamLine || !currentCourseCode) {
      continue;
    }

    const monthDay = parseMonthDayFromExamLine(line);
    if (!monthDay) {
      continue;
    }

    const year = nowParts.year;
    if (!isValidMonthDay(year, monthDay.month, monthDay.day)) {
      shouldReadExamLine = false;
      continue;
    }

    const timeRange = parseTimeRangeFromExamLine(line);
    const startUtc = toUtcIsoFromLocalParts({
      year,
      month: monthDay.month,
      day: monthDay.day,
      hour: timeRange?.start ? timeRange.start.hour : 12,
      minute: timeRange?.start ? timeRange.start.minute : 0,
      timeZone: userTimezone,
    });
    const endUtc =
      timeRange?.end
        ? toUtcIsoFromLocalParts({
            year,
            month: monthDay.month,
            day: monthDay.day,
            hour: timeRange.end.hour,
            minute: timeRange.end.minute,
            timeZone: userTimezone,
          })
        : null;
    if (!startUtc) {
      shouldReadExamLine = false;
      continue;
    }

    const locationRaw = line.match(/\s-\s([^-\n]+)$/)?.[1]?.trim() || "TBA";
    const location = isUnknownLocation(locationRaw) ? "TBA" : locationRaw;
    const sourceDate = `${year}-${String(monthDay.month).padStart(2, "0")}-${String(monthDay.day).padStart(2, "0")}`;
    const hasType = /\b(midterm|final|quiz)\b/i.test(line);
    const startLabel = timeRange?.start ? formatTimeLabelInTimezone(startUtc, userTimezone) : "TBA";
    const endLabel = timeRange?.end && endUtc ? formatTimeLabelInTimezone(endUtc, userTimezone) : "";

    results.push({
      courseCode: currentCourseCode,
      courseName: currentCourseName,
      type: hasType ? normalizeExamType(line) : "Final",
      startsAtUtc: startUtc,
      endsAtUtc: endUtc || null,
      sourceTimezone: userTimezone,
      sourceDate,
      allDay: false,
      time: timeRange?.start ? (endLabel ? `${startLabel} - ${endLabel}` : startLabel) : "TBA",
      location,
      source: "myuw-structured",
    });
    shouldReadExamLine = false;
  }

  return dedupeMyUwExamCandidates(results);
};

const mergeMyUwImportedExams = ({
  existingExams = [],
  incomingItems = [],
  now = new Date(),
  staleWindowDays = MYUW_STALE_WINDOW_DAYS,
}) => {
  const createdUpdated = {
    created: 0,
    updated: 0,
    removedStale: 0,
    totalActive: 0,
    exams: Array.isArray(existingExams) ? existingExams : [],
  };

  const staleCutoffMs = now.getTime() - staleWindowDays * 24 * 60 * 60 * 1000;
  const nonMyUwExams = createdUpdated.exams.filter((exam) => exam.sync?.sourceId !== "myuw-import");
  const activeMyUwByKey = new Map();

  for (const existingExam of createdUpdated.exams.filter((exam) => exam.sync?.sourceId === "myuw-import")) {
    const examStart = parseDateCandidate(existingExam.startsAtUtc || existingExam.date || "");
    if (!examStart) {
      createdUpdated.removedStale += 1;
      continue;
    }
    if (new Date(examStart).getTime() < staleCutoffMs) {
      createdUpdated.removedStale += 1;
      continue;
    }
    const key = makeMyUwExamMergeKey({
      courseCode: existingExam.courseCode,
      type: existingExam.type,
      startsAtUtc: examStart,
    });
    if (key) {
      activeMyUwByKey.set(key, { ...existingExam, startsAtUtc: examStart, date: examStart });
    }
  }

  const nowIso = now.toISOString();
  for (const incoming of dedupeMyUwExamCandidates(incomingItems)) {
    const startsAtUtc = parseDateCandidate(incoming.startsAtUtc || incoming.date || "");
    if (!startsAtUtc) {
      continue;
    }

    const endsAtUtc = incoming.endsAtUtc && isValidIsoDate(incoming.endsAtUtc) ? new Date(incoming.endsAtUtc).toISOString() : null;
    const timeMeta = {
      startsAtUtc,
      endsAtUtc,
      allDay: Boolean(incoming.allDay),
    };
    const location = isUnknownLocation(incoming.location) ? "TBA" : String(incoming.location || "TBA").trim() || "TBA";
    const normalized = {
      courseCode: String(incoming.courseCode || "").trim(),
      courseName: String(incoming.courseName || "").trim(),
      type: normalizeExamType(incoming.type),
      date: startsAtUtc,
      startsAtUtc,
      endsAtUtc,
      sourceTimezone: incoming.sourceTimezone || null,
      allDay: Boolean(incoming.allDay),
      sourceDate: incoming.sourceDate || null,
      time:
        String(incoming.time || "").trim() ||
        formatExamTime(
          { start: new Date(startsAtUtc), end: endsAtUtc ? new Date(endsAtUtc) : null, datetype: "date-time" },
          timeMeta,
        ),
      location,
      coursePageUrl: incoming.coursePageUrl ? String(incoming.coursePageUrl).trim() : undefined,
      reminderSet: false,
      sync: {
        sourceId: "myuw-import",
        sourceName: "MyUW Import",
        uid: incoming.uid ? String(incoming.uid) : null,
        lastSyncedAt: nowIso,
        classification: "exam",
      },
    };

    if (!normalized.courseCode || !normalized.courseName) {
      continue;
    }

    const mergeKey = makeMyUwExamMergeKey(normalized);
    if (!mergeKey) {
      continue;
    }

    const existing = activeMyUwByKey.get(mergeKey);
    if (existing) {
      activeMyUwByKey.set(mergeKey, {
        ...existing,
        ...normalized,
        id: existing.id,
      });
      createdUpdated.updated += 1;
    } else {
      activeMyUwByKey.set(mergeKey, {
        id: makeMyUwExamId(normalized),
        ...normalized,
      });
      createdUpdated.created += 1;
    }
  }

  const mergedMyUwExams = Array.from(activeMyUwByKey.values());
  createdUpdated.totalActive = mergedMyUwExams.length;
  createdUpdated.exams = dedupeExams([...nonMyUwExams, ...mergedMyUwExams]);
  return createdUpdated;
};

const parseLooseJsonArray = (value = "") => {
  const text = String(value || "").trim();
  if (!text) {
    return [];
  }

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const candidates = [cleaned];

  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    candidates.push(cleaned.slice(firstBracket, lastBracket + 1));
  }

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (Array.isArray(parsed?.items)) {
        return parsed.items;
      }
      if (Array.isArray(parsed?.exams)) {
        return parsed.exams;
      }
    } catch (_error) {
      // Try next variant.
    }
  }

  return [];
};

const extractDateRangeFromText = (text = "") => {
  const source = String(text || "");
  if (!source.trim()) {
    return { startsAtUtc: null, endsAtUtc: null };
  }

  const isoMatches = source.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})/g);
  if (isoMatches?.length) {
    const startsAtUtc = parseDateCandidate(isoMatches[0]);
    const endsAtUtc = isoMatches.length > 1 ? parseDateCandidate(isoMatches[1]) : null;
    return { startsAtUtc, endsAtUtc };
  }

  const monthRange = source.match(
    /((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},\s*\d{4})(?:\s+at)?\s+(\d{1,2}(?::\d{2})?\s*[AP]M|\d{1,2}:\d{2})(?:\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?\s*[AP]M|\d{1,2}:\d{2}))?/i,
  );
  if (monthRange) {
    const datePart = monthRange[1];
    const startClock = monthRange[2];
    const endClockRaw = monthRange[3] || "";
    const meridiem = (startClock.match(/\b([AP]M)\b/i)?.[1] || "").toUpperCase();
    const endClock =
      endClockRaw && !/\b[AP]M\b/i.test(endClockRaw) && meridiem ? `${endClockRaw} ${meridiem}` : endClockRaw;

    return {
      startsAtUtc: parseDateCandidate(`${datePart} ${startClock}`),
      endsAtUtc: endClock ? parseDateCandidate(`${datePart} ${endClock}`) : null,
    };
  }

  const numericRange = source.match(
    /(\d{1,2}\/\d{1,2}\/\d{4})(?:\s+|,\s*)(\d{1,2}(?::\d{2})?\s*[AP]M|\d{1,2}:\d{2})(?:\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?\s*[AP]M|\d{1,2}:\d{2}))?/i,
  );
  if (numericRange) {
    const datePart = numericRange[1];
    const startClock = numericRange[2];
    const endClockRaw = numericRange[3] || "";
    const meridiem = (startClock.match(/\b([AP]M)\b/i)?.[1] || "").toUpperCase();
    const endClock =
      endClockRaw && !/\b[AP]M\b/i.test(endClockRaw) && meridiem ? `${endClockRaw} ${meridiem}` : endClockRaw;

    return {
      startsAtUtc: parseDateCandidate(`${datePart} ${startClock}`),
      endsAtUtc: endClock ? parseDateCandidate(`${datePart} ${endClock}`) : null,
    };
  }

  const monthDateOnly = source.match(
    /((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},\s*\d{4})/i,
  );
  if (monthDateOnly) {
    return {
      startsAtUtc: parseDateCandidate(`${monthDateOnly[1]} 12:00 PM`),
      endsAtUtc: null,
    };
  }

  const numericDateOnly = source.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/);
  if (numericDateOnly) {
    return {
      startsAtUtc: parseDateCandidate(`${numericDateOnly[1]} 12:00 PM`),
      endsAtUtc: null,
    };
  }

  return { startsAtUtc: null, endsAtUtc: null };
};

const parseMyUwExamsFromText = (input = "") => {
  const text = String(input || "")
    .replace(/\r/g, "")
    .trim();
  if (!text) {
    return [];
  }

  const blocks = text
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
  const candidates = blocks.length ? blocks : [text];
  const parsed = [];

  for (const block of candidates) {
    const courseMatch = block.match(/\b([A-Za-z&]{2,20}(?:\s+[A-Za-z&]{2,20})?)\s*[- ]?\s*(\d{3})\b/);
    if (!courseMatch) {
      continue;
    }

    const courseCode = normalizeCourseCode(`${courseMatch[1]} ${courseMatch[2]}`);
    const lines = block
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const firstLine = lines[0] || block;
    const derivedName = firstLine
      .replace(courseMatch[0], "")
      .replace(/^[-:–\s]+/g, "")
      .trim();
    const locationField = block.match(/(?:location|room|where)\s*[:\-]\s*([^\n]+)/i)?.[1]?.trim();
    const locationLine = lines.find((line) => /\b(room|hall|building|center|online|zoom)\b/i.test(line));
    const { startsAtUtc, endsAtUtc } = extractDateRangeFromText(block);
    if (!startsAtUtc) {
      continue;
    }

    parsed.push({
      courseCode,
      courseName: derivedName || `${courseCode} (MyUW)`,
      type: normalizeExamType(block),
      startsAtUtc,
      endsAtUtc,
      location: locationField || locationLine || "TBA",
      source: "text-fallback",
    });
  }

  return parsed;
};

const normalizeMyUwExamCandidate = (raw) => {
  const courseCode = normalizeCourseCode(raw?.courseCode || "");
  const courseName = String(raw?.courseName || "").trim();
  const startsAtUtc = parseDateCandidate(raw?.startsAtUtc || raw?.start || raw?.date || "");
  const endsAtUtc = parseDateCandidate(raw?.endsAtUtc || raw?.end || "");
  if (!courseCode || !startsAtUtc) {
    return null;
  }

  const type = normalizeExamType(raw?.type || raw?.title || "");
  const rawLocation = String(raw?.location || raw?.room || "").trim();
  const location = isUnknownLocation(rawLocation) ? "TBA" : rawLocation || "TBA";
  const safeCourseName = courseName || `${courseCode} (MyUW)`;
  const coursePageUrl =
    typeof raw?.coursePageUrl === "string" && /^https?:\/\//i.test(raw.coursePageUrl.trim())
      ? raw.coursePageUrl.trim()
      : undefined;
  const uid = raw?.uid ? String(raw.uid) : undefined;
  const time =
    String(raw?.time || "").trim() ||
    formatExamTime(
      { start: new Date(startsAtUtc), end: endsAtUtc ? new Date(endsAtUtc) : null, datetype: "date-time" },
      { startsAtUtc, endsAtUtc, allDay: false },
    );
  const sourceTimezone = String(raw?.sourceTimezone || "").trim() || null;
  const sourceDate =
    typeof raw?.sourceDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.sourceDate)
      ? raw.sourceDate
      : null;
  const allDay = Boolean(raw?.allDay);

  return {
    courseCode,
    courseName: safeCourseName,
    type,
    startsAtUtc,
    endsAtUtc: endsAtUtc || null,
    sourceTimezone,
    sourceDate,
    allDay,
    location,
    time,
    ...(coursePageUrl ? { coursePageUrl } : {}),
    ...(uid ? { uid } : {}),
  };
};

const dedupeMyUwExamCandidates = (items = []) => {
  const map = new Map();
  for (const item of items) {
    const normalized = normalizeMyUwExamCandidate(item);
    if (!normalized) {
      continue;
    }

    const key = `${normalized.courseCode.toLowerCase()}|${normalized.type.toLowerCase()}|${toMinuteKey(
      normalized.startsAtUtc,
    )}`;
    if (!map.has(key)) {
      map.set(key, normalized);
    }
  }
  return Array.from(map.values());
};

const isUnknownLocation = (value = "") => {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (!text) {
    return true;
  }
  return /^(tba|n\/a|none|unknown|not specified|location not specified)$/i.test(text);
};

const toMonthDayKey = (isoValue) => {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(5, 10);
};

const mergeMyUwHints = (aiItems = [], textHints = []) => {
  const hintMap = new Map();
  for (const hint of textHints) {
    const key = `${hint.courseCode}|${toMonthDayKey(hint.startsAtUtc)}`;
    if (!key.endsWith("|")) {
      hintMap.set(key, hint);
    }
  }

  return aiItems.map((item) => {
    const key = `${item.courseCode}|${toMonthDayKey(item.startsAtUtc)}`;
    const hint = hintMap.get(key);
    if (!hint) {
      return item;
    }

    const next = { ...item };
    if (isUnknownLocation(next.location) && !isUnknownLocation(hint.location)) {
      next.location = hint.location;
    }
    if ((!next.time || next.time === "TBA") && hint.time && hint.time !== "TBA") {
      next.time = hint.time;
    }
    if ((!next.courseName || /\(myuw\)$/i.test(next.courseName)) && hint.courseName && !/\(myuw\)$/i.test(hint.courseName)) {
      next.courseName = hint.courseName;
    }
    return next;
  });
};

const parseMyUwExamsWithDeepSeek = async ({ text = "", imageBase64 = "", imageMimeType = "image/png", userTimezone = "America/Chicago", apiKey }) => {
  const content = [];
  const trimmedText = String(text || "").trim();
  if (trimmedText) {
    content.push({
      type: "text",
      text: `My timezone: ${userTimezone}\nRaw MyUW exam text:\n${trimmedText}`,
    });
  }
  if (imageBase64) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${imageMimeType || "image/png"};base64,${imageBase64}` },
    });
  }

  if (content.length === 0) {
    return [];
  }

  const systemPrompt =
    "You extract exam entries from UW-Madison MyUW screenshots/text. Return strict JSON only. " +
    "Output either an array or an object with items[]. Each item must include: courseCode, courseName, type, startsAtUtc, endsAtUtc(optional), location(optional), coursePageUrl(optional), uid(optional). " +
    "startsAtUtc and endsAtUtc must be valid UTC ISO strings with Z. Use type from Midterm|Final|Quiz.";

  const response = await fetch(`${DEEPSEEK_API_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`DeepSeek request failed (${response.status}): ${detail}`);
  }

  const payload = await response.json();
  const rawContent = payload?.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error("DeepSeek response did not include content.");
  }

  return parseLooseJsonArray(rawContent);
};

const syncSourceTasks = async (store, source) => {
  const stats = {
    tasksCreated: 0,
    tasksUpdated: 0,
    examsCreated: 0,
    examsUpdated: 0,
    skipped: 0,
  };

  const response = await fetch(source.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ICS (${response.status})`);
  }

  const icsText = await response.text();
  const parsed = ical.parseICS(icsText);

  const events = Object.values(parsed).filter((entry) => entry?.type === "VEVENT");
  const nextTasks = dedupeTasks(store.tasks.filter((task) => !isLegacySeedTask(task) && task.sync?.sourceId !== source.id));
  const nextExams = dedupeExams(store.exams.filter((exam) => !isLegacySeedExam(exam) && exam.sync?.sourceId !== source.id));

  for (const event of events) {
    if (!event?.summary || !event?.start) {
      stats.skipped += 1;
      continue;
    }

    const rawTitle = String(event.summary).trim();
    const rawDescription = String(event.description || "");
    const title = normalizeTitle(rawTitle);
    if (!title || isIgnoredCanvasEvent(title, rawDescription, String(event.location || ""))) {
      stats.skipped += 1;
      continue;
    }

    const timeMeta = parseEventTimeMeta(event);
    if (!timeMeta) {
      stats.skipped += 1;
      continue;
    }

    const courseCode = extractCourseCode(rawTitle);
    const courseName = extractCourseName(rawTitle, courseCode);
    const description = sanitizeDescription(rawDescription);
    const primaryUrl = extractPrimaryUrl(event);
    const externalUrl = primaryUrl || undefined;
    const externalTool = detectExternalTool({ title, description: rawDescription, url: externalUrl || "" });
    const syncMeta = {
      sourceId: source.id,
      sourceName: source.name,
      uid: event.uid || null,
      lastSyncedAt: new Date().toISOString(),
    };

    // Exams are sourced from MyUW, not Canvas ICS.
    if (isExamTitle(title)) {
      stats.skipped += 1;
      continue;
    }

    if (!isLikelyTaskTitle(title)) {
      stats.skipped += 1;
      continue;
    }

    const taskId = makeSyncTaskId(source.id, event);
    const existingIndex = nextTasks.findIndex((task) => task.id === taskId);
    if (existingIndex === -1) {
      nextTasks.push({
        id: taskId,
        courseCode,
        courseName,
        title,
        dueDate: timeMeta.dueAtUtc,
        dueAtUtc: timeMeta.dueAtUtc,
        sourceTimezone: timeMeta.sourceTimezone,
        allDay: timeMeta.allDay,
        sourceDate: timeMeta.sourceDate,
        status: "Not started",
        externalTool,
        externalUrl,
        reminderSet: false,
        steps: buildTaskSteps(taskId, event, description, [], externalTool),
        sync: { ...syncMeta, classification: "task" },
      });
      stats.tasksCreated += 1;
      continue;
    }

    const existingTask = nextTasks[existingIndex];
    nextTasks[existingIndex] = {
      ...existingTask,
      courseCode,
      courseName,
      title,
      dueDate: timeMeta.dueAtUtc,
      dueAtUtc: timeMeta.dueAtUtc,
      sourceTimezone: timeMeta.sourceTimezone,
      allDay: timeMeta.allDay,
      sourceDate: timeMeta.sourceDate,
      externalTool,
      externalUrl,
      steps: buildTaskSteps(taskId, event, description, existingTask.steps || [], externalTool),
      sync: { ...syncMeta, classification: "task" },
    };
    stats.tasksUpdated += 1;
  }

  return { tasks: dedupeTasks(nextTasks), exams: dedupeExams(nextExams), stats };
};

const runSyncForSource = async (store, source) => {
  if (!source.active) {
    return {
      store,
      source: {
        ...source,
        lastRunAt: new Date().toISOString(),
        lastStatus: "skipped",
        lastMessage: "Source is inactive",
      },
      stats: { tasksCreated: 0, tasksUpdated: 0, examsCreated: 0, examsUpdated: 0, skipped: 0 },
    };
  }

  try {
    const { tasks, exams, stats } = await syncSourceTasks(store, source);
    return {
      store: { ...store, tasks, exams },
      source: {
        ...source,
        lastRunAt: new Date().toISOString(),
        lastStatus: "success",
        lastMessage: `Tasks ${stats.tasksCreated + stats.tasksUpdated}, Exams ${stats.examsCreated + stats.examsUpdated}`,
        lastImportedCount:
          stats.tasksCreated + stats.tasksUpdated + stats.examsCreated + stats.examsUpdated,
        lastError: null,
      },
      stats,
    };
  } catch (error) {
    return {
      store,
      source: {
        ...source,
        lastRunAt: new Date().toISOString(),
        lastStatus: "error",
        lastMessage: error instanceof Error ? error.message : "Unknown sync error",
        lastError: error instanceof Error ? error.message : "Unknown sync error",
      },
      stats: { tasksCreated: 0, tasksUpdated: 0, examsCreated: 0, examsUpdated: 0, skipped: 0 },
    };
  }
};

const runAllSources = async (store) => {
  let nextStore = ensureStoreShape(store);
  const runResults = [];

  for (const source of nextStore.syncSources) {
    const result = await runSyncForSource(nextStore, source);
    nextStore = {
      ...result.store,
      syncSources: nextStore.syncSources.map((item) => (item.id === source.id ? result.source : item)),
    };
    runResults.push({
      sourceId: source.id,
      sourceName: source.name,
      status: result.source.lastStatus,
      message: result.source.lastMessage,
      stats: result.stats,
    });
  }

  return { store: nextStore, runResults };
};

const runAutoSync = async () => {
  if (isAutoSyncRunning) {
    return;
  }

  isAutoSyncRunning = true;
  try {
    const store = await readStore();
    const hasActiveSource = store.syncSources.some((source) => source.active);
    if (!hasActiveSource) {
      isAutoSyncRunning = false;
      return;
    }

    const { store: syncedStore } = await runAllSources(store);
    await writeStore(syncedStore);
  } catch (error) {
    console.error("Auto sync failed:", error);
  } finally {
    isAutoSyncRunning = false;
  }
};

const normalizeTaskTimeShape = (task) => ({
  ...task,
  dueAtUtc: task?.dueAtUtc || task?.dueDate || null,
  sourceTimezone: task?.sourceTimezone ?? null,
  allDay: Boolean(task?.allDay),
  sourceDate: task?.sourceDate ?? null,
});

const normalizeExamTimeShape = (exam) => ({
  ...exam,
  startsAtUtc: exam?.startsAtUtc || exam?.date || null,
  endsAtUtc: exam?.endsAtUtc ?? null,
  sourceTimezone: exam?.sourceTimezone ?? null,
  allDay: Boolean(exam?.allDay),
  sourceDate: exam?.sourceDate ?? null,
});

const shouldRebuildSyncedData = (store) =>
  store.tasks.some(
    (task) =>
      isSyncedTask(task) && (!task?.dueAtUtc || typeof task?.allDay !== "boolean" || !task?.sync?.classification),
  ) || store.exams.some((exam) => isSyncedExam(exam) && (!exam?.startsAtUtc || typeof exam?.allDay !== "boolean"));

const migrateStoreOnStartup = async () => {
  const store = await readStore();
  const normalized = {
    ...store,
    tasks: store.tasks.map(normalizeTaskTimeShape),
    exams: store.exams.map(normalizeExamTimeShape),
  };
  // Canvas-origin synced exams are deprecated; exams must come from MyUW import.
  const normalizedStore = {
    ...normalized,
    exams: normalized.exams.filter((exam) => !isSyncedExam(exam)),
  };

  if (!shouldRebuildSyncedData(normalizedStore)) {
    await writeStore(normalizedStore);
    return;
  }

  if (!normalizedStore.syncSources.length) {
    await writeStore(normalizedStore);
    return;
  }

  const cleanedStore = {
    ...normalizedStore,
    tasks: normalizedStore.tasks.filter((task) => !isSyncedTask(task)),
    exams: normalizedStore.exams.filter((exam) => !isSyncedExam(exam)),
  };

  try {
    const result = await runAllSources(cleanedStore);
    const successfulSources = result.runResults.filter((item) => item.status === "success").length;
    if (successfulSources === 0) {
      await writeStore(normalizedStore);
      console.warn("Startup migration: no successful sync source, kept existing synced data.");
      return;
    }
    await writeStore(result.store);
    console.log("Startup migration: rebuilt synced records with new time rules.");
  } catch (error) {
    await writeStore(normalizedStore);
    console.error("Startup migration: rebuild failed, kept normalized existing data.", error);
  }
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, autoSyncIntervalMs: AUTO_SYNC_INTERVAL_MS });
});

app.get("/api/bootstrap", async (_req, res) => {
  try {
    const store = await readStore();
    res.json(store);
  } catch (error) {
    res.status(500).json({ error: "Failed to load data" });
  }
});

app.get("/api/sync/sources", async (_req, res) => {
  try {
    const store = await readStore();
    res.json(store.syncSources);
  } catch (error) {
    res.status(500).json({ error: "Failed to load sync sources" });
  }
});

app.post("/api/sync/sources", async (req, res) => {
  const { name, url, type = "canvas_ics", active = true } = req.body;

  if (!name || !url) {
    return badRequest(res, "name and url are required");
  }

  if (type !== "canvas_ics") {
    return badRequest(res, "Only canvas_ics source is supported now");
  }

  const source = {
    id: `sync-${crypto.randomUUID()}`,
    name,
    url,
    type,
    active: Boolean(active),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastRunAt: null,
    lastStatus: null,
    lastMessage: null,
    lastImportedCount: 0,
  };

  try {
    await updateStore((store) => {
      store.syncSources = [...store.syncSources, source];
      return store;
    });
    res.status(201).json(source);
  } catch (error) {
    res.status(500).json({ error: "Failed to create sync source" });
  }
});

app.delete("/api/sync/sources/:sourceId", async (req, res) => {
  const { sourceId } = req.params;

  try {
    let deleted = false;
    await updateStore((store) => {
      const nextSources = store.syncSources.filter((source) => source.id !== sourceId);
      deleted = nextSources.length !== store.syncSources.length;
      store.syncSources = nextSources;
      return store;
    });

    if (!deleted) {
      return notFound(res, "Sync source");
    }

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete sync source" });
  }
});

app.post("/api/sync/run", async (_req, res) => {
  try {
    const store = await readStore();
    const result = await runAllSources(store);
    await writeStore(result.store);
    res.json({ results: result.runResults });
  } catch (error) {
    res.status(500).json({ error: "Failed to run sync" });
  }
});

app.post("/api/sync/rebuild", async (_req, res) => {
  try {
    const store = await readStore();
    const cleanedStore = {
      ...store,
      tasks: store.tasks.filter((task) => !isSyncedTask(task)),
      exams: store.exams.filter((exam) => !isSyncedExam(exam)),
    };
    const result = await runAllSources(cleanedStore);
    const hadSyncedData =
      store.tasks.some((task) => isSyncedTask(task)) || store.exams.some((exam) => isSyncedExam(exam));
    const successfulSources = result.runResults.filter((item) => item.status === "success").length;

    if (hadSyncedData && successfulSources === 0) {
      return res.status(502).json({
        error: "Rebuild failed: no sync source succeeded. Existing synced data was kept.",
        results: result.runResults,
        rebuilt: false,
      });
    }

    await writeStore(result.store);
    res.json({ results: result.runResults, rebuilt: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to rebuild sync data" });
  }
});

app.post("/api/sync/sources/:sourceId/run", async (req, res) => {
  const { sourceId } = req.params;

  try {
    const store = await readStore();
    const source = store.syncSources.find((item) => item.id === sourceId);

    if (!source) {
      return notFound(res, "Sync source");
    }

    const result = await runSyncForSource(store, source);
    const nextStore = {
      ...result.store,
      syncSources: store.syncSources.map((item) => (item.id === sourceId ? result.source : item)),
    };

    await writeStore(nextStore);

    return res.json({
      sourceId,
      status: result.source.lastStatus,
      message: result.source.lastMessage,
      stats: result.stats,
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to run source sync" });
  }
});

app.post("/api/sync/import-json", async (req, res) => {
  const { items, sourceName = "Canvas Manual Import" } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return badRequest(res, "items must be a non-empty array");
  }

  try {
    let created = 0;
    let updated = 0;

    await updateStore((store) => {
      const nextTasks = dedupeTasks(store.tasks.filter((task) => !isLegacySeedTask(task)));

      for (const rawItem of items) {
        const title = String(rawItem.title || "").trim();
        const dueDateRaw = String(rawItem.dueDate || "").trim();
        if (!title || !isValidIsoDate(dueDateRaw)) {
          continue;
        }

        const normalized = {
          courseCode: String(rawItem.courseCode || extractCourseCode(title)).trim() || "CANVAS",
          courseName: String(rawItem.courseName || "").trim() || "Canvas Imported",
          title,
          dueDate: new Date(dueDateRaw).toISOString(),
          dueAtUtc: new Date(dueDateRaw).toISOString(),
          sourceTimezone: null,
          allDay: false,
          sourceDate: null,
          externalTool: "Canvas Import",
          externalUrl: rawItem.externalUrl ? String(rawItem.externalUrl).trim() : undefined,
        };

        const id = makeManualImportTaskId(normalized);
        const existingIndex = nextTasks.findIndex((task) => task.id === id);

        if (existingIndex === -1) {
          nextTasks.push({
            id,
            ...normalized,
            status: "Not started",
            reminderSet: false,
            steps: [],
            sync: {
              sourceId: "manual-import",
              sourceName,
              lastSyncedAt: new Date().toISOString(),
              classification: "task",
            },
          });
          created += 1;
        } else {
          nextTasks[existingIndex] = {
            ...nextTasks[existingIndex],
            ...normalized,
            sync: {
              sourceId: "manual-import",
              sourceName,
              lastSyncedAt: new Date().toISOString(),
              classification: "task",
            },
          };
          updated += 1;
        }
      }

      store.tasks = dedupeTasks(nextTasks);
      return store;
    });

    return res.json({
      ok: true,
      created,
      updated,
      total: created + updated,
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to import JSON items" });
  }
});

app.post("/api/sync/parse-myuw-exams", async (req, res) => {
  const { text = "", userTimezone = DEFAULT_MYUW_TIMEZONE } = req.body || {};
  const trimmedText = String(text || "").trim();
  const effectiveTimezone = String(userTimezone || DEFAULT_MYUW_TIMEZONE).trim() || DEFAULT_MYUW_TIMEZONE;
  const now = new Date();

  if (!trimmedText) {
    return badRequest(res, "text is required");
  }

  const shortParse = parseMyUwShortTextExams(trimmedText, {
    now,
    userTimezone: effectiveTimezone,
  });
  if (shortParse.matchedAny) {
    if (shortParse.errors.length) {
      const [firstError] = shortParse.errors;
      return res.status(422).json({
        error: firstError.message,
        reason: firstError.reason,
        suggestion: firstError.suggestion || null,
        usedAi: false,
        provider: "short-text",
        warnings: [],
        items: [],
      });
    }

    if (!shortParse.items.length) {
      return res.status(422).json({
        error: "No valid exams detected from short input.",
        reason: "missing fields",
        usedAi: false,
        provider: "short-text",
        warnings: [],
        items: [],
      });
    }

    const allPast = shortParse.items.every((item) => isExamPastForGuardrail(item, now, effectiveTimezone));
    if (allPast) {
      return res.status(422).json({
        error: "all parsed exams are in the past",
        reason: "all parsed exams are in the past",
        usedAi: false,
        provider: "short-text",
        warnings: [],
        parsedDates: shortParse.items.map((item) => item.startsAtUtc),
        suggestion: "Use an explicit future year, e.g. CS 400 2026-03-17 7:00 PM midterm",
        items: [],
      });
    }

    return res.json({
      ok: true,
      provider: "short-text",
      usedAi: false,
      count: shortParse.items.length,
      items: shortParse.items,
      warnings: [],
    });
  }

  const structuredItems = parseMyUwStructuredScheduleText(trimmedText, {
    now,
    userTimezone: effectiveTimezone,
  });
  if (structuredItems.length) {
    const allPastStructured = structuredItems.every((item) => isExamPastForGuardrail(item, now, effectiveTimezone));
    if (allPastStructured) {
      return res.status(422).json({
        error: "all parsed exams are in the past",
        reason: "all parsed exams are in the past",
        usedAi: false,
        provider: "myuw-structured-local",
        warnings: [],
        parsedDates: structuredItems.map((item) => item.startsAtUtc),
        suggestion: "Use explicit future dates, e.g. CS 400 2026-03-17 7:00 PM midterm",
        items: [],
      });
    }

    return res.json({
      ok: true,
      provider: "myuw-structured-local",
      usedAi: false,
      count: structuredItems.length,
      items: structuredItems,
      warnings: [],
    });
  }

  const warnings = [];
  const aiKey = String(process.env.DEEPSEEK_API_KEY || "").trim();
  let usedAi = false;
  let normalizedAiItems = [];

  if (!aiKey) {
    warnings.push("DEEPSEEK_API_KEY is missing on server, switched to local text parser.");
  } else {
    try {
      const aiItems = await parseMyUwExamsWithDeepSeek({
        text: trimmedText,
        userTimezone: effectiveTimezone,
        apiKey: aiKey,
      });
      normalizedAiItems = dedupeMyUwExamCandidates(aiItems);
      usedAi = true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown AI parsing error";
      warnings.push(`DeepSeek unavailable (${detail}), switched to local text parser.`);
    }
  }

  const textHints = dedupeMyUwExamCandidates(parseMyUwExamsFromText(trimmedText));
  const items = usedAi
    ? dedupeMyUwExamCandidates(mergeMyUwHints(normalizedAiItems, textHints))
    : textHints;

  if (!items.length) {
    return res.status(422).json({
      error: "No valid exams detected. Paste clearer MyUW exam text and retry.",
      reason: "missing fields",
      usedAi,
      warnings,
      items: [],
    });
  }

  const allPast = items.every((item) => isExamPastForGuardrail(item, now, effectiveTimezone));
  if (allPast) {
    const rescueShort = parseMyUwShortTextExams(trimmedText, {
      now,
      userTimezone: effectiveTimezone,
    });
    const rescueItems = rescueShort.items.filter((item) => !isExamPastForGuardrail(item, now, effectiveTimezone));
    if (!rescueShort.errors.length && rescueItems.length) {
      return res.json({
        ok: true,
        provider: "short-text-rescue",
        usedAi: false,
        count: rescueItems.length,
        items: rescueItems,
        warnings: ["AI output looked stale; applied short-text term parser instead."],
      });
    }
  }

  if (allPast) {
    return res.status(422).json({
      error: "all parsed exams are in the past",
      reason: "all parsed exams are in the past",
      usedAi,
      warnings,
      parsedDates: items.map((item) => item.startsAtUtc),
      suggestion: "Use explicit future dates, e.g. CS 400 2026-03-17 7:00 PM midterm",
      items: [],
    });
  }

  return res.json({
    ok: true,
    provider: usedAi ? "deepseek" : "local-fallback",
    usedAi,
    count: items.length,
    items,
    warnings,
  });
});

app.post("/api/sync/import-myuw-exams", async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return badRequest(res, "items must be a non-empty array");
  }

  try {
    const now = new Date();
    const normalizedIncoming = dedupeMyUwExamCandidates(items);

    if (!normalizedIncoming.length) {
      return res.status(422).json({
        error: "No valid exams to import.",
        reason: "missing fields",
      });
    }

    if (normalizedIncoming.every((item) => isExamPastForGuardrail(item, now, DEFAULT_MYUW_TIMEZONE))) {
      return res.status(422).json({
        error: "all parsed exams are in the past",
        reason: "all parsed exams are in the past",
        parsedDates: normalizedIncoming.map((item) => item.startsAtUtc),
      });
    }

    let summary = {
      created: 0,
      updated: 0,
      removedStale: 0,
      totalActive: 0,
    };
    await updateStore((store) => {
      const merged = mergeMyUwImportedExams({
        existingExams: store.exams,
        incomingItems: normalizedIncoming,
        now,
      });
      summary = {
        created: merged.created,
        updated: merged.updated,
        removedStale: merged.removedStale,
        totalActive: merged.totalActive,
      };
      store.exams = merged.exams;
      return store;
    });

    return res.json({
      ok: true,
      created: summary.created,
      updated: summary.updated,
      removedStale: summary.removedStale,
      totalActive: summary.totalActive,
      total: summary.created + summary.updated,
    });
  } catch (_error) {
    return res.status(500).json({ error: "Failed to import MyUW exams" });
  }
});

app.post("/api/tasks", async (req, res) => {
  const { courseCode, courseName, title, dueDate, externalTool, externalUrl } = req.body;

  if (!courseCode || !courseName || !title) {
    return badRequest(res, "courseCode, courseName, and title are required");
  }

  if (!isValidIsoDate(dueDate)) {
    return badRequest(res, "dueDate must be a valid ISO date string");
  }

  const newTask = {
    id: `task-${crypto.randomUUID()}`,
    courseCode,
    courseName,
    title,
    dueDate,
    dueAtUtc: dueDate,
    sourceTimezone: null,
    allDay: false,
    sourceDate: null,
    status: "Not started",
    externalTool: externalTool || undefined,
    externalUrl: externalUrl || undefined,
    reminderSet: false,
    steps: [],
  };

  try {
    await updateStore((store) => {
      store.tasks = [...store.tasks, newTask];
      return store;
    });

    return res.status(201).json(newTask);
  } catch (error) {
    return res.status(500).json({ error: "Failed to create task" });
  }
});

app.post("/api/exams", async (req, res) => {
  const { courseCode, courseName, type, date, time, location, coursePageUrl } = req.body;

  if (!courseCode || !courseName || !type || !time || !location) {
    return badRequest(res, "courseCode, courseName, type, time, and location are required");
  }

  if (!isValidIsoDate(date)) {
    return badRequest(res, "date must be a valid ISO date string");
  }

  const newExam = {
    id: `exam-${crypto.randomUUID()}`,
    courseCode,
    courseName,
    type,
    date,
    startsAtUtc: date,
    endsAtUtc: null,
    sourceTimezone: null,
    allDay: false,
    sourceDate: null,
    time,
    location,
    coursePageUrl: coursePageUrl || undefined,
    reminderSet: false,
  };

  try {
    await updateStore((store) => {
      store.exams = [...store.exams, newExam];
      return store;
    });

    return res.status(201).json(newExam);
  } catch (error) {
    return res.status(500).json({ error: "Failed to create exam" });
  }
});

app.patch("/api/tasks/:taskId/status", async (req, res) => {
  const { taskId } = req.params;
  const { status, submittedDate } = req.body;

  if (!status) {
    return res.status(400).json({ error: "status is required" });
  }

  try {
    let updatedTask = null;
    await updateStore((store) => {
      store.tasks = store.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        updatedTask = {
          ...task,
          status,
          submittedDate: submittedDate || (status === "Submitted" ? new Date().toISOString() : undefined),
        };
        return updatedTask;
      });
      return store;
    });

    if (!updatedTask) {
      return notFound(res, "Task");
    }

    return res.json(updatedTask);
  } catch (error) {
    return res.status(500).json({ error: "Failed to update task status" });
  }
});

app.patch("/api/tasks/:taskId/steps/:stepId", async (req, res) => {
  const { taskId, stepId } = req.params;
  const { completed } = req.body;

  if (typeof completed !== "boolean") {
    return res.status(400).json({ error: "completed must be boolean" });
  }

  try {
    let updatedTask = null;

    await updateStore((store) => {
      store.tasks = store.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const steps = task.steps || [];
        const nextSteps = steps.map((step) => (step.id === stepId ? { ...step, completed } : step));

        updatedTask = { ...task, steps: nextSteps };
        return updatedTask;
      });

      return store;
    });

    if (!updatedTask) {
      return notFound(res, "Task");
    }

    return res.json(updatedTask);
  } catch (error) {
    return res.status(500).json({ error: "Failed to update task step" });
  }
});

app.patch("/api/tasks/:taskId/reminder", async (req, res) => {
  const { taskId } = req.params;
  const { days, addToCalendar } = req.body;

  if (!Number.isInteger(days)) {
    return res.status(400).json({ error: "days must be an integer" });
  }

  try {
    let updatedTask = null;
    await updateStore((store) => {
      store.tasks = store.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        updatedTask = {
          ...task,
          reminderSet: true,
          reminderDays: days,
          addToCalendar: Boolean(addToCalendar),
        };
        return updatedTask;
      });
      return store;
    });

    if (!updatedTask) {
      return notFound(res, "Task");
    }

    return res.json(updatedTask);
  } catch (error) {
    return res.status(500).json({ error: "Failed to set task reminder" });
  }
});

app.patch("/api/exams/:examId/reminder", async (req, res) => {
  const { examId } = req.params;
  const { days, addToCalendar } = req.body;

  if (!Number.isInteger(days)) {
    return res.status(400).json({ error: "days must be an integer" });
  }

  try {
    let updatedExam = null;
    await updateStore((store) => {
      store.exams = store.exams.map((exam) => {
        if (exam.id !== examId) {
          return exam;
        }

        updatedExam = {
          ...exam,
          reminderSet: true,
          reminderDays: days,
          addToCalendar: Boolean(addToCalendar),
        };
        return updatedExam;
      });
      return store;
    });

    if (!updatedExam) {
      return notFound(res, "Exam");
    }

    return res.json(updatedExam);
  } catch (error) {
    return res.status(500).json({ error: "Failed to set exam reminder" });
  }
});

app.post("/api/custom-items", async (req, res) => {
  const { type, title, description, date, time, color } = req.body;

  if (!type || !title || !date) {
    return res.status(400).json({ error: "type, title, and date are required" });
  }

  const newItem = {
    id: `custom-${crypto.randomUUID()}`,
    type,
    title,
    description: description || "",
    date,
    time: time || undefined,
    color: color || "gray",
  };

  try {
    await updateStore((store) => {
      store.customItems = [...store.customItems, newItem];
      return store;
    });

    return res.status(201).json(newItem);
  } catch (error) {
    return res.status(500).json({ error: "Failed to create custom item" });
  }
});

app.delete("/api/custom-items/:itemId", async (req, res) => {
  const { itemId } = req.params;

  try {
    let deleted = false;

    await updateStore((store) => {
      const nextItems = store.customItems.filter((item) => item.id !== itemId);
      deleted = nextItems.length !== store.customItems.length;
      store.customItems = nextItems;
      return store;
    });

    if (!deleted) {
      return notFound(res, "Custom item");
    }

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete custom item" });
  }
});

if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

const startServer = async () => {
  await migrateStoreOnStartup();

  setInterval(() => {
    void runAutoSync();
  }, AUTO_SYNC_INTERVAL_MS);

  app.listen(PORT, () => {
    console.log(`UWStudyHub API running on http://localhost:${PORT}`);
    console.log(`Auto sync interval: ${AUTO_SYNC_INTERVAL_MS}ms`);
  });
};

export const __test = {
  parseEventTimeMeta,
  getSourceDateKey,
  getStableUtcForSourceDate,
  isIgnoredCanvasEvent,
  detectExternalTool,
  parseMyUwShortTextExams,
  parseMyUwShortExamLine,
  parseMyUwStructuredScheduleText,
  isExamPastForGuardrail,
  makeMyUwExamMergeKey,
  mergeMyUwImportedExams,
};

if (process.env.UWSTUDYHUB_TEST_MODE !== "1") {
  void startServer();
}
