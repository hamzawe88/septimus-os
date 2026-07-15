import React from 'react';
import { useLocalization } from '@/contexts/LocalizationContext';
import { 
  FileText, 
  LayoutDashboard, 
  FileSpreadsheet, 
  Edit3, 
  Archive, 
  QrCode
} from 'lucide-react';
import { useCorrespondenceStore } from '../../store/useCorrespondenceStore';
import { CorrespondenceDashboard } from './CorrespondenceDashboard';
import { CanvasTemplateDesigner } from './CanvasTemplateDesigner';
import { LetterCanvas } from './LetterCanvas';
import { ArchiveExplorer } from './ArchiveExplorer';

export const CorrespondenceView: React.FC = () => {
  const { isRtl } = useLocalization();
  const { activeTab, setActiveTab } = useCorrespondenceStore();

  const tabs = [
    {
      id: 'dashboard' as const,
      label: isRtl ? 'لوحة القيادة السيادية والإحصاءات' : 'Diwan Dashboard & Stats',
      icon: LayoutDashboard,
    },
    {
      id: 'designer' as const,
      label: isRtl ? 'تصميم القوالب والهوية المؤسسية' : 'Template & Brand Studio',
      icon: FileSpreadsheet,
    },
    {
      id: 'editor' as const,
      label: isRtl ? 'صياغة وتحرير المراسلات الرسمية' : 'Correspondence Editor & Drafting',
      icon: Edit3,
    },
    {
      id: 'archive' as const,
      label: isRtl ? 'الأرشيف ومسارات الإحالة الذكية' : 'Smart Archive & Forwarding Explorer',
      icon: Archive,
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 space-y-6 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Module Title Header Bar */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800 ${isRtl ? 'text-right' : 'text-left'}`}>
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-brand/10 dark:bg-brand/20 text-brand shadow-sm shrink-0 border border-brand/20">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                {isRtl ? 'إدارة الديوان والمراسلات الرسمية' : 'Official Diwan & State Correspondence'}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand border border-brand/30 font-mono">
                {isRtl ? 'نظام الديوان الموحد' : 'SOVEREIGN DIWAN'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              {isRtl
                ? 'إدارة المراسلات والقوالب الرسمية بختم إلكتروني وتوقيع خارجي ورمز QR وأرشفة ذكية'
                : 'Sovereign management of official letters, Canvas templates, external QR seals, and smart semantic archiving'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 shadow-sm">
            <QrCode className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{isRtl ? 'الختم الخارجي بـ QR مفعّل' : 'External QR Seal Active'}</span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 shrink-0 transition-all ${
                isActive
                  ? 'bg-brand text-white shadow-md shadow-brand/20'
                  : 'bg-white dark:bg-[#1a1d21] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800/80'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Tab View Render */}
      <div className="flex-1">
        {activeTab === 'dashboard' && <CorrespondenceDashboard />}
        {activeTab === 'designer' && <CanvasTemplateDesigner />}
        {activeTab === 'editor' && <LetterCanvas />}
        {activeTab === 'archive' && <ArchiveExplorer />}
      </div>
    </div>
  );
};
