"use client";

import React, { useState } from "react";
import { X, UploadCloud, File, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from "@/contexts/LocalizationContext";

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId?: string; // Optional if uploading to a specific channel
}

export default function DocumentUploadModal({ isOpen, onClose, channelId }: DocumentUploadModalProps) {
  const { isRtl } = useLocalization();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError("");
      setSuccess("");
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError(isRtl ? "يرجى اختيار ملف أولاً." : "Please select a file first.");
      return;
    }

    setIsUploading(true);
    setError("");
    setSuccess("");

    const formData = new FormData();
    formData.append("document", file);
    if (channelId) {
      formData.append("channel_id", channelId);
    }

    try {
            const res = await fetchWithAuth(`${API_BASE_URL}/documents/upload`, {
        method: "POST",
        
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || (isRtl ? "فشل رفع المستند" : "Failed to upload document"));
      }

      setSuccess(isRtl ? "تم رفع المستند بنجاح! يقوم الذكاء الاصطناعي بمعالجته الآن." : "Document uploaded successfully! AI is now processing it.");
      setFile(null);
      setTimeout(() => {
        onClose();
        setSuccess("");
      }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : (isRtl ? "خطأ غير معروف" : "Unknown error"));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--sb-bg)] [var(--sb-bg)]">{isRtl ? "رفع مستند للذكاء الاصطناعي" : "Upload Document for AI"}</h2>
          <button
            onClick={onClose}
            title={isRtl ? "إغلاق" : "Close"}
            className="p-2 text-slate-400 hover:text-[var(--sb-bg)]/80 :text-slate-300 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col items-center">
          <div className="w-full flex items-center justify-center w-full">
            <label
              htmlFor="dropzone-file"
              className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer bg-white :bg-[#f8fafc] hover:bg-slate-100 border-slate-300 transition-colors"
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <UploadCloud className="w-10 h-10 mb-3 text-slate-400" />
                <p className="mb-2 text-sm text-[var(--sb-bg)]/70 [var(--sb-bg)]/70">
                  <span className="font-semibold">{isRtl ? "انقر للرفع" : "Click to upload"}</span> {isRtl ? "أو اسحب وأفلت" : "or drag and drop"}
                </p>
                <p className="text-xs text-[var(--sb-bg)]/70 [var(--sb-bg)]/70"><span dir="ltr">PDF, DOCX, TXT, MD</span></p>
              </div>
              <input id="dropzone-file" type="file" className="hidden" accept=".pdf,.docx,.txt,.md" onChange={handleFileChange} />
            </label>
          </div>

          {file && (
            <div className="mt-4 w-full flex items-center p-3 bg-brand-light text-brand rounded-lg border border-brand-light ">
              <File size={18} className="me-2 flex-shrink-0" />
              <span className="text-sm truncate font-medium">{file.name}</span>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
          {success && <p className="mt-4 text-sm text-green-500">{success}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-100 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isUploading}>
            {isRtl ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={handleUpload} disabled={!file || isUploading} className="bg-brand hover:bg-brand text-white">
            {isUploading ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                {isRtl ? "جارِ الرفع..." : "Uploading..."}
              </>
            ) : (
              (isRtl ? "رفع ومعالجة" : "Upload & Process")
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
