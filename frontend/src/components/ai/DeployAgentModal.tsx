import React, { useState } from "react";
import { apiPost } from "@/lib/apiClient";
import { X, Play } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";

interface DeployAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeployed: () => void;
}

export default function DeployAgentModal({ isOpen, onClose, onDeployed }: DeployAgentModalProps) {
  const { isRtl } = useLocalization();
  const [name, setName] = useState("");
  const [agentType, setAgentType] = useState("Data Analyst");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      await apiPost(`/entities?workspace_id=${workspaceId}`, {
        entity_type: "ai_agent",
        data: {
          name,
          agentType,
          systemPrompt,
          status: "Running",
          uptime: "0m",
          tasks: 0
        }
      });
      onDeployed();
    } catch (error) {
      console.error("Failed to deploy agent:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800">{isRtl ? "نشر وكيل جديد" : "Deploy New Agent"}</h2>
          <button onClick={onClose} title={isRtl ? "إغلاق النافذة" : "Close Modal"} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleDeploy} className="p-6 flex flex-col gap-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{isRtl ? "اسم الوكيل" : "Agent Name"}</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isRtl ? "مثال: بوت المالية" : "e.g., Finance Bot"}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{isRtl ? "دور / نوع الوكيل" : "Agent Role / Type"}</label>
            <select 
              title={isRtl ? "اختيار دور الوكيل" : "Select Agent Role"}
              value={agentType}
              onChange={(e) => setAgentType(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            >
              <option value="Data Analyst">{isRtl ? "محلل بيانات" : "Data Analyst"}</option>
              <option value="QA Tester">{isRtl ? "مختبِر جودة" : "QA Tester"}</option>
              <option value="Workflow Architect">{isRtl ? "مهندس سير العمل" : "Workflow Architect"}</option>
              <option value="Custom Support">{isRtl ? "دعم العملاء" : "Custom Support"}</option>
              <option value="Supervisor">{isRtl ? "مشرف" : "Supervisor"}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{isRtl ? "موجّه النظام (التعليمات)" : "System Prompt (Instructions)"}</label>
            <textarea 
              rows={4}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={isRtl ? "أنت مساعد ذكاء اصطناعي متخصص في..." : "You are a helpful AI assistant specialized in..."}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
            />
          </div>

          <div className="mt-4 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
            >
              {isRtl ? "إلغاء" : "Cancel"}
            </button>
            <button 
              type="submit" 
              disabled={isLoading || !name}
              className="flex items-center gap-2 px-6 py-2 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              {isRtl ? "نشر" : "Deploy"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
