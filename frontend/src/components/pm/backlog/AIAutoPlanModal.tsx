import React from 'react';
import { Sparkles, X, Wand2, CheckSquare, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AIProposal } from '@/types';
import { useLocalization } from '@/contexts/LocalizationContext';

interface AIAutoPlanModalProps {
  isOpen: boolean;
  proposal: AIProposal | null;
  isAssigning: boolean;
  onClose: () => void;
  onAccept: () => void;
  priorities: { label: string, value: number, badge: string }[];
}

export function AIAutoPlanModal({
  isOpen,
  proposal,
  isAssigning,
  onClose,
  onAccept,
  priorities
}: AIAutoPlanModalProps) {
  const { isRtl } = useLocalization();
  if (!isOpen || !proposal) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-brand-light shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-6 bg-gradient-to-r from-purple-600 via-indigo-600 to-indigo-700 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl">
              <Sparkles className="w-6 h-6 text-purple-200 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">{isRtl ? "اقتراح مساعد أجايل الذكي" : "AI Agile Co-Pilot Proposal"}</h3>
              <p className="text-xs text-purple-200 font-medium">{isRtl ? `تخطيط تلقائي لمخرجات السبرنت ${proposal.targetSprint.Name}` : `Auto-planned sprint increment for ${proposal.targetSprint.Name}`}</p>
            </div>
          </div>
          <button onClick={onClose} title={isRtl ? "إغلاق اقتراح الذكاء الاصطناعي" : "Close AI Proposal"} aria-label={isRtl ? "إغلاق اقتراح الذكاء الاصطناعي" : "Close AI Proposal"} className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          <div className="bg-brand-light border border-brand-light rounded-xl p-4 text-xs text-brand-dark space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-purple-950 text-sm">
              <Wand2 className="w-4 h-4 text-brand" /> {isRtl ? "مبرّر استراتيجية الذكاء الاصطناعي:" : "AI Strategy Rationale:"}
            </div>
            <p className="leading-relaxed text-brand-dark font-medium">{proposal.rationale}</p>
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{isRtl ? `عناصر العمل المقترحة (${proposal.selectedTasks.length})` : `Proposed Work Items (${proposal.selectedTasks.length})`}</span>
              <span className="text-xs font-bold text-brand bg-brand-light px-2.5 py-1 rounded-full border border-brand-light">
                {isRtl ? "الحمل الكلي:" : "Total Load:"} {proposal.selectedTasks.reduce((acc, t) => acc + (t.StoryPoints || 0), 0)} / 30 {isRtl ? "نقطة" : "pts"}
              </span>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pe-1">
              {proposal.selectedTasks.map(task => {
                const prio = priorities.find(p => p.value === (task.Priority || 0)) || priorities[3];
                return (
                  <div key={task.ID} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                    <div className="flex items-center gap-3">
                      <CheckSquare className="w-4 h-4 text-brand" />
                      <span className="text-xs font-mono font-bold text-slate-400">T-{task.ID.substring(0,4)}</span>
                      <span className="text-sm font-semibold text-slate-800">{task.Title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${prio.badge}`}>{prio.label}</span>
                      <span className="text-xs font-bold bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">{task.StoryPoints || 0} pts</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isAssigning} className="font-semibold text-xs">
            {isRtl ? "تجاهل الاقتراح" : "Discard Proposal"}
          </Button>
          <Button onClick={onAccept} disabled={isAssigning} className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs shadow-md">
            {isAssigning ? (isRtl ? "جارِ الإسناد..." : "Assigning Tasks...") : (isRtl ? `قبول وإسناد (${proposal.selectedTasks.length} مهمة)` : `Accept & Assign (${proposal.selectedTasks.length} Tasks)`)} <ArrowRight className="w-4 h-4 ms-1.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
