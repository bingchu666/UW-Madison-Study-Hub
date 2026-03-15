import { useState } from "react";
import { useAppContext } from "../context";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Textarea } from "./ui/textarea";
import { RefreshCw, Link2, Trash2, Play, ClipboardPaste, Copy, Wand2 } from "lucide-react";
import { formatLocalDateTime, getUserTimeZone } from "../utils/time";

const CANVAS_EXTRACTOR_CODE = `javascript:(()=>{const rows=[...document.querySelectorAll('tr,li,.PlannerItem,.ic-AssignmentRow')];const items=[];rows.forEach(row=>{const title=(row.querySelector('.ig-title,.title,a,h2,h3,[data-testid*="title"]')||{}).textContent?.trim();const due=(row.querySelector('.date-due,.due,[data-testid*="due"],time')||{}).textContent?.trim();if(!title||!due)return;const course=(row.querySelector('.course,.context,.pill')||{}).textContent?.trim()||'';items.push({title,courseName:course,dueDate:new Date(due).toISOString()});});const txt=JSON.stringify(items,null,2);navigator.clipboard?.writeText(txt).then(()=>alert('Assignment JSON copied. Paste into StudyHub import.')).catch(()=>prompt('Copy JSON below',txt));})();`;
const MYUW_EXAM_TEMPLATE = `[
  {
    "courseCode": "CS 540",
    "courseName": "Introduction to AI",
    "type": "Midterm",
    "startsAtUtc": "2026-03-25T19:00:00.000Z",
    "endsAtUtc": "2026-03-25T20:15:00.000Z",
    "location": "Van Vleck Hall 101",
    "coursePageUrl": "https://my.wisc.edu"
  }
]`;

