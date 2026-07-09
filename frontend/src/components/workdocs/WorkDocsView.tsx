"use client";

import React, { useEffect, useState } from "react";
import { Plus, FileText, ChevronRight, MoreVertical, Edit2, Trash2 } from "lucide-react";
import WorkDocsEditor from "./Editor";
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from "@/contexts/LocalizationContext";

interface WorkDoc {
  ID: string;
  ProjectID: string;
  Title: string;
  TemplateType: string;
  CreatedAt: string;
  UpdatedAt: string;
}

const TEMPLATES = [
  { id: 'empty', title: 'Blank Document', desc: 'Start from scratch', icon: '📄', color: 'bg-slate-100 text-slate-600' },
  { id: 'prd', title: 'Product Requirements Doc (PRD)', desc: 'Product requirements and tasks', icon: '🚀', color: 'bg-brand-light text-brand' },
  { id: 'meeting', title: 'Meeting Notes', desc: 'Agenda and action items', icon: '🤝', color: 'bg-emerald-100 text-emerald-600' },
  { id: 'tech_spec', title: 'Technical Specification', desc: 'System architecture and structure', icon: '💻', color: 'bg-brand-light text-brand' }
];

export default function WorkDocsView({ projectId }: { projectId: string }) {
  const { isRtl } = useLocalization();
  const [docs, setDocs] = useState<WorkDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editDoc, setEditDoc] = useState<WorkDoc | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const fetchDocs = React.useCallback(async () => {
    if (!projectId) return;
    try {
      setIsLoading(true);
            const res = await fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/workdocs`);
      if (res.ok) {
        const data = await res.json();
        setDocs(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    const init = async () => {
      await fetchDocs();
    };
    init();
  }, [fetchDocs]);

  const handleCreateDoc = async (templateId: string, templateTitle: string) => {
        const title = `${templateTitle} ${docs.length + 1}`;
    
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/workdocs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",

        },
        body: JSON.stringify({ title, templateType: templateId })
      });
      
      if (res.ok) {
        const data = await res.json();
        fetchDocs();
        setIsModalOpen(false);
        setActiveDocId(data.ID);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create document");
      }
    } catch (err) {
      console.error("Failed to create document", err);
    }
  };

  const handleDelete = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(isRtl ? "هل أنت متأكد من حذف هذا المستند؟" : "Are you sure you want to delete this document?")) return;
    
    try {
            const res = await fetchWithAuth(`${API_BASE_URL}/workdocs/${docId}`, {
        method: "DELETE",
        
      });
      if (res.ok) {
        fetchDocs();
        setMenuOpenId(null);
      } else {
        const data = await res.json();
        alert(data.error || (isRtl ? "ليس لديك صلاحية الحذف" : "You do not have permission to delete"));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDoc || !newTitle.trim()) return;

    try {
            const res = await fetchWithAuth(`${API_BASE_URL}/workdocs/${editDoc.ID}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",

        },
        body: JSON.stringify({ title: newTitle })
      });
      
      if (res.ok) {
        fetchDocs();
        setEditDoc(null);
        setNewTitle("");
      } else {
        const data = await res.json();
        alert(data.error || (isRtl ? "ليس لديك صلاحية التعديل" : "You do not have permission to edit"));
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (activeDocId) {
    const activeDoc = docs.find(d => d.ID === activeDocId);
    return (
      <div className="flex flex-col h-full bg-[#f8fafc] w-full overflow-hidden">
        <div className="flex-none px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setActiveDocId(null)}
              className="text-slate-500 hover:text-slate-800 transition-colors text-sm font-medium flex items-center gap-1"
            >
              {isRtl ? "مستندات المشروع" : "Project Documents"}
            </button>
            <ChevronRight className="w-4 h-4 text-slate-400 rtl:rotate-180" />
            <span className="text-slate-800 font-semibold">{activeDoc?.Title || 'Document'}</span>
          </div>
        </div>
        <div className="flex-1 overflow-hidden relative">
          <WorkDocsEditor 
            documentId={activeDocId} 
            projectId={projectId} 
            templateType={activeDoc?.TemplateType || 'empty'}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] w-full overflow-hidden">
      {/* Header */}
      <div className="flex-none px-8 py-6 border-b border-slate-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#dfb2e5]" />
            {isRtl ? "مستندات العمل" : "WorkDocs"}
          </h1>
          <p className="text-slate-500 mt-1">
            {isRtl ? "مساحة عمل تعاونية لإنشاء المتطلبات، ملاحظات الاجتماعات، والمستندات التقنية." : "A collaborative workspace for requirements, meeting notes, and technical documents."}
          </p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-md font-medium hover:bg-brand transition-colors"
        >
          <Plus className="w-4 h-4" />
          {isRtl ? "مستند جديد" : "New Document"}
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-8">
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="w-6 h-6 border-2 border-[#1c1d22] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500 border-2 border-dashed border-slate-300 rounded-xl bg-white">
            <FileText className="w-12 h-12 mb-4 text-slate-300" />
            <p className="text-lg font-medium text-slate-700">{isRtl ? "لا توجد مستندات بعد" : "No documents yet"}</p>
            <p className="text-sm mt-1">{isRtl ? "ابدأ بإنشاء أول مستند تعاوني لهذا المشروع" : "Start by creating the first collaborative document for this project"}</p>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="mt-4 px-4 py-2 bg-brand-light text-brand rounded font-medium hover:bg-brand-light transition-colors"
            >
              {isRtl ? "إنشاء مستند" : "Create Document"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {docs.map(doc => (
              <div 
                key={doc.ID}
                onClick={() => setActiveDocId(doc.ID)}
                className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm hover:shadow-md hover:border-brand-light transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-4 relative">
                  <div className="p-3 bg-brand-light text-brand rounded-lg group-hover:bg-brand group-hover:text-white transition-colors">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-1 rounded">
                      DOC-{doc.ID.substring(0,4)}
                    </span>
                    <button 
                      title="Options"
                      onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === doc.ID ? null : doc.ID); }}
                      className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {menuOpenId === doc.ID && (
                      <div className="absolute top-8 rtl:start-0 ltr:end-0 w-36 bg-white border border-slate-200 shadow-lg rounded-md py-1 z-10" onClick={e => e.stopPropagation()}>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setEditDoc(doc); setNewTitle(doc.Title); setMenuOpenId(null); }}
                          className="w-full text-start px-4 py-2 text-sm text-slate-700 hover:bg-[#f8fafc] flex items-center gap-2"
                        >
                          <Edit2 className="w-4 h-4" />
                          {isRtl ? "إعادة تسمية" : "Rename"}
                        </button>
                        <button 
                          onClick={(e) => handleDelete(doc.ID, e)}
                          className="w-full text-start px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          {isRtl ? "حذف المستند" : "Delete Document"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <h3 className="font-semibold text-lg text-slate-800 mb-1 group-hover:text-brand transition-colors">
                  {doc.Title}
                </h3>
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-slate-500">
                    {isRtl ? "تم التحديث:" : "Updated:"} <span dir="ltr">{new Date(doc.UpdatedAt).toLocaleDateString(isRtl ? 'ar-EG' : 'en-US')}</span>
                  </p>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {doc.TemplateType || 'empty'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Template Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-[#f8fafc]">
              <h2 className="text-xl font-bold text-slate-800">{isRtl ? "اختر نوع المستند" : "Choose document type"}</h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {TEMPLATES.map(tpl => (
                <div 
                  key={tpl.id}
                  onClick={() => handleCreateDoc(tpl.id, tpl.title)}
                  className="flex items-start gap-4 p-4 border border-slate-200 rounded-xl cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all group bg-white"
                >
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl ${tpl.color}`}>
                    {tpl.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 group-hover:text-brand transition-colors">
                      {tpl.title}
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">
                      {tpl.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Rename Modal */}
      {editDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-[#f8fafc]">
              <h2 className="text-lg font-bold text-slate-800">{isRtl ? "إعادة تسمية المستند" : "Rename Document"}</h2>
              <button 
                onClick={() => setEditDoc(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleRename} className="p-4">
              <input
                type="text"
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded focus:border-brand focus:ring-1 focus:ring-brand"
                placeholder={isRtl ? "اسم المستند..." : "Document name..."}
              />
              <div className="mt-6 flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setEditDoc(null)}
                  className="px-4 py-2 text-slate-600 bg-slate-100 rounded hover:bg-slate-200"
                >
                  {isRtl ? "إلغاء" : "Cancel"}
                </button>
                <button 
                  type="submit"
                  disabled={!newTitle.trim()}
                  className="px-4 py-2 text-white bg-brand rounded hover:bg-brand disabled:opacity-50"
                >
                  {isRtl ? "حفظ" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
