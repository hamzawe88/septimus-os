import React, { useCallback, useEffect, useState } from 'react';
import type { PublicationContext } from 'centrifuge';
import { apiGet, apiPost, apiPut } from '@/lib/apiClient';
import { useAppStore } from '@/store/useAppStore';
import AISettings from '../settings/AISettings';
import { Activity, Cpu, Zap, ShieldCheck, Play, Loader2 } from 'lucide-react';
import { useLocalization } from '@/contexts/LocalizationContext';

// The strong-tier model the sidecar actually routes to per provider (see
// ai-sidecar/providers.py MODEL_TIERS). Keeps the "Active Provider" display honest.
const STRONG_MODEL: Record<string, string> = { openai: 'gpt-5', gemini: 'gemini-2.5-pro' };

interface ProviderSetting { provider: string; isActive?: boolean; hasApiKey?: boolean; apiKey?: string; }

// The active provider as data; the display label is derived at render time so it
// follows the current language without a refetch.
interface ActiveProvider { provider: string; configured: boolean }

interface AgentState {
  id: string;
  name: string;
  role: string;
  status: string;
  loop_count: number;
}

interface AgentLog {
  id: string;
  agent_name: string;
  action: string;
  input_data: string;
  output_data: string;
  status: string;
  created_at: string;
}

interface PendingApproval {
  id: string;
  agent_name: string;
  action_type: string;
  payload: string;
  reason: string;
  status: string;
}

interface AIConfig {
  provider: string;
  model: string;
  api_key?: string;
}

// The snapshot GET /agents/status returns. `channel` is the Centrifugo channel
// carrying live updates for this workspace — the server names it so the client
// never has to guess the workspace scope.
interface AgentStatusSnapshot {
  states: AgentState[];
  logs: AgentLog[];
  pending: PendingApproval[];
  config: AIConfig;
  channel: string;
}

// One event pushed on `agents_<workspaceID>`. Each carries the row that changed,
// so the UI applies it directly instead of re-fetching the whole board.
type AgentEvent =
  | { type: 'agent_log'; log: AgentLog }
  | { type: 'agent_state'; state: AgentState }
  | { type: 'agent_approval'; pending: PendingApproval }
  | { type: 'agent_approval_resolved'; pending: PendingApproval };

// Matches the LIMIT 50 the snapshot query uses, so live-appended logs and a
// refetched snapshot converge on the same list instead of fighting each other.
const MAX_LOGS = 50;

// Safety-net refetch while the subscription is live. The agents channel lives in
// Centrifugo's default namespace, which keeps no history — so anything published
// while the socket is down is gone for good, and a reconnect alone cannot heal
// the board. A 60s snapshot bounds that staleness while still cutting request
// volume 20x versus the 3s poll this replaced.
const SAFETY_REFETCH_MS = 60000;
// Cadence while the stream is NOT live — no Centrifugo at all (same defensive
// shape as AgentChatDrawer, which falls back to non-streamed replies when
// centrifuge is null), or the subscription was refused/dropped. Matches the old
// polling interval, so the worst case is exactly the behaviour this replaced.
const FALLBACK_POLL_MS = 3000;

