'use client';

import React, { useState, useEffect } from 'react';
import { Folder, File, UploadCloud, ShieldAlert, CheckCircle, Search, MoreVertical } from 'lucide-react';
import { Card } from '@/components/ui/card';
import FileUploader from './FileUploader';
import FilePreviewModal from './FilePreviewModal';
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from '@/contexts/LocalizationContext';

export interface FileData {
  id: string;
  name: string;
  type: string;
  status: string;
  pii: string;
  size: string;
  [key: string]: unknown;
}

export interface FolderData {
  id: string;
  data: {
    name: string;
    quota_bytes: number;
    used_bytes: number;
    max_file_size_bytes: number;
  };
}

function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function DriveView() {
  const { t } = useLocalization();
  const unnamedFile = t('drive.unnamedFile');
  const [files, setFiles] = useState<FileData[]>([]);
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [isUploaderOpen, setIsUploaderOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const loadDrive = async () => {
      try {
        const [folderResponse, fileResponse] = await Promise.all([
          fetchWithAuth(`${API_BASE_URL}/documents/folders`),
          fetchWithAuth(`${API_BASE_URL}/drive/files`),
        ]);
        if (folderResponse.ok) {
          const data = await folderResponse.json();
          if (Array.isArray(data)) setFolders(data);
        }
        if (fileResponse.ok) {
          const data = await fileResponse.json();
          if (Array.isArray(data)) {
            setFiles(data.map((file: Record<string, unknown>) => {
              const metadata = (file.data || {}) as Record<string, unknown>;
              const name = String(file.name || unnamedFile);
              return {
                id: String(file.id),
                name,
                type: name.split('.').pop() || 'file',
                status: String(metadata.status || 'pending_scan'),
                pii: String(metadata.security_policy || 'unknown'),
                size: formatBytes(Number(metadata.size || 0)),
                url: metadata.url,
                ai_summary: metadata.ai_summary,
                created_at: file.created_at,
              };
            }));
          }
        }
      } catch (err) {
        console.error('Error loading drive:', err);
      }
    };
    void loadDrive();
  }, [unnamedFile]);

  const handleUploadSuccess = (fileData: Record<string, unknown>) => {
    const name = String(fileData.name || unnamedFile);
    setFiles((prev: FileData[]) => [
      {
        id: String(fileData.id || fileData.file_id),
        name,
        type: name.split('.').pop() || 'file',
        status: String(fileData.status || 'ready'),
        pii: String(fileData.security_policy || 'malware_scan_passed'),
        size: formatBytes(Number(fileData.size || 0)),
        url: fileData.url,
      },
      ...prev
    ]);
  };

  return (
    <div data-testid="drive-view" className="h-full w-full max-w-7xl mx-auto space-y-6 overflow-y-auto p-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('drive.title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('drive.description')}</p>
        </div>
        <div className="flex gap-3">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder={t('drive.searchPlaceholder')} aria-label={t('drive.searchPlaceholder')} className="w-full rounded-xl border border-border bg-card py-2 pe-4 ps-9 text-foreground shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
          <button 
            onClick={() => setIsUploaderOpen(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-lg shadow-blue-500/20"
          >
            <UploadCloud className="h-4 w-4" />
            <span className="hidden sm:inline">{t('drive.uploadFile')}</span>
          </button>
        </div>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        
        {/* Storage Widget (Bento large item) */}
        <Card className="col-span-1 md:col-span-2 lg:col-span-1 p-6 rounded-3xl bg-card dark:bg-[#1a1d21] border-border dark:border-slate-800 flex flex-col justify-between overflow-hidden relative shadow-sm hover:shadow-md transition-shadow">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
          <div className="relative z-10">
            <h3 className="text-lg font-bold text-foreground">{t('drive.storageOverview')}</h3>
            <p className="text-sm text-muted-foreground">{t('drive.workspaceQuotaUsage')}</p>
          </div>
          <div className="mt-6 space-y-3 relative z-10">
            {folders.length > 0 ? (() => {
              const totalQuota = folders.reduce((acc, f) => acc + (f.data?.quota_bytes || 0), 0);
              const totalUsed = folders.reduce((acc, f) => acc + (f.data?.used_bytes || 0), 0);
              const storagePercentage = totalQuota > 0 ? (totalUsed / totalQuota) * 100 : 0;
              return (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground dark:text-white font-medium">{formatBytes(totalUsed)}</span>
                    <span className="text-muted-foreground dark:text-muted-foreground">{formatBytes(totalQuota)}</span>
                  </div>
                  <div className="w-full bg-muted dark:bg-slate-800 rounded-full h-3">
                    <div className="bg-blue-600 h-3 rounded-full" style={{ width: `${storagePercentage}%` }}></div>
                  </div>
                </>
              );
            })() : <p className="text-sm text-muted-foreground">{t('drive.noFolderQuotas')}</p>}
          </div>
        </Card>

        {/* Shield Status Widget */}
        <Card className="col-span-1 p-6 rounded-3xl bg-card dark:bg-[#1a1d21] border-border dark:border-slate-800 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-md transition-shadow">
          <div>
            <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
            <h3 className="text-lg font-bold text-foreground">{t('drive.shield')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('drive.activeMonitoring')}</p>
          </div>
        </Card>

        {/* Folders row */}
        <div className="col-span-1 md:col-span-3 lg:col-span-2 grid grid-cols-2 gap-4">
          {folders.length > 0 ? folders.map((folder: FolderData) => (
            <Card key={folder.id} className="p-4 rounded-3xl bg-card dark:bg-[#1a1d21] border-border dark:border-slate-800 hover:bg-muted dark:hover:bg-slate-800/80 transition-all cursor-pointer flex flex-col justify-center gap-3 shadow-sm group">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 group-hover:scale-110 transition-transform">
                    <Folder className="h-5 w-5 fill-blue-500/20" />
                  </div>
                  <span className="font-bold text-foreground">{folder.data?.name || t('drive.folder')}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs font-medium text-muted-foreground">
                    {formatBytes(folder.data?.used_bytes || 0)} / {formatBytes(folder.data?.quota_bytes || 0)}
                  </span>
                </div>
              </div>
            </Card>
          )) : <p className="col-span-2 text-sm text-muted-foreground">{t('drive.noFolders')}</p>}
        </div>
      </div>

      {/* Recent Files List */}
      <div className="mt-8">
        <h2 className="mb-4 text-xl font-bold tracking-tight text-foreground">{t('drive.recentFiles')}</h2>
        <div className="bg-card dark:bg-[#1a1d21] border border-border dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-foreground dark:text-slate-100">
              <thead className="bg-muted dark:bg-slate-900/50 text-muted-foreground dark:text-muted-foreground border-b border-border dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 font-medium whitespace-nowrap">{t('drive.name')}</th>
                  <th className="px-6 py-4 font-medium whitespace-nowrap">{t('drive.size')}</th>
                  <th className="px-6 py-4 font-medium whitespace-nowrap">{t('drive.shieldStatus')}</th>
                  <th className="px-6 py-4 font-medium text-end whitespace-nowrap">{t('drive.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {files.map((file: FileData) => (
                  <tr 
                    key={file.id} 
                    onClick={() => setPreviewFile(file)}
                    className="hover:bg-muted dark:hover:bg-slate-800/50 transition-colors group cursor-pointer border-b border-border dark:border-slate-800/50 last:border-0"
                  >
                    <td className="px-6 py-4 flex items-center gap-3 min-w-[250px]">
                      <div className="p-2 bg-muted dark:bg-slate-950 rounded-xl shadow-sm border border-border dark:border-slate-800">
                        <File className="h-4 w-4 text-muted-foreground dark:text-muted-foreground" />
                      </div>
                      <span className="font-medium text-foreground dark:text-white">{file.name}</span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground dark:text-muted-foreground whitespace-nowrap">{file.size}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {file.pii === 'restricted' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20">
                          <ShieldAlert className="h-3.5 w-3.5" /> {t('drive.piiRestricted')}
                        </span>
                      ) : file.pii === 'clear' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20">
                          <CheckCircle className="h-3.5 w-3.5" /> {t('drive.safe')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                          </span>
                          {t('drive.scanning')}
                        </span>
                      )}
                    </td>
                    <td className="flex justify-end gap-2 px-6 py-4 text-end">
                      <button title={t('drive.fileActions')} aria-label={t('drive.fileActions')} className="rounded-xl p-2 opacity-0 transition-colors hover:bg-muted group-hover:opacity-100">
                        <MoreVertical className="h-4 w-4 text-muted-foreground dark:text-muted-foreground" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      <FileUploader 
        isOpen={isUploaderOpen} 
        onClose={() => setIsUploaderOpen(false)} 
        onUploadSuccess={handleUploadSuccess}
      />

      {/* Preview Modal */}
      <FilePreviewModal
        file={previewFile}
        isOpen={!!previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  );
}