export default function SyncCenter() {
  const {
    syncSources,
    addSyncSource,
    deleteSyncSource,
    runAllSync,
    runSyncSource,
    rebuildSync,
    importCanvasJson,
    importMyUwExams,
    parseMyUwExams,
    loading,
    error,
  } = useAppContext();

  const [name, setName] = useState("Canvas Calendar");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");
  const [jsonPayload, setJsonPayload] = useState("");
  const [myUwExamPayload, setMyUwExamPayload] = useState("");
  const [myUwRawText, setMyUwRawText] = useState("");
  const [parsingMyUwInput, setParsingMyUwInput] = useState(false);
  const [importResult, setImportResult] = useState("");
  const userTimeZone = getUserTimeZone();

  const handleAddSource = async () => {
    if (!name.trim() || !url.trim()) {
      setLocalError("Please fill in both Source Name and ICS URL.");
      return;
    }

    setLocalError("");
    const normalizedUrl = url.trim().replace(/^webcal:\/\//i, "https://");

    setSubmitting(true);
    try {
      await addSyncSource({ name: name.trim(), url: normalizedUrl });
      setUrl("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleImportJson = async () => {
    setImportResult("");
    try {
      const parsed = JSON.parse(jsonPayload);
      if (!Array.isArray(parsed)) {
        setImportResult("Import failed: JSON root must be an array.");
        return;
      }

      const normalized = parsed
        .map((item) => ({
          title: String(item.title || "").trim(),
          dueDate: String(item.dueDate || "").trim(),
          courseCode: item.courseCode ? String(item.courseCode).trim() : undefined,
          courseName: item.courseName ? String(item.courseName).trim() : undefined,
          externalUrl: item.externalUrl ? String(item.externalUrl).trim() : undefined,
        }))
        .filter((item) => item.title && item.dueDate);

      if (normalized.length === 0) {
        setImportResult("Import failed: no valid items found (requires title + dueDate).");
        return;
      }

      const result = await importCanvasJson(normalized);
      if (!result) {
        return;
      }

      setImportResult(`Canvas tasks imported: ${result.created} created, ${result.updated} updated.`);
      setJsonPayload("");
    } catch (_err) {
      setImportResult("Import failed: invalid JSON format.");
    }
  };

  const handleAiParseAndImportMyUwExams = async () => {
    setImportResult("");

    if (!myUwRawText.trim()) {
      setImportResult("Please paste MyUW exam text first.");
      return;
    }

    setParsingMyUwInput(true);
    try {
      const parsed = await parseMyUwExams({
        text: myUwRawText.trim(),
        userTimezone: userTimeZone,
      });
      if (!parsed) {
        return;
      }

      if (!parsed.items.length) {
        setImportResult("No valid exams detected. Try a clearer MyUW block or short format like: CS 400 2026-03-17 7:00 PM midterm.");
        return;
      }

      setMyUwExamPayload(JSON.stringify(parsed.items, null, 2));

      const imported = await importMyUwExams(parsed.items);
      if (!imported) {
        return;
      }

      const warningText = parsed.warnings?.length ? ` Warnings: ${parsed.warnings.join(" | ")}` : "";
      setImportResult(
        `Parsed ${parsed.count} exam item(s) via ${parsed.provider} and imported ${imported.created} created, ${imported.updated} updated, ${imported.removedStale} removed stale, ${imported.totalActive} active.${warningText}`,
      );
      setMyUwRawText("");
    } finally {
      setParsingMyUwInput(false);
    }
  };

  const handleImportMyUwExams = async () => {
    setImportResult("");
    try {
      const parsed = JSON.parse(myUwExamPayload);
      if (!Array.isArray(parsed)) {
        setImportResult("MyUW exam import failed: JSON root must be an array.");
        return;
      }

      const normalized = parsed
        .map((item) => ({
          courseCode: String(item.courseCode || "").trim(),
          courseName: String(item.courseName || "").trim(),
          type: String(item.type || "Midterm").trim(),
          startsAtUtc: String(item.startsAtUtc || item.date || "").trim(),
          endsAtUtc: item.endsAtUtc ? String(item.endsAtUtc).trim() : null,
          location: item.location ? String(item.location).trim() : "TBA",
          time: item.time ? String(item.time).trim() : "",
          coursePageUrl: item.coursePageUrl ? String(item.coursePageUrl).trim() : undefined,
          uid: item.uid ? String(item.uid).trim() : undefined,
        }))
        .filter((item) => item.courseCode && item.courseName && item.startsAtUtc);

      if (normalized.length === 0) {
        setImportResult("MyUW exam import failed: no valid items found.");
        return;
      }

      const result = await importMyUwExams(normalized);
      if (!result) {
        return;
      }

      setImportResult(
        `MyUW exams imported: ${result.created} created, ${result.updated} updated, ${result.removedStale} removed stale, ${result.totalActive} active.`,
      );
      setMyUwExamPayload("");
    } catch (_err) {
      setImportResult("MyUW exam import failed: invalid JSON format.");
    }
  };

  const copyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(CANVAS_EXTRACTOR_CODE);
      setImportResult("Canvas bookmarklet copied.");
    } catch (_err) {
      setImportResult("Copy failed. Check browser permissions.");
      console.log(CANVAS_EXTRACTOR_CODE);
    }
  };

  const pasteMyUwTemplate = () => {
    setMyUwExamPayload(MYUW_EXAM_TEMPLATE);
    setImportResult("MyUW exam template pasted. Replace values and click Import MyUW Exams.");
  };

  if (loading) {
    return <div className="max-w-7xl mx-auto py-8 text-gray-600">Loading sync center...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Sync Center</h1>
        <p className="text-gray-600">Canvas sync for tasks only. Exams are imported from MyUW with AI text parsing.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Canvas ICS Sync (Tasks)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-2 block">Source Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Canvas Calendar" />
            </div>
            <div>
              <Label className="mb-2 block">ICS URL</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://.../calendar.ics" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void handleAddSource()}
              disabled={submitting || !name.trim() || !url.trim()}
              className="bg-red-700 hover:bg-red-800"
            >
              <Link2 className="h-4 w-4 mr-2" />
              {submitting ? "Adding..." : "Add Source"}
            </Button>
            <Button variant="outline" onClick={() => void runAllSync()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Run All Sync
            </Button>
            <Button variant="outline" onClick={() => void rebuildSync()}>
              Rebuild Synced Data
            </Button>
          </div>
          <p className="text-xs text-gray-500">Detected user timezone: {userTimeZone}</p>
          {localError && <p className="text-sm text-red-700">{localError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Canvas JSON Fallback (Tasks)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void copyBookmarklet()}>
              <Copy className="h-4 w-4 mr-2" />
              Copy Canvas Bookmarklet
            </Button>
          </div>
          <Label className="mb-2 block">Canvas Task JSON</Label>
          <Textarea
            value={jsonPayload}
            onChange={(e) => setJsonPayload(e.target.value)}
            placeholder='[{"title":"HW1","dueDate":"2026-03-20T23:59:00.000Z","courseName":"CS 540"}]'
            rows={6}
          />
          <Button onClick={() => void handleImportJson()} disabled={!jsonPayload.trim()} className="bg-red-700 hover:bg-red-800">
            <ClipboardPaste className="h-4 w-4 mr-2" />
            Import Canvas Tasks
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MyUW AI Auto Import (Paste Text Only)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 space-y-2">
            <p className="font-semibold">One-step flow</p>
            <p>1. Copy exam text from MyUW and paste it below.</p>
            <p>2. Click <code>Parse and Import Exams</code>.</p>
            <p>3. Exams page updates immediately after import.</p>
            <p className="pt-1 text-blue-800">
              Short syntax supported: <code>cs 400 3.17 midterm</code>, <code>cs400 3/17 final</code>, <code>COMP SCI 400 3-17 quiz</code>.
            </p>
            <p className="text-blue-800">
              If month/day already passed in this term, include a year (example: <code>CS 400 2027-03-01 midterm</code>).
            </p>
          </div>

          <Label className="mb-2 block">MyUW Exam Text</Label>
          <Textarea
            value={myUwRawText}
            onChange={(e) => setMyUwRawText(e.target.value)}
            placeholder={`Examples:\ncs 400 3.17 midterm\ncs400 3/17 final\nCOMP SCI 400 2026-03-17 7:00 PM midterm`}
            rows={6}
          />

          <Button
            onClick={() => void handleAiParseAndImportMyUwExams()}
            disabled={parsingMyUwInput || !myUwRawText.trim()}
            className="bg-red-700 hover:bg-red-800"
          >
            <Wand2 className="h-4 w-4 mr-2" />
            {parsingMyUwInput ? "Parsing and Importing..." : "Parse and Import Exams"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MyUW Exam JSON (Optional Manual Review)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 space-y-2">
            <p className="font-semibold">Optional manual fallback</p>
            <p>You can still paste JSON directly if needed.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={pasteMyUwTemplate}>
              Paste MyUW JSON Template
            </Button>
          </div>
          <Label className="mb-2 block">MyUW Exam JSON</Label>
          <Textarea
            value={myUwExamPayload}
            onChange={(e) => setMyUwExamPayload(e.target.value)}
            placeholder='[{"courseCode":"CS 540","courseName":"Intro to AI","type":"Midterm","startsAtUtc":"2026-03-25T19:00:00.000Z","location":"Room 101"}]'
            rows={6}
          />
          <Button
            onClick={() => void handleImportMyUwExams()}
            disabled={!myUwExamPayload.trim()}
            className="bg-red-700 hover:bg-red-800"
          >
            <ClipboardPaste className="h-4 w-4 mr-2" />
            Import MyUW Exams
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sync Sources</CardTitle>
        </CardHeader>
        <CardContent>
          {syncSources.length === 0 ? (
            <p className="text-gray-500">No sync source yet. Add a Canvas ICS link first.</p>
          ) : (
            <div className="space-y-3">
              {syncSources.map((source) => (
                <div
                  key={source.id}
                  className="rounded-lg border border-gray-200 bg-white/70 p-4 flex items-start justify-between gap-4"
                >
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{source.name}</h3>
                      <Badge variant="outline">{source.type}</Badge>
                      {source.lastStatus && (
                        <Badge variant={source.lastStatus === "success" ? "default" : "secondary"}>{source.lastStatus}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 break-all">{source.url}</p>
                    <p className="text-xs text-gray-600">
                      Last run: {source.lastRunAt ? formatLocalDateTime(source.lastRunAt) : "Never"}
                      {source.lastMessage ? ` · ${source.lastMessage}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => void runSyncSource(source.id)}>
                      <Play className="h-4 w-4 mr-1" />
                      Sync
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void deleteSyncSource(source.id)}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {importResult && <p className="text-sm text-green-700">{importResult}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
