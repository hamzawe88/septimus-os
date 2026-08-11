"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  HardDrive,
  Loader2,
  Search,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet, fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

interface DocumentEntity {
  id: string;
  entity_type: string;
  data: {
    name: string;
    url: string;
    size: number;
    status: "processing" | "ready" | "failed";
    source?: "drive" | "upload";
    source_drive_file_id?: string;
    indexed_chunks?: number;
    index_error?: string;
  };
  created_at: string;
}

interface DriveFile {
  id: string;
  name: string;
  created_at: string;
  data: {
    size?: number;
    mime_type?: string;
    status?: string;
    security_policy?: string;
  };
}

type Notice = { kind: "success" | "error"; message: string } | null;

const INDEXABLE_EXTENSIONS = new Set(["pdf", "docx", "txt", "md"]);

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export default function KnowledgeBase() {
  const { t, formatDate } = useLocalization();
  const [documents, setDocuments] = useState<DocumentEntity[]>([]);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDriveOpen, setIsDriveOpen] = useState(false);
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedDriveIds, setSelectedDriveIds] = useState<Set<string>>(new Set());
  const [driveQuery, setDriveQuery] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const response = await apiGet<DocumentEntity[]>("/documents");
      setDocuments(Array.isArray(response) ? response : []);
    } catch (error) {
      console.error("Failed to fetch knowledge documents", error);
      setNotice({ kind: "error", message: t("knowledge.loadFailed") });
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // Initial synchronization with the server-owned Knowledge Base.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    if (!documents.some((document) => document.data.status === "processing")) return;
    const timer = window.setInterval(() => void fetchDocuments(), 4000);
    return () => window.clearInterval(timer);
  }, [documents, fetchDocuments]);

  const importedDriveIds = useMemo(
    () => new Set(documents.map((document) => document.data.source_drive_file_id).filter(Boolean)),
    [documents],
  );

  const eligibleDriveFiles = useMemo(() => {
    const query = driveQuery.trim().toLocaleLowerCase();
    return driveFiles.filter((file) => {
      const extension = file.name.split(".").pop()?.toLocaleLowerCase() || "";
      return (
        INDEXABLE_EXTENSIONS.has(extension) &&
        file.data.status === "ready" &&
        file.data.security_policy === "malware_scan_passed" &&
        !importedDriveIds.has(file.id) &&
        (!query || file.name.toLocaleLowerCase().includes(query))
      );
    });
  }, [driveFiles, driveQuery, importedDriveIds]);

  const openDrivePicker = async () => {
    setIsDriveOpen(true);
    setIsDriveLoading(true);
    setNotice(null);
    setSelectedDriveIds(new Set());
    try {
      const response = await apiGet<DriveFile[]>("/drive/files");
      setDriveFiles(Array.isArray(response) ? response : []);
    } catch (error) {
      console.error("Failed to load Drive files", error);
      setNotice({ kind: "error", message: t("knowledge.driveLoadFailed") });
    } finally {
      setIsDriveLoading(false);
    }
  };

  const toggleDriveFile = (fileID: string) => {
    setSelectedDriveIds((current) => {
      const next = new Set(current);
      if (next.has(fileID)) next.delete(fileID);
      else next.add(fileID);
      return next;
    });
  };

  const importSelectedDriveFiles = async () => {
    if (selectedDriveIds.size === 0) return;
    setIsImporting(true);
    setNotice(null);
    let imported = 0;
    const failures: string[] = [];
    for (const fileID of selectedDriveIds) {
      try {
        const response = await fetchWithAuth(`${API_BASE_URL}/documents/import-drive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_id: fileID }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          failures.push(body.error || String(response.status));
          continue;
        }
        imported += 1;
      } catch (error) {
        failures.push(error instanceof Error ? error.message : "request failed");
      }
    }
    await fetchDocuments();
    setIsImporting(false);
    if (failures.length === 0) {
      setNotice({
        kind: "success",
        message: t("knowledge.driveImportSuccess").replace("{count}", String(imported)),
      });
      setIsDriveOpen(false);
      setSelectedDriveIds(new Set());
    } else {
      setNotice({ kind: "error", message: t("knowledge.driveImportPartial") });
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setNotice(null);
    const formData = new FormData();
    formData.append("document", file);
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/documents/upload`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || t("knowledge.uploadFailed"));
      }
      await fetchDocuments();
      setNotice({ kind: "success", message: t("knowledge.uploadQueued") });
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : t("knowledge.uploadFailed"),
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <section data-testid="knowledge-base" className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="flex flex-none flex-col gap-4 border-b border-border bg-card px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Database className="h-6 w-6 text-brand" aria-hidden />
            {t("knowledge.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("knowledge.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            title={t("knowledge.uploadDocument")}
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            accept=".pdf,.txt,.md,.docx"
          />
          <Button variant="outline" onClick={() => void openDrivePicker()} className="gap-2">
            <HardDrive className="h-4 w-4" aria-hidden />
            {t("knowledge.chooseFromDrive")}
          </Button>
          <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="gap-2">
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {t("knowledge.uploadDocument")}
          </Button>
        </div>
      </header>

      {notice && (
        <div
          role="status"
          className={`mx-4 mt-4 flex items-center gap-2 rounded-[var(--radius-control)] border px-4 py-3 text-sm sm:mx-8 ${
            notice.kind === "success"
              ? "border-success/25 bg-success/10 text-success"
              : "border-destructive/25 bg-destructive/10 text-destructive"
          }`}
        >
          {notice.kind === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          <span>{notice.message}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
        ) : documents.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-[var(--radius-surface)] border border-dashed border-border bg-card px-6 text-center">
            <Database className="mb-4 h-12 w-12 text-muted-foreground/40" aria-hidden />
            <p className="text-lg font-semibold">{t("knowledge.emptyTitle")}</p>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">{t("knowledge.emptyDescription")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {documents.map((document) => {
              const data = document.data;
              const isProcessing = data.status === "processing";
              const isFailed = data.status === "failed";
              return (
                <article key={document.id} className="flex min-w-0 flex-col justify-between rounded-[var(--radius-surface)] border border-border bg-card p-5 shadow-[var(--shadow-raised)]">
                  <div>
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="rounded-[var(--radius-control)] bg-brand/10 p-3 text-brand"><FileText className="h-6 w-6" /></div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {data.source === "drive" ? <HardDrive className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
                        {data.source === "drive" ? t("knowledge.driveSource") : t("knowledge.uploadSource")}
                      </span>
                    </div>
                    <h2 className="truncate font-semibold" title={data.name}>{data.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{formatBytes(Number(data.size || 0))}</p>
                    {isFailed && data.index_error && <p className="mt-3 line-clamp-2 text-xs text-destructive">{data.index_error}</p>}
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-3">
                    <time className="text-xs text-muted-foreground" dateTime={document.created_at}>{formatDate(document.created_at)}</time>
                    {isProcessing ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-warning"><Clock className="h-3.5 w-3.5" />{t("knowledge.processing")}</span>
                    ) : isFailed ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-destructive"><XCircle className="h-3.5 w-3.5" />{t("knowledge.failed")}</span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-success"><CheckCircle2 className="h-3.5 w-3.5" />{t("knowledge.ready")}</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {isDriveOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-foreground/40 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !isImporting) setIsDriveOpen(false); }}>
          <div data-testid="drive-import-dialog" role="dialog" aria-modal="true" aria-labelledby="drive-import-title" className="flex max-h-[min(760px,92vh)] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-surface)] border border-border bg-popover text-popover-foreground shadow-[var(--shadow-overlay)]">
            <div className="flex items-start justify-between gap-4 border-b border-border p-5">
              <div>
                <h2 id="drive-import-title" className="flex items-center gap-2 text-lg font-bold"><HardDrive className="h-5 w-5 text-brand" />{t("knowledge.drivePickerTitle")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("knowledge.drivePickerDescription")}</p>
              </div>
              <button type="button" onClick={() => setIsDriveOpen(false)} disabled={isImporting} className="rounded-[var(--radius-control)] p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t("common.close")}><X className="h-5 w-5" /></button>
            </div>
            <div className="border-b border-border p-4">
              <label className="relative block">
                <span className="sr-only">{t("knowledge.searchDrive")}</span>
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={driveQuery} onChange={(event) => setDriveQuery(event.target.value)} placeholder={t("knowledge.searchDrive")} className="h-10 w-full rounded-[var(--radius-control)] border border-input bg-background ps-10 pe-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </label>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {isDriveLoading ? (
                <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
              ) : eligibleDriveFiles.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center text-center text-sm text-muted-foreground"><HardDrive className="mb-3 h-9 w-9 opacity-40" /><p>{t("knowledge.noEligibleDriveFiles")}</p></div>
              ) : (
                <div className="space-y-2">
                  {eligibleDriveFiles.map((file) => {
                    const selected = selectedDriveIds.has(file.id);
                    return (
                      <button key={file.id} type="button" role="checkbox" aria-checked={selected} onClick={() => toggleDriveFile(file.id)} className={`flex w-full items-center gap-3 rounded-[var(--radius-control)] border p-3 text-start transition-colors ${selected ? "border-brand bg-brand/10" : "border-border bg-card hover:bg-muted"}`}>
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${selected ? "border-brand bg-brand text-brand-foreground" : "border-input"}`}>{selected && <Check className="h-3.5 w-3.5" />}</span>
                        <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{file.name}</span><span className="block text-xs text-muted-foreground">{formatBytes(Number(file.data.size || 0))} · {formatDate(file.created_at)}</span></span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">{t("knowledge.selectedCount").replace("{count}", String(selectedDriveIds.size))}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsDriveOpen(false)} disabled={isImporting}>{t("common.cancel")}</Button>
                <Button onClick={() => void importSelectedDriveFiles()} disabled={selectedDriveIds.size === 0 || isImporting} className="gap-2">{isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}{t("knowledge.importAndIndex")}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
