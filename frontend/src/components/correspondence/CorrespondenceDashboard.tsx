import React, { useEffect } from 'react';
import { useLocalization } from '@/contexts/LocalizationContext';
import { 
  FileText, 
  CheckCircle2, 
  Clock, 
  Archive, 
  Plus, 
  QrCode, 
  ShieldCheck, 
  FileSpreadsheet,
  AlertCircle,
  Eye,
  ArrowRight,
  Stamp
} from 'lucide-react';
import { useCorrespondenceStore, Correspondence } from '../../store/useCorrespondenceStore';

export const CorrespondenceDashboard: React.FC = () => {
  const { isRtl } = useLocalization();
  const { 
    correspondences, 
    fetchCorrespondences, 
    fetchTemplates, 
    setActiveTab, 
    setSelectedCorrespondence, 
    signCorrespondence, 
    loading 
  } = useCorrespondenceStore();

  useEffect(() => {
    fetchCorrespondences();
    fetchTemplates();
  }, [fetchCorrespondences, fetchTemplates]);

  const total = correspondences.length;
  const drafts = correspondences.filter(c => c.status === 'draft').length;
  const pending = correspondences.filter(c => c.status === 'pending_signature').length;
  const signed = correspondences.filter(c => c.status === 'signed').length;
  const archived = correspondences.filter(c => c.status === 'archived').length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            {isRtl ? 'مسودة قيد الإعداد' : 'Draft'}
          </span>
        );
      case 'pending_signature':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40 animate-pulse">
            <Stamp className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            {isRtl ? 'بانتظار الختم والاعتماد' : 'Pending Approval'}
          </span>
        );
      case 'signed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            {isRtl ? 'مختوم وموقع بـ QR' : 'Sealed'}
          </span>
        );
      case 'archived':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40">
            <Archive className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            {isRtl ? 'مؤرشف دلالياً' : 'Archived'}
          </span>
        );
      default:
        return null;
    }
  };

  const getConfidentialityBadge = (conf: string) => {
    switch (conf) {
      case 'top_secret':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-rose-600 text-white shadow-sm">{isRtl ? 'سري للغاية' : 'Top Secret'}</span>;
      case 'confidential':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-amber-500 text-white shadow-sm">{isRtl ? 'سري ومقيد' : 'Confidential'}</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">{isRtl ? 'عام' : 'Public'}</span>;
    }
  };

  const handleQuickSign = async (item: Correspondence) => {
    try {
      await signCorrespondence(item.id);
    } catch (err) {
      console.error('Sign failed:', err);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Notice Banner: External Signature & QR Verification */}
      <div className="p-4 rounded-xl bg-brand/5 dark:bg-brand/10 border border-brand/20 text-slate-900 dark:text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-brand/10 text-brand shrink-0 mt-0.5">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-base flex items-center gap-2 text-slate-900 dark:text-white">
              <span>{isRtl ? 'نظام الختم المؤسسي والتوقيع الخارجي المعتمد' : 'Certified External QR Sealing System'}</span>
              <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-emerald-500 text-white rounded-full shadow-sm flex items-center gap-1">
                <QrCode className="w-3 h-3" /> {isRtl ? 'مشفر بـ HMAC256' : 'HMAC256 Verified'}
              </span>
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
              {isRtl
                ? 'تم اعتماد الختم المباشر والتوقيع المكتبي الخارجي مع التحقق الفوري عبر رمز QR المشفر لضمان الموثوقية دون كشف التوقيعات الداخلية.'
                : 'Direct digital seal & external office signature certified with real-time encrypted QR verification to guarantee trust.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => setActiveTab('editor')}
            className="px-4 py-2 rounded-lg bg-brand hover:bg-brand/90 text-white font-medium text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {isRtl ? 'إنشاء خطاب رسمي جديد' : 'Draft New Official Letter'}
          </button>
          <button
            onClick={() => setActiveTab('designer')}
            className="px-4 py-2 rounded-lg bg-white dark:bg-[#1a1d21] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-medium text-sm transition-all flex items-center gap-2 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {isRtl ? 'تصميم قالب مؤسسي' : 'Design Institutional Template'}
          </button>
        </div>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="p-5 rounded-xl bg-white dark:bg-[#1a1d21] border border-slate-200 dark:border-slate-800/80 shadow-sm hover:shadow transition-all flex flex-col justify-between min-h-[120px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{isRtl ? 'إجمالي المراسلات' : 'Total Letters'}</span>
            <div className="p-2.5 rounded-xl bg-brand/10 dark:bg-brand/20 text-brand shrink-0">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white">{total}</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 tracking-wider font-mono">{isRtl ? 'كافة الديوان' : 'ALL DIWAN'}</span>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-[#1a1d21] border border-slate-200 dark:border-slate-800/80 shadow-sm hover:shadow transition-all flex flex-col justify-between min-h-[120px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{isRtl ? 'مسودات قيد الإعداد' : 'Draft Letters'}</span>
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white">{drafts}</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 tracking-wider font-mono">{isRtl ? 'مسودات' : 'DRAFTS'}</span>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-[#1a1d21] border border-slate-200 dark:border-slate-800/80 shadow-sm hover:shadow transition-all flex flex-col justify-between min-h-[120px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{isRtl ? 'بانتظار الختم والتوقيع' : 'Pending Approval'}</span>
            <div className="p-2.5 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
              <Stamp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between gap-2">
            <span className="text-3xl font-extrabold text-amber-600 dark:text-amber-400">{pending}</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 tracking-wider font-mono animate-pulse">{isRtl ? 'بانتظار الاعتماد' : 'PENDING'}</span>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-[#1a1d21] border border-slate-200 dark:border-slate-800/80 shadow-sm hover:shadow transition-all flex flex-col justify-between min-h-[120px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{isRtl ? 'مختومة وموقعة رسمياً' : 'Sealed & Signed'}</span>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between gap-2">
            <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">{signed}</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 tracking-wider font-mono">{isRtl ? 'مختوم بـ QR' : 'SEALED (QR)'}</span>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-[#1a1d21] border border-slate-200 dark:border-slate-800/80 shadow-sm hover:shadow transition-all flex flex-col justify-between min-h-[120px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{isRtl ? 'مؤرشفة ومؤمنة دلالياً' : 'Smart Archived'}</span>
            <div className="p-2.5 rounded-xl bg-brand/10 dark:bg-brand/20 text-brand shrink-0">
              <Archive className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between gap-2">
            <span className="text-3xl font-extrabold text-brand">{archived}</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand/10 dark:bg-brand/20 text-brand tracking-wider font-mono">{isRtl ? 'مفهرس دلالياً' : 'RAG INDEXED'}</span>
          </div>
        </div>
      </div>

      {/* Recent Correspondences List */}
      <div className="p-6 rounded-xl bg-white dark:bg-[#1a1d21] border border-slate-200 dark:border-slate-800/80 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <div className="p-2 rounded-lg bg-brand/10 dark:bg-brand/20 text-brand">
                <FileText className="w-5 h-5" />
              </div>
              <span>{isRtl ? 'سجل المراسلات الرسمية والديوان الحي' : 'Official Correspondence Log & Diwan Stream'}</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {isRtl ? 'متابعة الخطابات الصادرة والواردة وحالة الختم الإلكتروني الخارجي وسلسلة الإحالات المؤسسية' : 'Track outgoing and incoming dispatches, external QR seals, and forwarding chains.'}
            </p>
          </div>
          <button
            onClick={() => setActiveTab('archive')}
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 flex items-center gap-2 transition-colors shrink-0 cursor-pointer"
          >
            <span>{isRtl ? 'الانتقال للمستعرض والأرشيف' : 'Go to Archive & Explorer'}</span>
            <ArrowRight className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {loading && correspondences.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <div className="animate-spin inline-block w-6 h-6 border-[3px] border-current border-t-transparent text-brand rounded-full mb-2" />
            <p className="text-sm">{isRtl ? 'جاري تحميل المراسلات الرسمية...' : 'Loading correspondences...'}</p>
          </div>
        ) : correspondences.length === 0 ? (
          <div className="py-12 text-center rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-700">
            <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
              {isRtl ? 'لا توجد مراسلات مطابقة في سجل الديوان حتى الآن' : 'No matching correspondences found in Diwan'}
            </p>
            <p className="text-xs text-slate-400 mb-4">{isRtl ? 'ابدأ بصياغة خطاب رسمي جديد أو تصميم قالب مؤسسي لمنشأتك.' : 'Start by drafting a new official letter or designing an institutional template.'}</p>
            <button
              onClick={() => setActiveTab('editor')}
              className="px-4 py-2 rounded-lg bg-brand hover:bg-brand/90 text-white text-xs font-semibold inline-flex items-center gap-2 shadow transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {isRtl ? 'إنشاء خطاب رسمي جديد' : 'Draft New Official Letter'}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4 text-start">{isRtl ? 'الرقم التسلسلي المقفول' : 'Serial Number'}</th>
                  <th className="py-3 px-4 text-start">{isRtl ? 'الموضوع والمحتوى' : 'Subject & Content'}</th>
                  <th className="py-3 px-4 text-start">{isRtl ? 'درجة السرية' : 'Classification'}</th>
                  <th className="py-3 px-4 text-start">{isRtl ? 'حالة الاعتماد' : 'Status'}</th>
                  <th className="py-3 px-4 text-start">{isRtl ? 'جهة الختم (المكتب الخارجي)' : 'Sealed By (External)'}</th>
                  <th className="py-3 px-4 text-end">{isRtl ? 'الإجراءات السيادية' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm">
                {correspondences.slice(0, 8).map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-brand">
                      {item.serial_number || (isRtl ? 'مسودة-غير-مؤرخة' : 'DRAFT-ID')}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
                        <span>{item.title || (isRtl ? 'خطاب بدون عنوان' : 'Untitled Letter')}</span>
                        {item.urgent && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> {isRtl ? 'عاجل جداً' : 'Urgent'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{item.content}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      {getConfidentialityBadge(item.confidentiality || 'public')}
                    </td>
                    <td className="py-3.5 px-4">
                      {getStatusBadge(item.status || 'draft')}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300">
                      {item.signed_by ? (
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="font-semibold">{item.signed_by}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-end">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedCorrespondence(item);
                            setActiveTab('editor');
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-brand hover:bg-brand/10 transition-colors cursor-pointer"
                          title={isRtl ? 'استعراض وتحرير الخطاب' : 'View & Edit Letter'}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {item.status === 'pending_signature' && (
                          <button
                            onClick={() => handleQuickSign(item)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
                            title={isRtl ? 'اعتماد الختم الخارجي (QR)' : 'Official External Seal (QR)'}
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            {isRtl ? 'ختم رسمي' : 'Seal'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
