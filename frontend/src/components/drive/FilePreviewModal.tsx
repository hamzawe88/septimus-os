'use client';

import React from 'react';
import { X, FileText, Download, ShieldAlert, CheckCircle } from 'lucide-react';
import { fetchWithAuth } from '@/lib/apiClient';

interface FilePreviewModalProps {
  file: Record<string, unknown> | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function FilePreviewModal({ file, isOpen, onClose }: FilePreviewModalProps) {
  if (!isOpen || !file) return null;

  const download = async () => {
    const url = typeof file.url === 'string' ? file.url : '';
    if (!url) return;
    const response = await fetchWithAuth(url);
    if (!response.ok) return;
    const objectUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = String(file.name || 'download');
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6">
      <div className="bg-card dark:bg-slate-900 border border-border w-full max-w-4xl h-[85vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border bg-muted/50 dark:bg-slate-900/50 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-500/20 rounded-xl">
              <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold truncate max-w-[200px] sm:max-w-md">{String(file.name)}</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-sm text-muted-foreground">{String(file.size)}</span>
                <span className="text-sm text-muted-foreground">•</span>
                {file.pii === 'restricted' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500">
                    <ShieldAlert className="h-3.5 w-3.5" /> Restricted (PII Found)
                  </span>
                ) : file.pii === 'clear' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-500">
                    <CheckCircle className="h-3.5 w-3.5" /> Clear
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-500">
                    Scanning...
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button onClick={() => void download()} className="hidden sm:flex items-center gap-2 px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-foreground rounded-xl transition-colors font-medium">
              <Download className="h-4 w-4" />
              Download
            </button>
            <button onClick={onClose} className="p-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-xl transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Main Preview (Left) */}
          <div className="flex-1 bg-muted dark:bg-slate-950 flex flex-col items-center justify-center p-6 overflow-y-auto">
            {/* Temporary Placeholder for File Viewer */}
            <div className="max-w-md text-center space-y-4">
              <div className="w-24 h-24 bg-card dark:bg-slate-900 border border-border shadow-xl rounded-2xl flex items-center justify-center mx-auto mb-6 transform -rotate-6">
                <FileText className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-2xl font-semibold">Preview not available</h3>
              <p className="text-muted-foreground">
                This file type cannot be previewed directly in the browser yet. You can download the file to view it locally.
              </p>
              <button onClick={() => void download()} className="sm:hidden mt-4 mx-auto flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors font-medium shadow-lg shadow-blue-500/20">
                <Download className="h-4 w-4" />
                Download File
              </button>
            </div>
          </div>

          {/* AI Metadata & Shield Info (Right Panel) */}
          <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-border bg-card dark:bg-slate-900 p-6 overflow-y-auto">
            <h3 className="font-semibold text-lg mb-6">File Intelligence</h3>
            
            <div className="space-y-6">
              {/* Shield Status */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Septimus Shield</h4>
                {file.pii === 'restricted' ? (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl space-y-2">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-medium">
                      <ShieldAlert className="h-5 w-5" />
                      Data Policy Violation
                    </div>
                    <p className="text-sm text-red-600/80 dark:text-red-400/80">
                      This file contains Personal Identifiable Information (PII). External sharing has been automatically blocked.
                    </p>
                  </div>
                ) : file.pii === 'clear' ? (
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-2xl space-y-2">
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-medium">
                      <CheckCircle className="h-5 w-5" />
                      Clean & Verified
                    </div>
                    <p className="text-sm text-green-600/80 dark:text-green-400/80">
                      No sensitive information detected. File is safe for sharing according to current policies.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-muted dark:bg-slate-800 rounded-2xl animate-pulse">
                    <div className="h-5 w-32 bg-slate-300 dark:bg-slate-700 rounded mb-2"></div>
                    <div className="h-10 w-full bg-slate-200 dark:bg-slate-700/50 rounded"></div>
                  </div>
                )}
              </div>

              {/* AI Summary */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">AI Summary</h4>
                <div className="p-4 bg-muted dark:bg-slate-800/50 border border-border rounded-2xl">
                  {typeof file.ai_summary === 'string' && file.ai_summary ? (
                    <p className="text-sm leading-relaxed">{file.ai_summary}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                      </span>
                      No AI summary is available for this file.
                    </p>
                  )}
                </div>
              </div>

              {/* Metadata */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Details</h4>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium uppercase">{String(file.type || 'unknown')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Size</span>
                    <span className="font-medium">{String(file.size || '0 KB')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Added</span>
                    <span className="font-medium">{String(file.created_at || '—')}</span>
                  </div>
                </div>
              </div>
              
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
