import React from 'react';
import { PlayCircle, GitBranch, Zap, Clock, Webhook } from 'lucide-react';
import { useLocalization } from "@/contexts/LocalizationContext";

export default function Sidebar() {
  const { isRtl } = useLocalization();

  const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="w-64 border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#1a1d21] flex flex-col h-full" dir={isRtl ? "rtl" : "ltr"}>
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#222529]">
        <h3 className="font-bold text-slate-800 dark:text-white">{isRtl ? "مكتبة العقد" : "Node Library"}</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{isRtl ? "اسحب العقد وأفلتها على اللوحة لبناء مسار الأتمتة." : "Drag nodes onto the canvas to build your automation workflow."}</p>
      </div>
      
      <div className="p-5 flex flex-col gap-4 overflow-y-auto">
        <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{isRtl ? "المشغّلات" : "Triggers"}</div>
        <div 
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl cursor-grab hover:border-brand hover:shadow-sm transition-all flex items-center gap-3"
          onDragStart={(event) => onDragStart(event, 'trigger', isRtl ? 'حدث في التطبيق' : 'App Event')}
          draggable
        >
          <div className="p-2 bg-brand/10 dark:bg-brand/20 rounded-lg text-brand"><PlayCircle size={18} /></div>
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{isRtl ? "حدث في التطبيق" : "App Event"}</span>
        </div>

        <div 
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl cursor-grab hover:border-violet-500 hover:shadow-sm transition-all flex items-center gap-3"
          onDragStart={(event) => onDragStart(event, 'trigger', isRtl ? 'مجدول زمني' : 'Cron Schedule')}
          draggable
        >
          <div className="p-2 bg-violet-50 dark:bg-violet-500/10 rounded-lg text-violet-600 dark:text-violet-400"><Clock size={18} /></div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{isRtl ? "مجدول زمني" : "Cron Schedule"}</span>
            <span className="text-[10px] text-slate-400">{isRtl ? "تشغيل دوري تلقائي" : "Periodic auto-run"}</span>
          </div>
        </div>

        <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 mt-4">{isRtl ? "الشروط" : "Conditions"}</div>
        <div 
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl cursor-grab hover:border-indigo-400 hover:shadow-sm transition-all flex items-center gap-3"
          onDragStart={(event) => onDragStart(event, 'condition', isRtl ? 'إذا / وإلا' : 'If / Else')}
          draggable
        >
          <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg text-indigo-600 dark:text-indigo-400"><GitBranch size={18} /></div>
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{isRtl ? "إذا / وإلا" : "If / Else"}</span>
        </div>

        <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 mt-4">{isRtl ? "الإجراءات" : "Actions"}</div>
        <div 
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl cursor-grab hover:border-emerald-400 hover:shadow-sm transition-all flex items-center gap-3"
          onDragStart={(event) => onDragStart(event, 'action', isRtl ? 'إجراء النظام' : 'System Action')}
          draggable
        >
          <div className="p-2 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg text-emerald-600 dark:text-emerald-400"><Zap size={18} /></div>
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{isRtl ? "إجراء النظام" : "System Action"}</span>
        </div>

        <div 
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl cursor-grab hover:border-orange-400 hover:shadow-sm transition-all flex items-center gap-3"
          onDragStart={(event) => onDragStart(event, 'action', isRtl ? 'خطاف ويب صادر' : 'HTTP Webhook')}
          draggable
        >
          <div className="p-2 bg-orange-50 dark:bg-orange-500/10 rounded-lg text-orange-600 dark:text-orange-400"><Webhook size={18} /></div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{isRtl ? "خطاف ويب صادر" : "HTTP Webhook"}</span>
            <span className="text-[10px] text-slate-400">{isRtl ? "طلب لنظام خارجي" : "Request to external API"}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
