'use client';

import React, { useRef, useState } from 'react';
import { UploadCloud, X, File as FileIcon, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { DRIVE_BASE_URL, fetchWithAuth } from '@/lib/apiClient';

interface FileData {
  id?: string;
  name?: string;
  size?: number;
  [key: string]: unknown;
}

interface FileUploaderProps {
  onUploadSuccess?: (fileData: FileData) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function FileUploader({ onUploadSuccess, isOpen, onClose }: FileUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [uploadError, setUploadError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
      setUploadStatus('idle');
      setUploadError('');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setUploadStatus('idle');
      setUploadError('');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadStatus('idle');
    setUploadError('');

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetchWithAuth(`${DRIVE_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || 'Upload failed');
      }

      const data = await response.json();
      setUploadStatus('success');
      if (onUploadSuccess) {
        onUploadSuccess(data);
      }
      
      // Auto close after 2 seconds
      setTimeout(() => {
        onClose();
        setSelectedFile(null);
        setUploadStatus('idle');
      }, 2000);

    } catch (error) {
      console.error('Upload error:', error);
      setUploadError(error instanceof Error ? error.message : 'Unknown error');
      setUploadStatus('error');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card dark:bg-slate-900 border border-border w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold">Upload to Drive</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6">
          {!selectedFile ? (
            <div
              className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-colors text-center cursor-pointer ${
                dragActive ? 'border-blue-500 bg-blue-500/10' : 'border-border dark:border-slate-700 hover:bg-muted dark:hover:bg-slate-800/50'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                onChange={handleChange}
              />
              <div className="p-4 bg-blue-100 dark:bg-blue-500/20 rounded-full mb-4">
                <UploadCloud className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="font-medium text-lg mb-1">Click or drag file to this area to upload</p>
              <p className="text-sm text-muted-foreground">Support for a single upload. Limits are enforced by your workspace policy.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-muted dark:bg-slate-800/50 border border-border">
                <div className="p-3 bg-blue-100 dark:bg-blue-500/20 rounded-xl">
                  <FileIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                </div>
                {!isUploading && uploadStatus !== 'success' && (
                  <button onClick={() => setSelectedFile(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-muted-foreground transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {uploadStatus === 'error' && (
                <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                  <AlertCircle className="h-4 w-4" />
                  <span>{uploadError || 'Upload failed. Please try again.'}</span>
                </div>
              )}
              
              {uploadStatus === 'success' && (
                <div className="flex items-center gap-2 text-sm text-green-500 bg-green-500/10 p-3 rounded-lg border border-green-500/20">
                  <CheckCircle className="h-4 w-4" />
                  <span>File uploaded. Security scanning remains pending until a scanner is configured.</span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  disabled={isUploading}
                  className="flex-1 px-4 py-2 rounded-xl font-medium border border-border hover:bg-muted dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={isUploading || uploadStatus === 'success'}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : uploadStatus === 'success' ? (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      Done
                    </>
                  ) : (
                    <>
                      <UploadCloud className="h-4 w-4" />
                      Upload
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
