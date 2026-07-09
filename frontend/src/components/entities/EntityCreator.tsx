"use client";

import React, { useState } from "react";
import { 
  Database, Plus, Type, Hash, Calendar, List, 
  Settings, Save, X, GripVertical, Link as LinkIcon, FunctionSquare, User, FileText, LayoutTemplate
} from "lucide-react";
import { apiPost } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

interface FieldSchema {
  id: string;
  name: string;
  type: string;
  required: boolean;
}

export default function EntityCreator() {
  const { isRtl } = useLocalization();
  const [entityName, setEntityName] = useState(isRtl ? "نموذج بيانات جديد" : "New Data Model");
  const [fields, setFields] = useState<FieldSchema[]>([
    { id: "1", name: isRtl ? "العنوان" : "Title", type: "text", required: true },
  ]);
  const [isSaving, setIsSaving] = useState(false);

  const addField = (type: string) => {
    setFields([
      ...fields, 
      { 
        id: Math.random().toString(36).substring(7), 
        name: isRtl ? `حقل ${type} جديد` : `New ${type} field`, 
        type, 
        required: false 
      }
    ]);
  };

  const updateField = (id: string, updates: Partial<FieldSchema>) => {
    setFields(fields.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const removeField = (id: string) => {
    setFields(fields.filter(f => f.id !== id));
  };

  const getFieldIcon = (type: string) => {
    switch(type) {
      case "text": return <Type className="w-4 h-4" />;
      case "number": return <Hash className="w-4 h-4" />;
      case "date": return <Calendar className="w-4 h-4" />;
      case "list": return <List className="w-4 h-4" />;
      case "relation": return <LinkIcon className="w-4 h-4 text-indigo-500" />;
      case "formula": return <FunctionSquare className="w-4 h-4 text-purple-500" />;
      case "user": return <User className="w-4 h-4 text-blue-500" />;
      case "file": return <FileText className="w-4 h-4 text-rose-500" />;
      default: return <Type className="w-4 h-4" />;
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e";
      await apiPost(`/entities?workspace_id=${workspaceId}`, {
        entity_type: "schema",
        data: {
          name: entityName,
          fields: fields
        }
      });
      alert(isRtl ? `تم نشر مخطط الكيان '${entityName}' بنجاح! يمكنك الآن استخدامه لإنشاء السجلات.` : `Entity schema '${entityName}' deployed successfully! You can now use it to create records.`);
    } catch (error) {
      console.error("Failed to deploy schema:", error);
      alert(isRtl ? "فشل نشر المخطط. يرجى المحاولة مرة أخرى." : "Failed to deploy schema. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full bg-[#f8fafc] font-sans">
      
      {/* LEFT PANEL: Schema Builder */}
      <div className="w-[450px] border-e border-slate-200 bg-white flex flex-col shadow-xl z-10">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 ">{isRtl ? "منشئ المخططات" : "Schema Builder"}</h2>
              <p className="text-xs text-slate-500">{isRtl ? "محرك قواعد بيانات بدون كود" : "No-code Database Engine"}</p>
            </div>
          </div>
        </div>

        {/* Builder Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Entity Name */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 ">{isRtl ? "اسم الكيان" : "Entity Name"}</label>
            <input 
              type="text" 
              value={entityName}
              onChange={(e) => setEntityName(e.target.value)}
              className="w-full bg-[#f8fafc] border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-medium text-lg"
              placeholder={isRtl ? "مثال: الفواتير، العملاء" : "e.g. Invoices, Customers"}
            />
          </div>

          {/* Fields Definition */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-700 ">{isRtl ? "حقول البيانات (JSONB)" : "Data Fields (JSONB)"}</label>
            </div>

            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="group flex items-center gap-3 bg-[#f8fafc] border border-slate-200 rounded-xl p-3 hover:border-primary/50 transition-colors">
                  <div className="cursor-grab text-slate-400 hover:text-slate-600 :text-slate-300">
                    <GripVertical className="w-4 h-4" />
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 shadow-sm">
                    {getFieldIcon(field.type)}
                  </div>
                  <input 
                    type="text" 
                    value={field.name}
                    onChange={(e) => updateField(field.id, { name: e.target.value })}
                    className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-slate-700 placeholder-slate-400"
                    placeholder={isRtl ? "اسم الحقل" : "Field name"}
                  />
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => updateField(field.id, { required: !field.required })}
                      className={`text-xs px-2 py-1 rounded border ${field.required ? 'bg-primary/10 text-primary border-primary/20' : 'text-slate-400 border-slate-200 hover:bg-slate-100 :bg-slate-800'}`}
                    >
                      {isRtl ? "مطلوب" : "Req"}
                    </button>
                    {index > 0 && (
                      <button 
                        onClick={() => removeField(field.id)}
                        title={isRtl ? "إزالة الحقل" : "Remove field"}
                        aria-label={isRtl ? "إزالة الحقل" : "Remove field"}
                        className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-500 rounded hover:bg-red-50 :bg-red-900/20 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Advanced Field Type Palette */}
            <div className="pt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">{isRtl ? "حقول أساسية" : "Basic Fields"}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => addField("text")} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg hover:bg-[#f8fafc] text-sm font-medium text-slate-600 transition-colors">
                    <Type className="w-4 h-4 text-slate-500" /> {isRtl ? "نص" : "Text"}
                  </button>
                  <button onClick={() => addField("number")} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg hover:bg-[#f8fafc] text-sm font-medium text-slate-600 transition-colors">
                    <Hash className="w-4 h-4 text-emerald-500" /> {isRtl ? "رقم" : "Number"}
                  </button>
                  <button onClick={() => addField("date")} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg hover:bg-[#f8fafc] text-sm font-medium text-slate-600 transition-colors">
                    <Calendar className="w-4 h-4 text-brand" /> {isRtl ? "تاريخ" : "Date"}
                  </button>
                  <button onClick={() => addField("list")} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg hover:bg-[#f8fafc] text-sm font-medium text-slate-600 transition-colors">
                    <List className="w-4 h-4 text-orange-500" /> {isRtl ? "قائمة منسدلة" : "Dropdown"}
                  </button>
                </div>
              </div>
              
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">{isRtl ? "حقول متقدمة" : "Advanced Fields"}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => addField("relation")} className="flex items-center gap-2 px-3 py-2 border border-indigo-100 bg-indigo-50/50 rounded-lg hover:bg-indigo-50 text-sm font-medium text-slate-700 transition-colors">
                    <LinkIcon className="w-4 h-4 text-indigo-500" /> {isRtl ? "علاقة" : "Relation"}
                  </button>
                  <button onClick={() => addField("formula")} className="flex items-center gap-2 px-3 py-2 border border-purple-100 bg-purple-50/50 rounded-lg hover:bg-purple-50 text-sm font-medium text-slate-700 transition-colors">
                    <FunctionSquare className="w-4 h-4 text-purple-500" /> {isRtl ? "معادلة" : "Formula"}
                  </button>
                  <button onClick={() => addField("user")} className="flex items-center gap-2 px-3 py-2 border border-blue-100 bg-blue-50/50 rounded-lg hover:bg-blue-50 text-sm font-medium text-slate-700 transition-colors">
                    <User className="w-4 h-4 text-blue-500" /> {isRtl ? "ربط مستخدم" : "User Link"}
                  </button>
                  <button onClick={() => addField("file")} className="flex items-center gap-2 px-3 py-2 border border-rose-100 bg-rose-50/50 rounded-lg hover:bg-rose-50 text-sm font-medium text-slate-700 transition-colors">
                    <FileText className="w-4 h-4 text-rose-500" /> {isRtl ? "مرفق" : "Attachment"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-200 bg-[#f8fafc] ">
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25 disabled:opacity-70"
          >
            {isSaving ? <span className="animate-pulse">{isRtl ? "جارِ البناء..." : "Building Engine..."}</span> : <><Save className="w-5 h-5" /> {isRtl ? "نشر الكيان" : "Deploy Entity"}</>}
          </button>
        </div>
      </div>

      {/* RIGHT PANEL: Live Preview */}
      <div className="flex-1 flex flex-col bg-slate-100 overflow-hidden relative">
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>

        <div className="flex-1 flex items-center justify-center p-12 relative z-10">
          
          {/* Notion-style Page Preview */}
          <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200/50 overflow-hidden flex flex-col h-full max-h-[800px]">
            
            {/* Header Preview */}
            <div className="px-10 py-12 border-b border-slate-100 bg-gradient-to-br from-white to-slate-50 ">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-6 shadow-inner">
                <Database className="w-8 h-8" />
              </div>
              <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight">{entityName}</h1>
              <p className="mt-2 text-slate-500">{isRtl ? "معاينة حية لمخطط الكيان الديناميكي." : "Live preview of your dynamic entity schema."}</p>
              <div className="flex gap-4 mt-6">
                <button onClick={() => alert(isRtl ? 'هذه معاينة. انشر المخطط أولاً لإضافة السجلات.' : 'This is a preview. Deploy the schema first to add records.')} className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg flex items-center gap-2">
                  <Plus className="w-4 h-4" /> {isRtl ? "سجل جديد" : "New Record"}
                </button>
                <button onClick={() => alert(isRtl ? 'عرض مخطط العلاقات سيتوفر بعد النشر.' : 'ER Diagram View will be available after deployment.')} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg flex items-center gap-2 shadow-sm">
                  <LayoutTemplate className="w-4 h-4" /> {isRtl ? "عرض مخطط العلاقات" : "ER Diagram View"}
                </button>
                <button onClick={() => alert(isRtl ? 'الإعداد نشط في اللوحة الجانبية.' : 'Configuration is active in the left panel.')} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg flex items-center gap-2 shadow-sm">
                  <Settings className="w-4 h-4" /> {isRtl ? "إعداد" : "Configure"}
                </button>
              </div>
            </div>

            {/* Table Preview */}
            <div className="flex-1 overflow-auto bg-[#f8fafc]/50 p-8">
               <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                 {/* Table Header */}
                 <div className="flex border-b border-slate-200 bg-[#f8fafc] ">
                    <div className="w-12 border-e border-slate-200 flex items-center justify-center p-3">
                      <input type="checkbox" className="rounded text-primary border-slate-300" title={isRtl ? "تحديد الكل" : "Select All"} aria-label={isRtl ? "تحديد الكل" : "Select All"} />
                    </div>
                    {fields.map(field => (
                      <div key={field.id} className="flex-1 p-3 flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider border-e border-slate-200 last:border-e-0">
                        {getFieldIcon(field.type)}
                        {field.name} {field.required && <span className="text-red-400">*</span>}
                      </div>
                    ))}
                 </div>
                 
                 {/* Empty State / Mock Row */}
                 <div className="flex items-center p-8 justify-center text-slate-400 text-sm flex-col gap-4">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                      <Database className="w-6 h-6 opacity-50" />
                    </div>
                    <p>{isRtl ? "هكذا سيبدو جدولك الديناميكي." : "This is how your dynamic table will look."}</p>
                 </div>
               </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
