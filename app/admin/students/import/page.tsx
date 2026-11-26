"use client";

import React, { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/shared/Button";
import { Badge } from "@/components/shared/Badge";
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  History,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

const TARGET_FIELDS = [
  { key: "fullName", label: "Full Name", required: true },
  { key: "rollNumber", label: "Roll Number", required: true },
  { key: "admissionNumber", label: "Admission Number", required: true },
  { key: "email", label: "Email", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "gender", label: "Gender", required: false },
  { key: "dateOfBirth", label: "Date of Birth", required: false },
  { key: "academicYear", label: "Academic Year", required: false },
  { key: "courseCode", label: "Course Code / Name", required: false },
  { key: "semester", label: "Semester", required: false },
  { key: "section", label: "Section", required: false },
  { key: "batch", label: "Batch", required: false },
  { key: "addressLine", label: "Address", required: false },
  { key: "city", label: "City", required: false },
  { key: "state", label: "State", required: false },
  { key: "postalCode", label: "Postal Code", required: false },
] as const;

const BATCH_SIZE = 75;
const MAX_BATCH_RETRIES = 3;
const BATCH_TIMEOUT_MS = 25000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function BulkStudentImportContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = searchParams.get("tab") === "history" ? "history" : "import";

  const [step, setStep] = useState<"upload" | "map_preview" | "confirm" | "progress" | "complete">("upload");
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState<"CSV" | "XLSX">("CSV");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [validationResults, setValidationResults] = useState<any[]>([]);
  const [summary, setSummary] = useState({ total: 0, valid: 0, duplicatesInFile: 0, existingStudents: 0, errors: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Execution / Progress state
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ processed: 0, total: 0, succeeded: 0, skipped: 0, failed: 0 });
  const [completionErrors, setCompletionErrors] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const res = await fetch("/api/admin/students/import/history", { credentials: "include" });
      const json = await res.json();
      if (json.success) setHistory(json.data || []);
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "history") {
      loadHistory();
    }
  }, [activeTab, loadHistory]);

  const handleFileUpload = async (file: File) => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/students/import/validate", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setErrorMsg(json.error || "Failed to parse uploaded file.");
        return;
      }
      setFileName(json.data.fileName);
      setFileType(json.data.fileType);
      setHeaders(json.data.headers || []);
      setRawRows(json.data.rawRows || []);
      setMapping(json.data.mapping || {});
      setValidationResults(json.data.results || []);
      setSummary(json.data.summary);
      setStep("map_preview");
    } catch (e: any) {
      setErrorMsg(e?.message || "Upload failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleRevalidateMapping = async (nextMapping: Record<string, string>) => {
    setMapping(nextMapping);
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/students/import/validate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, fileType, headers, rawRows, mapping: nextMapping }),
      });
      const json = await res.json();
      if (json.success) {
        setValidationResults(json.data.results || []);
        setSummary(json.data.summary);
      } else {
        setErrorMsg(json.error || "Validation failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  const runBatches = async (
    rowsToImport: any[],
    existingJobId?: string,
    initialCounts?: { processed: number; total: number; succeeded: number; skipped: number; failed: number }
  ) => {
    setStep("progress");
    setErrorMsg(null);
    let currentJobId = existingJobId || jobId;

    if (!currentJobId) {
      const startRes = await fetch("/api/admin/students/import/execute", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          fileName,
          fileType,
          totalRows: rowsToImport.length,
        }),
      });
      const startJson = await startRes.json();
      if (!startRes.ok || !startJson.success) {
        setErrorMsg(startJson.error || "Failed to start import job.");
        setStep("confirm");
        return;
      }
      currentJobId = startJson.data.id;
      setJobId(currentJobId);
      try {
        localStorage.setItem(`sst_import_resume_${currentJobId}`, JSON.stringify(rowsToImport));
      } catch {
        // Ignore storage quota issues on very large files
      }
    }

    let processed = initialCounts?.processed || 0;
    let succeeded = initialCounts?.succeeded || 0;
    let skipped = initialCounts?.skipped || 0;
    let failed = initialCounts?.failed || 0;
    const total = initialCounts?.total || rowsToImport.length;
    const allErrors: any[] = [];
    setProgress({ processed, total, succeeded, skipped, failed });

    for (let i = 0; i < rowsToImport.length; i += BATCH_SIZE) {
      const chunk = rowsToImport.slice(i, i + BATCH_SIZE);
      let batchJson: any = null;
      let batchOk = false;
      let lastErr = "Batch request failed.";

      for (let attempt = 1; attempt <= MAX_BATCH_RETRIES; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), BATCH_TIMEOUT_MS);
        try {
          const batchRes = await fetch("/api/admin/students/import/execute", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              action: "batch",
              jobId: currentJobId,
              rows: chunk,
            }),
          });
          clearTimeout(timer);
          batchJson = await batchRes.json();
          if (batchRes.ok && batchJson.success) {
            batchOk = true;
            break;
          }
          lastErr = batchJson.error || `Batch HTTP ${batchRes.status}`;
          if (batchRes.status >= 400 && batchRes.status < 500) {
            break; // Do not retry client/auth errors
          }
        } catch (err: any) {
          clearTimeout(timer);
          lastErr = err?.name === "AbortError" ? "Request timed out." : err?.message || "Network error.";
        }
        if (attempt < MAX_BATCH_RETRIES) {
          await sleep(500 * Math.pow(2, attempt - 1));
        }
      }

      if (!batchOk) {
        await fetch("/api/admin/students/import/execute", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "pause", jobId: currentJobId }),
        }).catch(() => {});
        setErrorMsg(`${lastErr} Progress saved (${processed}/${total}). You can resume from Import History.`);
        setCompletionErrors(allErrors);
        loadHistory();
        return;
      }

      processed += batchJson.data.processed;
      succeeded += batchJson.data.succeeded;
      skipped += batchJson.data.skipped;
      failed += batchJson.data.failed;
      if (Array.isArray(batchJson.data.errors)) {
        allErrors.push(...batchJson.data.errors);
      }
      setProgress({ processed, total, succeeded, skipped, failed });
    }

    await fetch("/api/admin/students/import/execute", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "finalize", jobId: currentJobId }),
    });
    try {
      localStorage.removeItem(`sst_import_resume_${currentJobId}`);
    } catch {}

    setCompletionErrors(allErrors);
    setStep("complete");
    loadHistory();
  };

  const handleResumeJob = async (h: any) => {
    setErrorMsg(null);
    const res = await fetch("/api/admin/students/import/execute", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resume", jobId: h.id }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      setErrorMsg(json.error || "Unable to resume import job.");
      return;
    }

    let cachedRows: any[] | null = null;
    try {
      const raw = localStorage.getItem(`sst_import_resume_${h.id}`);
      if (raw) cachedRows = JSON.parse(raw);
    } catch {}

    if (!cachedRows || !Array.isArray(cachedRows)) {
      setErrorMsg(
        `Job ${h.id.slice(0, 8)} is ready to resume from row ${json.data.resumeFromIndex + 1}, but browser cache was cleared. Re-upload ${h.fileName} to safely skip already-imported students.`
      );
      router.push("/admin/students/import");
      return;
    }

    const remaining = cachedRows.slice(json.data.resumeFromIndex);
    setJobId(h.id);
    setFileName(h.fileName);
    setFileType(h.fileType);
    router.push("/admin/students/import");
    await runBatches(remaining, h.id, {
      processed: h.processedRows,
      total: h.totalRows,
      succeeded: h.successCount,
      skipped: h.skippedCount,
      failed: h.failedCount,
    });
  };

  const downloadErrorReportCsv = (errorsList: any[], name = "import-errors.csv") => {
    const sanitize = (v: unknown) => {
      const s = String(v ?? "");
      const safe = /^[\t\r ]*[=+\-@]/.test(s) || s.startsWith("\t") || s.startsWith("\r") ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const header = "rowNumber,rollNumber,admissionNumber,error\n";
    const body = errorsList
      .map((e) => `${Number(e.rowNumber) || 0},${sanitize(e.rollNumber)},${sanitize(e.admissionNumber)},${sanitize(e.error)}`)
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const validRowsData = validationResults.filter((r) => r.status === "VALID").map((r) => r.data);
  const progressPct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#0F2942]">Bulk Import Students</h1>
            <p className="text-xs text-[#64748B]">
              Upload CSV or Excel (.xlsx) rosters to onboard students in safe, audited batches without creating login accounts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={activeTab === "import" ? "primary" : "outline"}
              size="sm"
              onClick={() => router.push("/admin/students/import")}
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              Import Wizard
            </Button>
            <Button
              variant={activeTab === "history" ? "primary" : "outline"}
              size="sm"
              onClick={() => router.push("/admin/students/import?tab=history")}
            >
              <History className="w-3.5 h-3.5 mr-1.5" />
              Import History
            </Button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <XCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {activeTab === "history" ? (
          <Card className="shadow-xs">
            <CardHeader className="p-4 border-b border-[#E2E8F0] flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold text-[#1E293B]">Past Import Runs</CardTitle>
              <Button variant="outline" size="sm" onClick={loadHistory} disabled={loadingHistory}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loadingHistory ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="p-4">
              {history.length === 0 ? (
                <p className="text-xs text-[#64748B] text-center py-8">No bulk student import runs recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#F8FAFC] text-[#64748B] uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5">File</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Progress</th>
                        <th className="p-2.5">Uploaded</th>
                        <th className="p-2.5">Processed</th>
                        <th className="p-2.5">Imported</th>
                        <th className="p-2.5">Skipped</th>
                        <th className="p-2.5">Failed</th>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {history.map((h) => {
                        const parsedErrs = h.errorReportJson ? (() => { try { return JSON.parse(h.errorReportJson); } catch { return []; } })() : [];
                        const pct = h.totalRows > 0 ? Math.min(100, Math.round((h.processedRows / h.totalRows) * 100)) : 0;
                        const canResume = (h.status === "PAUSED" || h.status === "PROCESSING") && h.processedRows < h.totalRows && !h.completedAt;
                        return (
                          <tr key={h.id}>
                            <td className="p-2.5 font-medium text-[#0F2942]">{h.fileName} ({h.fileType})</td>
                            <td className="p-2.5">
                              <Badge variant={h.status === "COMPLETED" ? "success" : h.status === "FAILED" ? "error" : "warning"}>
                                {h.status}
                              </Badge>
                            </td>
                            <td className="p-2.5 min-w-[90px]">
                              <div className="text-[10px] font-semibold text-[#334155] mb-1">{pct}%</div>
                              <div className="w-full bg-[#E2E8F0] rounded-full h-1.5">
                                <div className="bg-[#123B5A] h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </td>
                            <td className="p-2.5">{h.totalRows}</td>
                            <td className="p-2.5">{h.processedRows}</td>
                            <td className="p-2.5 text-emerald-700 font-semibold">{h.successCount}</td>
                            <td className="p-2.5 text-amber-700">{h.skippedCount}</td>
                            <td className="p-2.5 text-red-700">{h.failedCount}</td>
                            <td className="p-2.5 text-[#64748B]">{new Date(h.createdAt).toLocaleString()}</td>
                            <td className="p-2.5 text-right space-x-1.5 whitespace-nowrap">
                              {canResume && (
                                <Button variant="primary" size="sm" onClick={() => handleResumeJob(h)}>
                                  Resume
                                </Button>
                              )}
                              {parsedErrs.length > 0 ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => downloadErrorReportCsv(parsedErrs, `errors-${h.id.slice(0, 8)}.csv`)}
                                >
                                  <Download className="w-3 h-3 mr-1" /> CSV
                                </Button>
                              ) : (
                                !canResume && <span className="text-[#94A3B8]">None</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {step === "upload" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2 shadow-xs">
                  <CardHeader className="p-4 border-b border-[#E2E8F0]">
                    <CardTitle className="text-sm font-bold text-[#1E293B]">Step 1 & 2: Download Template & Upload File</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-5">
                    <div className="flex flex-wrap gap-2">
                      <a href="/api/admin/students/import/template?format=csv">
                        <Button variant="outline" size="sm">
                          <Download className="w-3.5 h-3.5 mr-1.5" />
                          Download CSV Template
                        </Button>
                      </a>
                      <a href="/api/admin/students/import/template?format=xlsx">
                        <Button variant="outline" size="sm">
                          <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
                          Download Excel (.xlsx) Template
                        </Button>
                      </a>
                    </div>

                    <label className="block border-2 border-dashed border-[#CBD5E1] rounded-xl p-8 text-center cursor-pointer hover:border-[#F5A000] transition-colors bg-[#F8FAFC]">
                      <Upload className="w-8 h-8 mx-auto mb-2 text-[#123B5A]" />
                      <p className="text-sm font-semibold text-[#0F2942]">
                        {loading ? "Parsing and validating spreadsheet..." : "Click to choose a .csv or .xlsx student file"}
                      </p>
                      <p className="text-[11px] text-[#64748B] mt-1">
                        Max 10 MB, up to 10,000 rows. Macro-enabled workbooks (.xlsm, .xlsb) are blocked.
                      </p>
                      <input
                        type="file"
                        accept=".csv,.xlsx"
                        className="hidden"
                        disabled={loading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFileUpload(f);
                        }}
                      />
                    </label>
                  </CardContent>
                </Card>

                <Card className="shadow-xs">
                  <CardHeader className="p-4 border-b border-[#E2E8F0]">
                    <CardTitle className="text-sm font-bold text-[#1E293B]">Import Guidelines</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 text-xs text-[#475569] space-y-2">
                    <p>• Mandatory fields: <strong>fullName</strong>, <strong>rollNumber</strong>, <strong>admissionNumber</strong>.</p>
                    <p>• Existing students & duplicate identifiers are detected automatically.</p>
                    <p>• Records are processed in safe 75-row transactions.</p>
                    <p>• Login accounts and invitation emails are <strong>not</strong> created automatically.</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {step === "map_preview" && (
              <Card className="shadow-xs">
                <CardHeader className="p-4 border-b border-[#E2E8F0] flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-bold text-[#1E293B]">
                    Step 3–7: Column Mapping, Validation & Duplicate Preview ({fileName})
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setStep("upload")}>Back</Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={summary.valid === 0 || loading}
                      onClick={() => setStep("confirm")}
                    >
                      Continue ({summary.valid} Valid) <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]"><div className="text-[10px] text-[#64748B]">Total</div><div className="text-lg font-bold">{summary.total}</div></div>
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200"><div className="text-[10px] text-emerald-700">Valid</div><div className="text-lg font-bold text-emerald-800">{summary.valid}</div></div>
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200"><div className="text-[10px] text-amber-700">Existing DB</div><div className="text-lg font-bold text-amber-800">{summary.existingStudents}</div></div>
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200"><div className="text-[10px] text-amber-700">File Duplicates</div><div className="text-lg font-bold text-amber-800">{summary.duplicatesInFile}</div></div>
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200"><div className="text-[10px] text-red-700">Errors</div><div className="text-lg font-bold text-red-800">{summary.errors}</div></div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-[#1E293B] mb-2">Column Mapping</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                      {TARGET_FIELDS.map((f) => (
                        <div key={f.key} className="text-xs">
                          <label className="block text-[11px] font-medium text-[#475569] mb-1">
                            {f.label} {f.required && <span className="text-red-500">*</span>}
                          </label>
                          <select
                            className="w-full border border-[#CBD5E1] rounded-md px-2 py-1.5 text-xs bg-white"
                            value={mapping[f.key] || ""}
                            onChange={(e) => handleRevalidateMapping({ ...mapping, [f.key]: e.target.value })}
                          >
                            <option value="">-- Unmapped --</option>
                            {headers.map((h) => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-x-auto max-h-80 border border-[#E2E8F0] rounded-lg">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#F8FAFC] text-[#64748B] sticky top-0">
                        <tr>
                          <th className="p-2">Row</th>
                          <th className="p-2">Status</th>
                          <th className="p-2">Full Name</th>
                          <th className="p-2">Roll No</th>
                          <th className="p-2">Admission No</th>
                          <th className="p-2">Issues</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {validationResults.slice(0, 100).map((r) => (
                          <tr key={r.rowNumber}>
                            <td className="p-2 text-[#64748B]">{r.rowNumber}</td>
                            <td className="p-2">
                              <Badge variant={r.status === "VALID" ? "success" : r.status === "ERROR" ? "error" : "warning"}>
                                {r.status}
                              </Badge>
                            </td>
                            <td className="p-2 font-medium">{r.data.fullName}</td>
                            <td className="p-2">{r.data.rollNumber}</td>
                            <td className="p-2">{r.data.admissionNumber}</td>
                            <td className="p-2 text-red-600">{r.errors.join(" ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === "confirm" && (
              <Card className="shadow-xs">
                <CardHeader className="p-4 border-b border-[#E2E8F0]">
                  <CardTitle className="text-sm font-bold text-[#1E293B]">Step 8: Confirm Bulk Student Import</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4 text-xs">
                  <p className="text-[#334155]">
                    Ready to import <strong>{validRowsData.length}</strong> valid student records from <strong>{fileName}</strong> in batches of {BATCH_SIZE}.
                    {summary.existingStudents + summary.duplicatesInFile > 0 && ` ${summary.existingStudents + summary.duplicatesInFile} duplicate/existing rows will be safely skipped.`}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setStep("map_preview")}>Back to Preview</Button>
                    <Button variant="primary" size="sm" onClick={() => runBatches(validRowsData)}>
                      Start Import ({validRowsData.length} Students)
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === "progress" && (
              <Card className="shadow-xs">
                <CardHeader className="p-4 border-b border-[#E2E8F0]">
                  <CardTitle className="text-sm font-bold text-[#1E293B]">Step 9: Importing Students...</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="w-full bg-[#E2E8F0] rounded-full h-3 overflow-hidden">
                    <div className="bg-[#123B5A] h-3 transition-all" style={{ width: `${progressPct}%` }} />
                  </div>
                  <p className="text-xs text-[#475569]">
                    Processed {progress.processed} of {progress.total} rows ({progressPct}%) — Imported: {progress.succeeded}, Skipped: {progress.skipped}, Failed: {progress.failed}
                  </p>
                </CardContent>
              </Card>
            )}

            {step === "complete" && (
              <Card className="shadow-xs">
                <CardHeader className="p-4 border-b border-[#E2E8F0]">
                  <CardTitle className="text-sm font-bold text-[#1E293B] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Step 10: Import Completion Report
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4 text-xs">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200"><div className="text-emerald-700">Imported</div><div className="text-lg font-bold">{progress.succeeded}</div></div>
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200"><div className="text-amber-700">Skipped</div><div className="text-lg font-bold">{progress.skipped}</div></div>
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200"><div className="text-red-700">Failed</div><div className="text-lg font-bold">{progress.failed}</div></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {completionErrors.length > 0 && (
                      <Button variant="outline" size="sm" onClick={() => downloadErrorReportCsv(completionErrors)}>
                        <Download className="w-3.5 h-3.5 mr-1.5" /> Download Error Report CSV
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => router.push("/admin/students/import?tab=history")}>
                      View Import History
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => router.push("/admin/students")}>
                      Go to Students Directory
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
  );
}

export default function BulkStudentImportPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-[#64748B]">Loading Bulk Student Import...</div>}>
      <BulkStudentImportContent />
    </Suspense>
  );
}
