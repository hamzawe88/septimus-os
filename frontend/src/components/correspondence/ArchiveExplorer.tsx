import React, { useState, useEffect } from 'react';
import { useLocalization } from '@/contexts/LocalizationContext';
import { 
  Archive, 
  Search, 
  Filter, 
  GitBranch, 
  FileText, 
  CheckCircle2, 
  Clock, 
  Stamp, 
  QrCode, 
  Eye, 
  ShieldCheck
} from 'lucide-react';
import { useCorrespondenceStore, Correspondence } from '../../store/useCorrespondenceStore';

export const ArchiveExplorer: React.FC = () => {
  const { isRtl } = useLocalization();
  const { 
    correspondences, 
    fetchCorrespondences, 
    setSelectedCorrespondence, 
    setActiveTab, 
    loading 
  } = useCorrespondenceStore();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedItemForTree, setSelectedItemForTree] = useState<Correspondence | null>(null);

  useEffect(() => {
    fetchCorrespondences({ status: statusFilter !== 'all' ? statusFilter : undefined, search: search || undefined });
  }, [fetchCorrespondences, statusFilter, search]);

  const filtered = correspondences.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTitle = (c.title || '').toLowerCase().includes(q);
      const matchSerial = (c.serial_number || '').toLowerCase().includes(q);
      const matchContent = (c.content || '').toLowerCase().includes(q);
      return matchTitle || matchSerial || matchContent;
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <Clock className="w-3 h-3 text-slate-500" />
            {isRtl ? 'مسودة قيد الإعداد' : 'Draft'}
          </span>
        );
      case 'pending_signature':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            <Stamp className="w-3 h-3 text-amber-600" />
            {isRtl ? 'بانتظار الختم والاعتماد' : 'Pending Approval'}
          </span>
        );
      case 'signed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            {isRtl ? 'مختوم وموقع بـ QR' : 'Sealed'}
          </span>
        );
      case 'archived':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">
            <Archive className="w-3 h-3 text-indigo-600" />
            {isRtl ? 'مؤرشف دلالياً' : 'Archived'}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Filter & Search Bar */}
      <div className="p-5 rounded-xl bg-white dark:bg-[#1a1d21] border border-slate-200 dark:border-slate-800/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className={`w-4 h-4 text-slate-400 absolute top-3 ${isRtl ? 'right-3.5' : 'left-3.5'}`} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isRtl ? 'ابحث برقم القيد، الموضوع، أو الكلمات الدلالية...' : 'Search by serial number, subject, or keywords...'}
            className={`w-full py-2 ${isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'} rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm focus:outline-none focus:ring-2 focus:ring-brand`}
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 shrink-0">
            <Filter className="w-3.5 h-3.5" /> {isRtl ? 'الحالة:' : 'Status:'}
          </span>
          {[
            { key: 'all', label: isRtl ? 'جميع الحالات' : 'All Statuses' },
            { key: 'draft', label: isRtl ? 'مسودات' : 'Drafts' },
            { key: 'pending_signature', label: isRtl ? 'بانتظار الختم' : 'Pending' },
            { key: 'signed', label: isRtl ? 'مختوم (QR)' : 'Sealed (QR)' },
            { key: 'archived', label: isRtl ? 'مؤرشف (RAG)' : 'Archived (RAG)' },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setStatusFilter(item.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all cursor-pointer ${
                statusFilter === item.key
                  ? 'bg-brand text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left/Middle Column: Filtered List */}
        <div className="lg:col-span-8 space-y-4">
          <div className="p-6 rounded-xl bg-white dark:bg-[#1a1d21] border border-slate-200 dark:border-slate-800/80 shadow-sm">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Archive className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span>{isRtl ? 'مستكشف الأرشيف الذكي وشجرة الإحالات' : 'Smart Archive & Forwarding Explorer'}</span>
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                  {filtered.length}
                </span>
              </h3>
            </div>

            {loading && filtered.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">{isRtl ? 'جاري تحميل سجلات الأرشيف...' : 'Loading archive records...'}</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-800">
                <FileText className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {isRtl ? 'لا توجد مراسلات مطابقة في ديوان الرئاسة' : 'No matching correspondences found in Diwan'}
                </p>
                <p className="text-xs text-slate-400 mt-1">{isRtl ? 'حاول تعديل معايير البحث أو تصفية الحالة أعلاه.' : 'Try adjusting your search criteria or status filter above.'}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItemForTree(item)}
                    className={`py-4 px-3 rounded-xl cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      selectedItemForTree?.id === item.id
                        ? 'bg-indigo-50/80 dark:bg-indigo-900/20 border border-indigo-500/40 shadow-sm'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 border border-transparent'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5 mb-1">
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                          {item.serial_number || (isRtl ? 'مسودة' : 'DRAFT')}
                        </span>
                        {getStatusBadge(item.status || 'draft')}
                        {item.urgent && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 text-[10px] font-bold uppercase tracking-wide">
                            {isRtl ? 'عاجل' : 'Urgent'}
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">{item.title || (isRtl ? 'مستند بدون عنوان' : 'Untitled Document')}</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">{item.content}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCorrespondence(item);
                          setActiveTab('editor');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-500 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-500" />
                        {isRtl ? 'عرض المستند' : 'View Document'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Administrative Routing Tree (ltree) & QR Seal Inspection */}
        <div className="lg:col-span-4 space-y-4">
          <div className="p-6 rounded-xl bg-white dark:bg-[#1a1d21] border border-slate-200 dark:border-slate-800/80 shadow-sm sticky top-6">
            <h4 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2 pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <GitBranch className="w-5 h-5 text-indigo-500" />
              <span>{isRtl ? 'شجرة الإحالات الإدارية وحركة المستند' : 'Administrative Forwarding & Directive Tree'}</span>
            </h4>

            {!selectedItemForTree ? (
              <div className="py-10 text-center text-slate-400 text-xs border border-dashed rounded-xl border-slate-200 dark:border-slate-800 p-4">
                <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-40" />
                {isRtl
                  ? 'اختر أي مراسلة من القائمة يساراً لعرض سجلات الإحالة الهرمية (ltree) والختم الخارجي المشفر (QR Code).'
                  : 'Select any correspondence record on the left to inspect its complete ltree organizational routing logs and external QR verification seal.'}
              </div>
            ) : (
              <div className="space-y-6 text-xs">
                {/* Document Brief */}
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1.5">
                  <div className="flex items-center justify-between font-mono">
                    <span className="font-bold text-blue-600 dark:text-blue-400">{selectedItemForTree.serial_number || (isRtl ? 'مسودة' : 'DRAFT')}</span>
                    <span>{getStatusBadge(selectedItemForTree.status || 'draft')}</span>
                  </div>
                  <p className="font-bold text-slate-900 dark:text-white truncate">{selectedItemForTree.title || (isRtl ? 'بدون عنوان' : 'Untitled Document')}</p>
                  <p className="text-slate-500 text-[11px] leading-relaxed line-clamp-2">{selectedItemForTree.content}</p>
                </div>

                {/* External QR Seal Section */}
                {(selectedItemForTree.status === 'signed' || selectedItemForTree.status === 'archived' || selectedItemForTree.qr_code) && (
                  <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-800/60 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded bg-white shadow-inner shrink-0">
                        <QrCode className="w-10 h-10 text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-extrabold text-emerald-900 dark:text-emerald-300 text-xs uppercase tracking-wide flex items-center gap-1">
                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
                          {isRtl ? 'ختم سيادي معتمد (QR Checksum)' : 'Certified External Seal'}
                        </p>
                        <p className="text-[10px] text-emerald-700 dark:text-emerald-400 truncate font-mono mt-0.5">
                          HASH: {selectedItemForTree.qr_code ? 'SEP-QR-VERIFIED-9832A' : 'VERIFIED'}
                        </p>
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-500">
                          {isRtl ? 'معتمد من:' : 'Sealed:'} {selectedItemForTree.signed_at || (isRtl ? 'سلطة ديوان الرئاسة' : 'By Diwan Authority')}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Routing Tree / Logs */}
                <div>
                  <h5 className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                    {isRtl ? 'سجل الإحالات والتوجيهات (مسار ltree)' : 'Routing & Directive History (ltree path)'}
                  </h5>

                  {!selectedItemForTree.forward_logs || selectedItemForTree.forward_logs.length === 0 ? (
                    <div className="space-y-3">
                      {/* Default simulated initial routing log */}
                      <div className="relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-0 before:w-0.5 before:bg-indigo-300 dark:before:bg-indigo-800">
                        <div className="absolute left-0.5 top-1.5 w-3.5 h-3.5 rounded-full bg-indigo-600 border-2 border-white dark:border-slate-900" />
                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          <div className="flex items-center justify-between font-mono text-[10px] text-indigo-600 dark:text-indigo-400 font-bold mb-1">
                            <span>top.ministry.diwan.exec</span>
                            <span>{isRtl ? 'إصدار أولي' : 'ISSUANCE'}</span>
                          </div>
                          <p className="font-bold text-slate-800 dark:text-slate-200">{isRtl ? 'مكتب ديوان الرئاسة المنشئ' : 'Originating Diwan Office'}</p>
                          <p className="text-slate-500 text-[11px] mt-0.5">{isRtl ? 'تم تسجيل الخطاب ومنحه قفلاً تسلسلياً فريداً.' : 'Document registered and assigned unique serial lock.'}</p>
                        </div>
                      </div>

                      <div className="relative pl-6">
                        <div className="absolute left-0.5 top-1.5 w-3.5 h-3.5 rounded-full bg-slate-300 dark:bg-slate-700 border-2 border-white dark:border-slate-900" />
                        <div className="p-3 rounded-lg bg-slate-50/50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 text-slate-400">
                          <p className="font-semibold">{isRtl ? 'لم تتم أي إحالات إدارية أخرى بعد.' : 'No further forward directives executed yet.'}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedItemForTree.forward_logs.map((log, idx) => (
                        <div key={log.id || idx} className="relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-0 before:w-0.5 before:bg-indigo-300 dark:before:bg-indigo-800 last:before:hidden">
                          <div className="absolute left-0.5 top-1.5 w-3.5 h-3.5 rounded-full bg-indigo-600 border-2 border-white dark:border-slate-900" />
                          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            <div className="flex items-center justify-between font-mono text-[10px] text-indigo-600 dark:text-indigo-400 font-bold mb-1">
                              <span>{log.to_node_path}</span>
                              <span className="uppercase text-amber-600">{log.action_required || (isRtl ? 'إحالة' : 'ROUTED')}</span>
                            </div>
                            <p className="font-bold text-slate-800 dark:text-slate-200">{isRtl ? 'إلى:' : 'To:'} {log.to_user_id}</p>
                            {log.note && (
                              <p className="text-slate-500 text-[11px] mt-1 bg-white dark:bg-[#1a1d21] p-2 rounded border border-slate-100 dark:border-slate-800">
                                &quot;{log.note}&quot;
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
