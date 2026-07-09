"use client";

import React from "react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { Webhook, Mail, CalendarDays, FolderOpen, Sheet, Play, Settings } from "lucide-react";

interface WorkflowCanvasProps {
  template: {
    name: string;
    trigger: string;
    action: string;
    icon: string;
  };
}

const getIcon = (iconStr: string, className: string = "w-6 h-6") => {
  switch (iconStr) {
    case 'mail': return <Mail className={`${className} text-rose-500`} />;
    case 'calendar': return <CalendarDays className={`${className} text-brand`} />;
    case 'drive': return <FolderOpen className={`${className} text-amber-500`} />;
    case 'sheets': return <Sheet className={`${className} text-emerald-500`} />;
    case 'slack': return <Webhook className={`${className} text-brand`} />;
    case 'github': return <Webhook className={`${className} text-slate-700`} />;
    default: return <Webhook className={`${className} text-brand`} />;
  }
};

const getBgColor = (iconStr: string) => {
  switch (iconStr) {
    case 'mail': return "bg-rose-50 border-rose-200";
    case 'calendar': return "bg-brand-light border-brand-light";
    case 'drive': return "bg-amber-50 border-amber-200";
    case 'sheets': return "bg-emerald-50 border-emerald-200";
    default: return "bg-brand-light border-brand-light";
  }
};

export default function WorkflowCanvas({ template }: WorkflowCanvasProps) {
  const { isRtl } = useLocalization();
  return (
    <div className="w-full h-96 bg-[#f8fafc] rounded-xl border border-slate-200 overflow-hidden relative flex items-center justify-center bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px]">
      
      {/* Node 1: Webhook Trigger */}
      <div className="absolute start-10 md:start-20 flex flex-col items-center">
        <div className="w-48 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden z-10 transition-transform hover:-translate-y-1 hover:shadow-md">
          <div className="px-4 py-2 bg-[#f8fafc] border-b border-slate-100 flex items-center gap-2">
            <Play className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{isRtl ? "مُشغّل" : "Trigger"}</span>
          </div>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-light flex items-center justify-center">
               <Webhook className="w-5 h-5 text-brand" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{template.trigger}</p>
              <p className="text-xs text-slate-500">n8n Webhook</p>
            </div>
          </div>
        </div>
      </div>

      {/* SVG Connecting Line */}
      <svg className="absolute w-full h-full pointer-events-none z-0">
         <path 
           d="M 270 192 C 350 192, 400 192, 480 192" 
           fill="none" 
           stroke="#cbd5e1" 
           strokeWidth="2" 
           strokeDasharray="4 4"
           className="animate-[dash_20s_linear_infinite]"
         />
         {/* Animated particle */}
         <circle cx="270" cy="192" r="4" fill="#6366f1">
           <animateMotion 
             dur="2s" 
             repeatCount="indefinite" 
             path="M 0 0 C 80 0, 130 0, 210 0" 
           />
         </circle>
      </svg>

      {/* Node 2: Action */}
      <div className="absolute end-10 md:end-20 flex flex-col items-center">
        <div className="w-56 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden z-10 transition-transform hover:-translate-y-1 hover:shadow-md">
          <div className="px-4 py-2 bg-[#f8fafc] border-b border-slate-100 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{isRtl ? "إجراء" : "Action"}</span>
            </div>
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
          </div>
          <div className="p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${getBgColor(template.icon)}`}>
               {getIcon(template.icon, "w-5 h-5")}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{template.action}</p>
              <p className="text-xs text-slate-500">{isRtl ? "عقدة تكامل" : "Integration Node"}</p>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -1000;
          }
        }
      `}</style>
    </div>
  );
}
