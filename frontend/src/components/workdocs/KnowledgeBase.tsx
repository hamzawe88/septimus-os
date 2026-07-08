"use client";

import React, { useState, useEffect, useRef } from "react";
import { Upload, FileText, Database, Trash2, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet, fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";

interface DocumentEntity {
  id: string;
  entity_type: string;
  data: {
    name: string;
    url: string;
    size: number;
    status: string;
    uploader_id: string;
  };
  created_at: string;
}

export default function KnowledgeBase() {
  const [documents, setDocuments] = useState<DocumentEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = async () => {
    try {
      const res = await apiGet("/documents");
      setDocuments(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error("Failed to fetch documents", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
     
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDocuments();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("document", file);

    try {
            const res = await fetchWithAuth(`${API_BASE_URL}/documents/upload`, {
        method: "POST",
        
        body: formData,
      });

      if (res.ok) {
         
        await fetchDocuments();
      } else {
        const err = await res.json();
        alert(err.error || "فشل رفع المستند");
      }
    } catch (err) {
      console.error("Upload error", err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] w-full overflow-hidden">
      {/* Header */}
      <div className="flex-none px-8 py-6 border-b border-slate-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-6 h-6 text-indigo-500" />
            قاعدة المعرفة (Knowledge Base)
          </h1>
          <p className="text-slate-500 mt-1">
            ارفع المستندات لتدريب الذكاء الاصطناعي وجعلها قابلة للبحث (RAG).
          </p>
        </div>
        <div>
          <input
            title="رفع مستند"
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            accept=".pdf,.txt,.md,.docx"
          />
          <Button 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isUploading}
            className="bg-indigo-600 hover:bg-indigo-700 gap-2 text-white"
          >
            {isUploading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Upload className="w-4 h-4" />
            )}
            رفع مستند
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-8">
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500 border-2 border-dashed border-slate-300 rounded-xl bg-white">
            <Database className="w-12 h-12 mb-4 text-slate-300" />
            <p className="text-lg font-medium text-slate-700">قاعدة المعرفة فارغة</p>
            <p className="text-sm mt-1">قم برفع مستندات PDF أو نصوص ليقوم الذكاء الاصطناعي بقراءتها.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {documents.map(doc => {
              const data = doc.data;
              const isProcessing = data.status === "processing";
              
              return (
                <div 
                  key={doc.id}
                  className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between mb-4">
                      <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                        <FileText className="w-6 h-6" />
                      </div>
                      <button title="حذف المستند" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <h3 className="font-semibold text-slate-800 mb-1 truncate" title={data.name}>
                      {data.name}
                    </h3>
                    <p className="text-xs text-slate-500 mb-4">
                      {(data.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-xs text-slate-400">
                      {new Date(doc.created_at).toLocaleDateString('ar-EG')}
                    </span>
                    {isProcessing ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                        <Clock className="w-3 h-3" /> جاري التحليل...
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                        <CheckCircle2 className="w-3 h-3" /> جاهز للذكاء الاصطناعي
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