export function AgentOrchestrator() {
  const { isRtl } = useLocalization();
  const centrifuge = useAppStore((s) => s.centrifuge);
  const [states, setStates] = useState<AgentState[]>([]);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [channel, setChannel] = useState<string>('');
  // True only while Centrifugo has confirmed the subscription; drives whether we
  // trust the stream or fall back to polling.
  const [streamLive, setStreamLive] = useState(false);
  const [activeTab, setActiveTab] = useState<'monitoring' | 'providers'>('monitoring');
  // undefined = not fetched yet, null = no active provider. Kept as data rather
  // than a pre-rendered string so fetchStatus stays independent of the language,
  // and a language flip never has to tear down the live subscription below.
  const [activeProvider, setActiveProvider] = useState<ActiveProvider | null | undefined>(undefined);

  const [showDeployModal, setShowDeployModal] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: '', role: '', config: '{}' });

  const fetchStatus = useCallback(async () => {
    try {
      // /agents/status already returns the agent states, so the separate GET
      // /agents it used to make was a duplicate of the same table.
      const res = await apiGet<AgentStatusSnapshot>('/agents/status')
        .catch(() => ({ states: [], logs: [], pending: [], config: {} as AIConfig, channel: '' }));
      setStates(res.states || []);
      setLogs(res.logs || []);
      setPending(res.pending || []);
      setChannel(res.channel || '');

      // Active provider from the REAL source (ai_providers settings), showing
      // the model the sidecar actually routes to — not a stale hardcoded label.
      const wsId = (typeof window !== 'undefined' && localStorage.getItem('currentWorkspaceId')) || '';
      const providers = await apiGet<ProviderSetting[]>(`/settings/ai_providers?workspace_id=${wsId}`).catch(() => [] as ProviderSetting[]);
      const active = Array.isArray(providers) ? providers.find(p => p.isActive) : undefined;
      setActiveProvider(active
        ? { provider: active.provider, configured: !!active.hasApiKey || !!active.apiKey }
        : null);
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Apply one pushed event to local state. Every branch upserts by id so a
  // duplicate publish (or a publish racing the snapshot) is idempotent.
  const applyEvent = useCallback((event: AgentEvent) => {
    switch (event.type) {
      case 'agent_log': {
        const incoming = event.log;
        if (!incoming?.id) return;
        setLogs(prev => {
          const next = prev.some(l => l.id === incoming.id)
            ? prev.map(l => (l.id === incoming.id ? { ...l, ...incoming } : l))
            : [incoming, ...prev];
          // Newest first, matching the snapshot's `ORDER BY created_at DESC`.
          return next
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, MAX_LOGS);
        });
        return;
      }
      case 'agent_state': {
        const incoming = event.state;
        if (!incoming?.id) return;
        setStates(prev => prev.some(s => s.id === incoming.id)
          ? prev.map(s => (s.id === incoming.id ? { ...s, ...incoming } : s))
          : [...prev, incoming]);
        return;
      }
      case 'agent_approval': {
        const incoming = event.pending;
        if (!incoming?.id) return;
        setPending(prev => prev.some(p => p.id === incoming.id) ? prev : [...prev, incoming]);
        return;
      }
      case 'agent_approval_resolved': {
        const incoming = event.pending;
        if (!incoming?.id) return;
        setPending(prev => prev.filter(p => p.id !== incoming.id));
        return;
      }
    }
  }, []);

  const [dispatching, setDispatching] = useState<string | null>(null);
  const dispatchAgent = async (type: 'crm' | 'task' | 'comm') => {
    setDispatching(type);
    try {
      await apiPost('/agents/dispatch', {
        agent_type: type,
        task: isRtl ? 'تحليل الحالة الحالية للقسم' : 'Analyze current department state',
      });
    } catch (e) {
      console.error(e);
    } finally {
      // Live: the runner's "running" then "completed" events land on their own, so
      // the button only has to outlast the dispatch round-trip. Not live: the Go
      // runner does ~2s of real work, so keep the old wait and refresh after it.
      const settle = streamLive ? 800 : 2600;
      setTimeout(() => {
        if (!streamLive) fetchStatus();
        setDispatching(null);
      }, settle);
    }
  };

  // The label for the "Active Provider" tile, derived from the fetched provider.
  const activeModelName = activeProvider === undefined
    ? '…'
    : activeProvider === null
      ? (isRtl ? 'لا مزوّد نشط' : 'No active provider')
      : `${activeProvider.provider} · ${activeProvider.configured
          ? (STRONG_MODEL[activeProvider.provider] || 'auto')
          : (isRtl ? 'غير مُعَد' : 'not configured')}`;

  // One snapshot on mount: a subscription only delivers future events, so the
  // board needs its initial contents from the API either way.
  useEffect(() => {
    const loadSnapshot = async () => { await fetchStatus(); };
    loadSnapshot();
  }, [fetchStatus]);

  // Live updates. Agent runs are bursty and rare — pushing the ~3 rows that
  // actually change beats re-reading the whole board every 3 seconds.
  useEffect(() => {
    if (!centrifuge) return;   // no socket at all → the refetch effect polls
    if (!channel) return;      // waiting for the snapshot to name our workspace channel

    // Reuse an existing subscription: Centrifugo rejects a second newSubscription
    // for a channel already registered on the client.
    const existing = centrifuge.getSubscription(channel);
    const sub = existing ?? centrifuge.newSubscription(channel);

    const onPublication = (ctx: PublicationContext) => {
      const data = ctx.data as AgentEvent | undefined;
      if (data?.type) applyEvent(data);
    };
    // Only a confirmed subscription earns the slow refetch. If Centrifugo refuses
    // the channel (e.g. permission denied) or the socket drops, we must go back to
    // polling — a subscription that silently never delivers would otherwise leave
    // the board 60s stale, which is worse than the poll it replaced.
    const onSubscribed = () => setStreamLive(true);
    const onDown = () => setStreamLive(false);

    sub.on('publication', onPublication);
    sub.on('subscribed', onSubscribed);
    sub.on('error', onDown);
    sub.on('unsubscribed', onDown);
    if (!existing) sub.subscribe();

    return () => {
      setStreamLive(false);
      try {
        sub.off('publication', onPublication);
        sub.off('subscribed', onSubscribed);
        sub.off('error', onDown);
        sub.off('unsubscribed', onDown);
        sub.unsubscribe();
      } catch { /* socket already torn down */ }
    };
  }, [centrifuge, channel, applyEvent]);

  // Refetch cadence follows the stream's health: a safety net when live, the old
  // poll when not.
  useEffect(() => {
    const interval = setInterval(fetchStatus, streamLive ? SAFETY_REFETCH_MS : FALLBACK_POLL_MS);
    return () => clearInterval(interval);
  }, [streamLive, fetchStatus]);

  const toggleKillSwitch = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'killed' ? 'running' : 'killed';
    await apiPut(`/agents/${id}/status`, { status: newStatus });
    fetchStatus();
  };

  const handleApproval = async (id: string, action: 'approve' | 'reject') => {
    await apiPost(`/agents/approve/${id}`, { action });
    fetchStatus();
  };

  const deployAgent = async () => {
    try {
      const configObj = JSON.parse(newAgent.config);
      await apiPost('/agents', {
        name: newAgent.name,
        role: newAgent.role,
        config: configObj
      });
      setShowDeployModal(false);
      setNewAgent({ name: '', role: '', config: '{}' });
      fetchStatus();
    } catch {
      alert(isRtl ? "إعداد JSON غير صالح" : "Invalid JSON config");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#f8fafc] p-6 pb-20 min-h-0">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{isRtl ? "مركز الذكاء الاصطناعي" : "AI Center"}</h1>
            <p className="text-slate-500 mt-2">{isRtl ? "راقب الوكلاء وأدر مزوّدي نماذج اللغة من مكان واحد." : "Monitor agents and manage your LLM providers in one place."}</p>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveTab('monitoring')}
              className={`px-6 py-2 rounded-lg font-semibold text-sm transition-all ${
                activeTab === 'monitoring' ? 'bg-white text-brand shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              {isRtl ? "المراقبة والتحكم" : "Monitoring & Control"}
            </button>
            <button
              onClick={() => setActiveTab('providers')}
              className={`px-6 py-2 rounded-lg font-semibold text-sm transition-all ${
                activeTab === 'providers' ? 'bg-white text-brand shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              {isRtl ? "المزوّدون والنماذج" : "Providers & Models"}
            </button>
          </div>
        </header>

        {/* ── Live Telemetry Bar ── */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4 border-b md:border-b-0 md:border-e border-slate-200 pb-4 md:pb-0 md:pe-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <Activity className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{isRtl ? "الوكلاء النشطون" : "Active Agents"}</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-black text-slate-900">{states.filter(s => s.status !== 'killed').length}</span>
                <span className="text-xs text-green-600 font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-ping" /> {isRtl ? "متصل" : "Online"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 border-b md:border-b-0 md:border-e border-slate-200 pb-4 md:pb-0 md:pe-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{isRtl ? "إجمالي الدورات" : "Total Loops"}</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-black text-slate-900">{states.reduce((acc, s) => acc + (s.loop_count || 0), 0)}</span>
                <span className="text-xs text-purple-500">{isRtl ? "الدورات المنفّذة" : "Cycles Executed"}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 border-b md:border-b-0 md:border-e border-slate-200 pb-4 md:pb-0 md:pe-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{isRtl ? "المزوّد النشط" : "Active Provider"}</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-lg font-bold text-slate-900 truncate max-w-[140px]" title={activeModelName}>
                  {activeModelName}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{isRtl ? "حالة النظام" : "System Status"}</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-lg font-bold text-emerald-600">{isRtl ? "مستقل" : "Autonomous"}</span>
                <span className="text-xs text-slate-500">{isRtl ? "الفرز نشط" : "Triage Active"}</span>
              </div>
            </div>
          </div>
        </div>

        {activeTab === 'providers' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full min-h-0 transition-all">
            <AISettings />
          </div>
        )}

        {activeTab === 'monitoring' && (
          <>

        {/* Live Grid */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-slate-800">{isRtl ? "الوكلاء المنشورون" : "Deployed Agents"}</h2>
          <button onClick={() => setShowDeployModal(true)} className="px-6 py-2 bg-brand text-white rounded-xl font-bold hover:bg-brand/90 transition-colors shadow-md">
            + Deploy New Agent
          </button>
        </div>

        {/* Quick-run: dispatch a real task to a specialized agent. The Go runner
            reads live workspace data, so counters and the stream populate. */}
        <div className="flex flex-wrap items-center gap-3 mb-6 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <span className="text-sm font-semibold text-slate-600">{isRtl ? "تشغيل سريع لوكيل:" : "Quick-run an agent:"}</span>
          {(['crm', 'task', 'comm'] as const).map((type) => (
            <button
              key={type}
              onClick={() => dispatchAgent(type)}
              disabled={dispatching !== null}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-brand/10 text-brand border border-brand/20 hover:bg-brand/20 transition-colors disabled:opacity-50"
            >
              {dispatching === type ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isRtl
                ? (type === 'crm' ? 'وكيل CRM' : type === 'task' ? 'وكيل المهام' : 'وكيل التواصل')
                : (type === 'crm' ? 'CRM Agent' : type === 'task' ? 'Task Agent' : 'Comm Agent')}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {states.map(state => {
            const isKilled = state.status === 'killed';
            
            return (
              <div key={state.id} className={`p-6 rounded-2xl border-2 transition-all bg-white shadow-sm hover:shadow-md ${isKilled ? 'border-red-200 bg-red-50/50' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-slate-800 capitalize">{state.name}</h3>
                  <div className={`w-3 h-3 rounded-full ${isKilled ? 'bg-red-500' : 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)] animate-pulse'}`} />
                </div>
                <div className="text-sm text-slate-500 space-y-1 mb-6">
                  <p className="font-medium">Role: <span className="text-slate-800 font-bold">{state.role || 'General'}</span></p>
                  <p className="font-medium">Status: <span className={isKilled ? 'text-red-500 font-bold' : 'text-green-600 font-bold'}>{state.status || 'idle'}</span></p>
                  <p className="font-medium">{isRtl ? "الدورات المنفّذة:" : "Loops Executed:"} <span className="text-slate-800 font-bold">{state.loop_count || 0}</span></p>
                </div>
                <button
                  onClick={() => toggleKillSwitch(state.id, state.status)}
                  className={`w-full py-2.5 rounded-xl font-semibold transition-colors border ${
                    isKilled 
                      ? 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100' 
                      : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                  }`}
                >
                  {isKilled ? 'Resume Agent' : 'Kill Switch'}
                </button>
              </div>
            );
          })}
          {states.length === 0 && <p className="text-slate-500 col-span-3 text-center italic py-8">{isRtl ? "لا وكلاء منشورون بعد." : "No agents deployed yet."}</p>}
        </div>

        {/* Pending Approvals */}
        {pending.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-bold text-yellow-700 mb-4 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse" />
              Human-in-the-loop Required
            </h3>
            <div className="space-y-4">
              {pending.map(p => (
                <div key={p.id} className="bg-white rounded-xl p-4 border border-yellow-200 shadow-sm flex justify-between items-center">
                  <div>
                    <p className="text-slate-800 font-bold capitalize">{p.agent_name} Agent - {p.action_type}</p>
                    <p className="text-sm text-slate-500 mt-1 font-medium">{p.reason}</p>
                    <pre className="text-xs text-slate-600 mt-2 bg-slate-50 border border-slate-100 p-3 rounded-lg overflow-x-auto">{p.payload}</pre>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleApproval(p.id, 'reject')} className="px-4 py-2 rounded-lg font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors">Reject</button>
                    <button onClick={() => handleApproval(p.id, 'approve')} className="px-4 py-2 rounded-lg font-semibold bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 transition-colors">Approve</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live Logs */}
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-xl font-bold text-slate-800 mb-4">{isRtl ? "تدفّق التعاون" : "Collaboration Stream"}</h3>
          <div className="space-y-3 max-h-[400px] overflow-y-auto pe-2 scrollbar-thin">
            {logs.map(log => (
              <div key={log.id} className="text-sm font-mono border-s-4 border-slate-200 ps-4 py-2 bg-slate-50/50 rounded-e-lg">
                <div className="flex items-center gap-3 text-slate-500 text-xs mb-1.5">
                  <span className="font-semibold">{new Date(log.created_at).toLocaleTimeString()}</span>
                  <span className="text-indigo-600 font-bold uppercase tracking-wider">[{log.agent_name}]</span>
                  <span className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase tracking-wider ${
                    log.status === 'completed' ? 'bg-green-100 text-green-700' :
                    log.status === 'failed' ? 'bg-red-100 text-red-700' :
                    log.status === 'killed' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>{log.status}</span>
                </div>
                <div className="text-slate-800 font-semibold mb-1">{log.action}</div>
                <div className="text-slate-500 text-xs mb-0.5 break-all">IN: {log.input_data}</div>
                <div className="text-slate-600 text-xs break-all">OUT: {log.output_data}</div>
              </div>
            ))}
            {logs.length === 0 && <p className="text-slate-400 italic text-center py-8">{isRtl ? "لا نشاط للوكلاء بعد." : "No agent activity yet."}</p>}
          </div>
        </div>
        </>
        )}

      </div>

      {showDeployModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white w-full max-w-lg rounded-2xl p-6 shadow-2xl border border-slate-200">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">{isRtl ? "نشر وكيل جديد" : "Deploy New Agent"}</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{isRtl ? "اسم الوكيل" : "Agent Name"}</label>
                <input
                  type="text"
                  value={newAgent.name}
                  onChange={e => setNewAgent({...newAgent, name: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand focus:bg-white"
                  placeholder={isRtl ? "مثال: محلل مالي" : "e.g. Finance Analyst"}
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{isRtl ? "الدور / التخصص" : "Role / Specialization"}</label>
                <select
                  title={isRtl ? "دور الوكيل" : "Agent Role"}
                  aria-label="Role / Specialization"
                  value={newAgent.role}
                  onChange={e => setNewAgent({...newAgent, role: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand focus:bg-white"
                >
                  <option value="">{isRtl ? "اختر الدور" : "Select Role"}</option>
                  <option value="data_analyst">{isRtl ? "محلل بيانات (قراءة فقط)" : "Data Analyst (Read-only)"}</option>
                  <option value="workflow_architect">{isRtl ? "مهندس سير العمل" : "Workflow Architect"}</option>
                  <option value="qa_tester">{isRtl ? "مختبِر جودة / امتثال" : "QA / Compliance Tester"}</option>
                  <option value="custom">{isRtl ? "وكيل مخصّص" : "Custom Agent"}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{isRtl ? "الإعداد (JSON)" : "Configuration (JSON)"}</label>
                <textarea
                  value={newAgent.config}
                  onChange={e => setNewAgent({...newAgent, config: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:bg-white h-32"
                  placeholder='{"tools": ["db_query", "rag_search"], "prompt": "..."}'
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <button 
                onClick={() => setShowDeployModal(false)}
                className="px-6 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                {isRtl ? "إلغاء" : "Cancel"}
              </button>
              <button 
                onClick={deployAgent}
                className="px-6 py-2.5 rounded-xl font-bold text-white bg-brand hover:bg-brand/90 shadow-md transition-colors"
              >
                {isRtl ? "نشر" : "Deploy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
