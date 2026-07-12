"use client";

import React, { useEffect, useState, useCallback } from "react";
import { 
  Webhook, Play, CheckCircle, Mail, CalendarDays, FolderOpen, 
  Sheet, X, Eye, Activity, Key, Link as LinkIcon, Plus, Trash2, 
  Copy, Check 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import WorkflowCanvas from "./WorkflowCanvas";
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import WorkflowBuilder from '../workflows/WorkflowBuilder';
import { useLocalization } from "@/contexts/LocalizationContext";

interface Workflow {
  ID: string;
  Name: string;
  IsActive: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Nodes: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Edges: any;
  CreatedAt: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  trigger: string;
  action: string;
  status: string;
}

interface WebhookSubscription {
  ID: string;
  TargetURL: string;
  Events: string[] | string;
  Secret?: string;
  IsActive: boolean;
  CreatedAt?: string;
}

interface ApiKeyItem {
  ID: string;
  Name: string;
  KeyHash: string;
  Scopes?: string[];
  IsActive: boolean;
  LastUsedAt?: string | null;
  CreatedAt: string;
}

interface WorkflowRun {
  ID: string;
  WorkflowID: string;
  Status: string;
  TriggerName?: string;
  DurationMs?: number;
  CreatedAt: string;
  WorkflowName?: string;
}

const iconMap: Record<string, React.ReactNode> = {
  mail: <Mail className="w-6 h-6 text-rose-500" />,
  calendar: <CalendarDays className="w-6 h-6 text-brand" />,
  drive: <FolderOpen className="w-6 h-6 text-amber-500" />,
  sheets: <Sheet className="w-6 h-6 text-emerald-500" />,
  webhook: <Webhook className="w-6 h-6 text-brand" />,
};

const iconBgMap: Record<string, string> = {
  mail: "bg-rose-50 border-rose-100",
  calendar: "bg-brand-light border-brand-light",
  drive: "bg-amber-50 border-amber-100",
  sheets: "bg-emerald-50 border-emerald-100",
  webhook: "bg-brand-light border-brand-light",
};

export default function AutomationsView() {
  const { isRtl } = useLocalization();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'templates' | 'logs' | 'webhooks'>('templates');

  // Integration Hub Live State
  const [webhooks, setWebhooks] = useState<WebhookSubscription[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [executionLogs, setExecutionLogs] = useState<WorkflowRun[]>([]);

  // Webhook Modal states
  const [showAddWebhook, setShowAddWebhook] = useState(false);
  const [newHookUrl, setNewHookUrl] = useState("");
  const [newHookSecret, setNewHookSecret] = useState("");
  const [newHookEvents, setNewHookEvents] = useState("all");
  const [copiedUrlId, setCopiedUrlId] = useState<string | null>(null);

  // API Key Modal states
  const [showAddApiKey, setShowAddApiKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState("");
  const [copiedKey, setCopiedKey] = useState(false);

  const fetchWebhooks = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/workspaces/me/webhooks`);
      if (res.ok) {
        const data = await res.json();
        setWebhooks(Array.isArray(data) ? data : (data.data || []));
      }
    } catch (err) {
      console.error("Failed to fetch webhooks:", err);
    }
  }, []);

  const fetchApiKeys = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/apikeys`);
      if (res.ok) {
        const data = await res.json();
        setApiKeys(Array.isArray(data) ? data : (data.data || []));
      }
    } catch (err) {
      console.error("Failed to fetch API keys:", err);
    }
  }, []);

  const fetchAllExecutionLogs = useCallback(async (wfs: Workflow[]) => {
    try {
      const allRuns: WorkflowRun[] = [];
      for (const wf of wfs.slice(0, 10)) {
        try {
          const res = await fetchWithAuth(`${API_BASE_URL}/workflows/${wf.ID}/runs`);
          if (res.ok) {
            const runs: WorkflowRun[] = await res.json();
            if (Array.isArray(runs)) {
              runs.forEach(r => {
                allRuns.push({ ...r, WorkflowName: wf.Name });
              });
            }
          }
        } catch (e) {
          console.error(`Failed to fetch runs for wf ${wf.ID}:`, e);
        }
      }
      allRuns.sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime());
      setExecutionLogs(allRuns);
    } catch (err) {
      console.error("Failed to fetch execution logs:", err);
    }
  }, []);

  const fetchWorkflows = useCallback(async () => {
    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      const res = await fetchWithAuth(`${API_BASE_URL}/workflows?workspace_id=${workspaceId}`);
      if (res.ok) {
        const data = await res.json();
        const wfs = data || [];
        setWorkflows(wfs);
        await fetchAllExecutionLogs(wfs);
      }
      await fetchWebhooks();
      await fetchApiKeys();
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [fetchAllExecutionLogs, fetchWebhooks, fetchApiKeys]);

  useEffect(() => {
    (async () => { await fetchWorkflows(); })();
  }, [isEditing, fetchWorkflows]);

  useEffect(() => {
    (async () => {
      if (activeTab === 'webhooks') {
        await fetchWebhooks();
        await fetchApiKeys();
      } else if (activeTab === 'logs') {
        await fetchAllExecutionLogs(workflows);
      }
    })();
  }, [activeTab, workflows, fetchWebhooks, fetchApiKeys, fetchAllExecutionLogs]);

  const handleActivate = async (wf: Workflow) => {
    setActivatingId(wf.ID);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/workflows/${wf.ID}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !wf.IsActive })
      });
      if (res.ok) {
        await fetchWorkflows();
      } else {
        const err = await res.json();
        alert(err.error || (isRtl ? "فشل تفعيل الأتمتة" : "Failed to activate automation"));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActivatingId(null);
    }
  };

  const handleAddWebhook = async () => {
    if (!newHookUrl) return;
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/workspaces/me/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_url: newHookUrl,
          events: newHookEvents.split(",").map(e => e.trim()),
          secret: newHookSecret,
        })
      });
      if (res.ok) {
        setShowAddWebhook(false);
        setNewHookUrl("");
        setNewHookSecret("");
        setNewHookEvents("all");
        fetchWebhooks();
      } else {
        const err = await res.json();
        alert(err.error || (isRtl ? "فشل إنشاء الويب هوك" : "Failed to create webhook"));
      }
    } catch (err) {
      console.error("Failed to add webhook:", err);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/workspaces/me/webhooks/${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        fetchWebhooks();
      }
    } catch (err) {
      console.error("Failed to delete webhook:", err);
    }
  };

  const handleCopyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrlId(id);
    setTimeout(() => setCopiedUrlId(null), 2000);
  };

  const handleAddApiKey = async () => {
    if (!newKeyName) return;
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/apikeys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName,
          scopes: ["*"]
        })
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedKey(data.secret_key || data.api_key);
        setNewKeyName("");
        fetchApiKeys();
      } else {
        const err = await res.json();
        alert(err.error || (isRtl ? "فشل إنشاء مفتاح API" : "Failed to create API key"));
      }
    } catch (err) {
      console.error("Failed to create API key:", err);
    }
  };

  const handleRevokeApiKey = async (id: string) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/apikeys/${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        fetchApiKeys();
      }
    } catch (err) {
      console.error("Failed to revoke API key:", err);
    }
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(generatedKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  if (isEditing) {
    return (
      <div className="w-full h-full bg-white relative">
        <WorkflowBuilder 
          initialWorkflow={editingWorkflow || undefined} 
          onBack={() => {
            setIsEditing(false);
            setEditingWorkflow(null);
          }} 
        />
      </div>
    );
  }

  return (
    <div className="w-full h-full p-8 overflow-y-auto bg-white font-sans">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-brand/10 dark:bg-brand/20 rounded-xl">
              <Webhook className="w-8 h-8 text-brand" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                {isRtl ? "مركز الأتمتة والتكامل" : "Automation & Integration Center"}
                <span dir="ltr" className="text-slate-400 font-normal text-lg">(Integration Hub)</span>
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                Manage automation workflows and connect external applications via Webhooks/APIs.
              </p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
               <button onClick={() => setActiveTab('templates')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'templates' ? 'bg-white dark:bg-slate-700 shadow-sm text-brand' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>{isRtl ? "سير العمل" : "Workflows"}</button>
               <button onClick={() => setActiveTab('logs')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'logs' ? 'bg-white dark:bg-slate-700 shadow-sm text-brand' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>{isRtl ? "سجل التنفيذ" : "Execution Log"}</button>
               <button onClick={() => setActiveTab('webhooks')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'webhooks' ? 'bg-white dark:bg-slate-700 shadow-sm text-brand' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>{isRtl ? "تكامل API" : "API Integration"}</button>
            </div>
            <Button 
              onClick={() => { setEditingWorkflow(null); setIsEditing(true); }}
              className="bg-brand hover:bg-brand/90 text-white font-bold h-10 px-6 rounded-xl shadow-[0_0_15px_rgba(var(--brand-rgb),0.2)] hover:shadow-[0_0_25px_rgba(var(--brand-rgb),0.4)] gap-2 transition-all"
            >
              <Webhook className="w-4 h-4" />
              Create New Workflow
            </Button>
          </div>
        </div>

        {activeTab === 'templates' && (
          <>
            {/* Stats Bar */}
            <div className="grid grid-cols-3 gap-6 mb-8">
              <div className="bg-[#f8fafc] rounded-2xl p-6 border border-slate-200/60 shadow-sm">
                <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">{isRtl ? "إجمالي سير العمل" : "Total Workflows"}</p>
                <p className="text-4xl font-extrabold text-slate-800">{workflows.length}</p>
              </div>
              <div className="bg-emerald-50 rounded-2xl p-6 border border-emerald-100 shadow-sm">
                <p className="text-sm font-bold text-emerald-600 uppercase tracking-wider mb-2">{isRtl ? "التدفّقات النشطة" : "Active Flows"}</p>
                <p className="text-4xl font-extrabold text-emerald-700">
                  {workflows.filter(w => w.IsActive).length}
                </p>
              </div>
              <div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100 shadow-sm">
                <p className="text-sm font-bold text-indigo-600 uppercase tracking-wider mb-2">Executions (24h)</p>
                <p className="text-4xl font-extrabold text-indigo-700">
                  {executionLogs.length}
                </p>
              </div>
            </div>

            {/* Templates Grid */}
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-32 gap-4">
                <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-medium">Syncing with n8n Engine...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {workflows.length === 0 && (
                  <div className="col-span-full py-20 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                      <Webhook className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">{isRtl ? "لا يوجد سير عمل بعد" : "No workflows yet"}</h3>
                    <p className="text-slate-500 max-w-sm mx-auto mb-6">{isRtl ? "أنشئ أول سير عمل مؤتمت لتوفير الوقت وربط أنظمتك." : "Create your first automated workflow to save time and connect your systems."}</p>
                    <Button onClick={() => { setEditingWorkflow(null); setIsEditing(true); }} className="bg-brand hover:bg-brand/90 text-white font-bold h-11 px-8 rounded-xl shadow-md">
                      Create First Workflow
                    </Button>
                  </div>
                )}
                {workflows.map(wf => (
                  <div 
                    key={wf.ID} 
                    className="group bg-white rounded-2xl border border-slate-200 p-6 flex flex-col hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                  >
                    <div className="flex items-start justify-between mb-6">
                      <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center shadow-sm ${iconBgMap.webhook}`}>
                        {iconMap.webhook}
                      </div>
                      <span className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-wide uppercase ${
                        wf.IsActive 
                          ? "bg-emerald-100 text-emerald-700" 
                          : "bg-slate-100 text-slate-500"
                      }`}>
                        {wf.IsActive ? "Active" : "Inactive"}
                      </span>
                    </div>

                    <h3 className="font-extrabold text-lg text-slate-800 mb-2 group-hover:text-indigo-600 transition-colors">
                      {wf.Name}
                    </h3>
                    <p className="text-slate-500 text-sm mb-6 flex-grow leading-relaxed font-medium">
                      Automated workflow flow containing {wf.Nodes ? (typeof wf.Nodes === 'string' ? JSON.parse(wf.Nodes).length : wf.Nodes.length) : 0} nodes.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-3 mt-auto">
                      <Button 
                        onClick={() => { setEditingWorkflow(wf); setIsEditing(true); }}
                        variant="outline"
                        className="w-full flex items-center justify-center gap-2 rounded-xl h-11 text-sm font-bold border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
                      >
                        <Eye className="w-4 h-4" />
                        Edit Flow
                      </Button>
                      <Button 
                        onClick={() => handleActivate(wf)}
                        disabled={activatingId === wf.ID}
                        className={`w-full flex items-center justify-center gap-2 rounded-xl h-11 text-sm font-bold transition-all shadow-md ${
                          wf.IsActive 
                            ? "bg-amber-50 text-amber-600 border border-amber-200 shadow-none hover:bg-amber-50" 
                            : "bg-indigo-600 hover:bg-indigo-700 text-white"
                        }`}
                      >
                        {wf.IsActive ? "Pause" : (
                          <>
                            <Play className="w-4 h-4" />
                            Activate
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'logs' && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mt-4">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Activity className="w-5 h-5 text-indigo-500" /> Live Execution Logs</h2>
              <span className="px-3 py-1 bg-emerald-100 text-emerald-700 font-bold text-xs rounded-full flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Engine Online</span>
            </div>
            <div className="p-0 overflow-x-auto">
              <table className="w-full text-start text-sm text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-bold text-slate-400">
                  <tr>
                    <th className="px-6 py-4">{isRtl ? "الحالة" : "Status"}</th>
                    <th className="px-6 py-4">{isRtl ? "اسم سير العمل" : "Workflow Name"}</th>
                    <th className="px-6 py-4">{isRtl ? "المُشغّل" : "Trigger"}</th>
                    <th className="px-6 py-4">{isRtl ? "وقت التنفيذ" : "Execution Time"}</th>
                    <th className="px-6 py-4">{isRtl ? "المدة" : "Duration"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {executionLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-medium">
                        No execution logs recorded yet. Trigger or activate a workflow to see live execution history here.
                      </td>
                    </tr>
                  ) : (
                    executionLogs.map(log => (
                      <tr key={log.ID} className="hover:bg-slate-50 transition-colors cursor-pointer">
                        <td className="px-6 py-4">
                          {log.Status === 'success' || log.Status === 'Success' ? (
                            <span className="text-emerald-500 font-bold flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Success</span>
                          ) : (
                            <span className="text-rose-500 font-bold flex items-center gap-1"><X className="w-4 h-4" /> {log.Status || 'Failed'}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-800">{log.WorkflowName || (isRtl ? 'تنفيذ سير عمل' : 'Workflow Execution')}</td>
                        <td className="px-6 py-4">{log.TriggerName || 'Webhook / Event'}</td>
                        <td className="px-6 py-4">{new Date(log.CreatedAt).toLocaleString()}</td>
                        <td className="px-6 py-4">{log.DurationMs ? `${log.DurationMs}ms` : '120ms'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'webhooks' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
             {/* Incoming Webhooks Section */}
             <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm relative overflow-hidden group flex flex-col justify-between">
                <div>
                  <div className="absolute top-0 end-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl -me-10 -mt-10 group-hover:bg-indigo-100 transition-colors"></div>
                  <div className="relative z-10">
                    <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center mb-6 text-indigo-600 shadow-sm border border-indigo-200/50">
                      <LinkIcon className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-extrabold text-slate-800 mb-2">{isRtl ? "الويب هوكس الواردة" : "Incoming Webhooks"}</h3>
                    <p className="text-slate-500 font-medium mb-6">{isRtl ? "أنشئ روابط فريدة لاستقبال البيانات من الأنظمة الخارجية مباشرة في سير عملك." : "Create unique URLs to receive data from external systems directly into your workflows."}</p>
                    
                    {webhooks.length === 0 ? (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-6 text-center text-slate-500 text-sm font-medium">
                        No incoming webhooks configured yet.
                      </div>
                    ) : (
                      <div className="space-y-3 mb-6 max-h-64 overflow-y-auto pe-1">
                        {webhooks.map(hook => (
                          <div key={hook.ID} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-mono text-xs text-slate-700 font-medium">{hook.TargetURL}</div>
                              <div className="flex items-center gap-1 mt-1">
                                {Array.isArray(hook.Events) ? hook.Events.map((ev: string) => (
                                  <span key={ev} className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-bold">{ev}</span>
                                )) : <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-bold">{String(hook.Events || 'all')}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => handleCopyUrl(hook.TargetURL, hook.ID)}
                                className="h-8 px-2 text-xs font-bold border-slate-300 gap-1"
                              >
                                {copiedUrlId === hook.ID ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                {copiedUrlId === hook.ID ? (isRtl ? 'تم النسخ' : 'Copied') : (isRtl ? 'نسخ' : 'Copy')}
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => handleDeleteWebhook(hook.ID)}
                                className="h-8 px-2 text-xs text-rose-600 hover:bg-rose-50 border-slate-300"
                                aria-label="Delete webhook"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <Button 
                  onClick={() => setShowAddWebhook(true)} 
                  className="w-full bg-brand hover:bg-brand-dark text-white font-bold h-11 rounded-xl shadow-md relative z-10"
                >
                  <Plus className="w-4 h-4 me-2" /> Create New Webhook
                </Button>
             </div>
             
             {/* API Credentials Section */}
             <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm relative overflow-hidden group flex flex-col justify-between">
                <div>
                  <div className="absolute top-0 end-0 w-32 h-32 bg-rose-50 rounded-full blur-3xl -me-10 -mt-10 group-hover:bg-rose-100 transition-colors"></div>
                  <div className="relative z-10">
                    <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center mb-6 text-rose-600 shadow-sm border border-rose-200/50">
                      <Key className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-extrabold text-slate-800 mb-2">{isRtl ? "بيانات اعتماد API" : "API Credentials"}</h3>
                    <p className="text-slate-500 font-medium mb-6">{isRtl ? "أدر مفاتيح API بأمان لمصادقة التكاملات مع المنصات الخارجية." : "Manage your API keys securely to authenticate integrations with external platforms."}</p>
                    
                    {apiKeys.length === 0 ? (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-6 text-center text-slate-500 text-sm font-medium">
                        No API credentials generated yet.
                      </div>
                    ) : (
                      <div className="space-y-3 mb-6 max-h-64 overflow-y-auto pe-1">
                        {apiKeys.map(key => (
                          <div key={key.ID} className="flex items-center justify-between p-3 border border-slate-200 rounded-xl bg-white shadow-sm hover:border-brand/30 transition-colors">
                             <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><Key className="w-4 h-4 text-slate-500" /></div>
                                <div className="min-w-0">
                                   <p className="font-bold text-sm text-slate-800 truncate">{key.Name}</p>
                                   <p className="text-xs text-slate-400 font-mono">Created: {new Date(key.CreatedAt).toLocaleDateString()}</p>
                                </div>
                             </div>
                             <div className="flex items-center gap-2 shrink-0">
                               <span className={`px-2 py-1 ${key.IsActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'} text-xs font-bold rounded-lg`}>
                                 {key.IsActive ? 'Valid' : 'Revoked'}
                               </span>
                               <Button 
                                 variant="outline" 
                                 size="sm" 
                                 onClick={() => handleRevokeApiKey(key.ID)}
                                 className="h-8 px-2 text-xs text-rose-600 hover:bg-rose-50 border-slate-200"
                                 aria-label="Revoke API key"
                               >
                                 <Trash2 className="w-3.5 h-3.5" />
                               </Button>
                             </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                
                <Button 
                  onClick={() => { setShowAddApiKey(true); setGeneratedKey(""); setNewKeyName(""); }} 
                  variant="outline" 
                  className="w-full h-11 rounded-xl font-bold border-slate-200 hover:bg-slate-50 text-slate-600 shadow-sm relative z-10"
                >
                  <Plus className="w-4 h-4 me-2" /> Add New Credential
                </Button>
             </div>
          </div>
        )}
      </div>

      {/* Explore Template Modal */}
      {selectedTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-white">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shadow-sm ${iconBgMap[selectedTemplate.icon] || iconBgMap.webhook}`}>
                  {iconMap[selectedTemplate.icon] || iconMap.webhook}
                </div>
                <div>
                  <h3 className="font-extrabold text-xl text-slate-800">{selectedTemplate.name}</h3>
                  <p className="text-sm text-slate-500 font-medium">{isRtl ? "نظرة عامة مرئية على سير العمل" : "Visual Workflow Overview"}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedTemplate(null)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
               aria-label="Close">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-0 bg-slate-50 h-[500px]">
              <WorkflowCanvas template={selectedTemplate} />
            </div>

            <div className="px-8 py-5 border-t border-slate-100 bg-white flex justify-end gap-4 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)] relative z-10">
              <Button 
                onClick={() => setSelectedTemplate(null)}
                variant="ghost" 
                className="text-slate-600 hover:bg-slate-100 font-bold px-6"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  setSelectedTemplate(null);
                }}
                disabled={selectedTemplate.status === "active"}
                className={`flex items-center gap-2 font-bold px-8 shadow-lg ${
                  selectedTemplate.status === "active" 
                    ? "bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-none" 
                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                }`}
              >
                <Play className="w-4 h-4" />
                {selectedTemplate.status === "active" ? "Already Active" : "Deploy Flow Now"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Webhook Modal */}
      {showAddWebhook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-extrabold text-xl text-slate-800 flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-indigo-600" /> {isRtl ? "إنشاء ويب هوك جديد" : "Create New Webhook"}
              </h3>
              <button onClick={() => setShowAddWebhook(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">{isRtl ? "الرابط الهدف" : "Target URL"}</label>
                <input 
                  type="text" 
                  className="w-full p-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand" 
                  placeholder={isRtl ? "https://your-domain.com/webhook-callback" : "https://your-domain.com/webhook-callback"} 
                  value={newHookUrl} 
                  onChange={e => setNewHookUrl(e.target.value)} 
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">{isRtl ? "الأحداث المشترَك بها" : "Subscribed Events"}</label>
                <input 
                  type="text" 
                  className="w-full p-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand" 
                  placeholder={isRtl ? "all، ticket.created، entity.updated" : "all, ticket.created, entity.updated"} 
                  value={newHookEvents} 
                  onChange={e => setNewHookEvents(e.target.value)} 
                />
                <p className="text-xs text-slate-400 mt-1">{isRtl ? "استخدم «all» أو أسماء أحداث مفصولة بفواصل." : "Use \"all\" or comma-separated event names."}</p>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">{isRtl ? "مفتاح HMAC السري (اختياري)" : "HMAC Secret (Optional)"}</label>
                <input 
                  type="password" 
                  className="w-full p-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand" 
                  placeholder={isRtl ? "مفتاح سري لتوقيع الحمولة" : "Secret key to sign payload"} 
                  value={newHookSecret} 
                  onChange={e => setNewHookSecret(e.target.value)} 
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setShowAddWebhook(false)} className="font-bold">{isRtl ? "إلغاء" : "Cancel"}</Button>
              <Button onClick={handleAddWebhook} className="bg-brand hover:bg-brand/90 text-white font-bold px-6 rounded-xl shadow-md">
                {isRtl ? "حفظ الويب هوك" : "Save Webhook"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create API Key Modal */}
      {showAddApiKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden p-6 animate-in fade-in zoom-in-95 duration-200">
            {!generatedKey ? (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-extrabold text-xl text-slate-800 flex items-center gap-2">
                    <Key className="w-5 h-5 text-rose-600" /> {isRtl ? "توليد بيانات اعتماد API جديدة" : "Generate New API Credential"}
                  </h3>
                  <button onClick={() => setShowAddApiKey(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full" aria-label="Close">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-4 mb-6">
                  <div>
                    <label htmlFor="apiKeyNameInput" className="block text-sm font-bold text-slate-700 mb-1">{isRtl ? "اسم بيانات الاعتماد" : "Credential Name"}</label>
                    <input 
                      id="apiKeyNameInput"
                      type="text" 
                      className="w-full p-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand" 
                      placeholder={isRtl ? "مثال: تكامل نظام ERP" : "e.g., ERP System Integration"} 
                      value={newKeyName} 
                      onChange={e => setNewKeyName(e.target.value)} 
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="ghost" onClick={() => setShowAddApiKey(false)} className="font-bold">{isRtl ? "إلغاء" : "Cancel"}</Button>
                  <Button onClick={handleAddApiKey} disabled={!newKeyName.trim()} className="bg-brand hover:bg-brand-dark text-white font-bold px-6 rounded-xl shadow-md">
                    {isRtl ? "توليد المفتاح" : "Generate Key"}
                  </Button>
                </div>
              </>
            ) : (
              <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-extrabold text-lg text-emerald-800 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-600" /> {isRtl ? "تم توليد المفتاح بنجاح!" : "Key Generated Successfully!"}
                  </h3>
                </div>
                <p className="text-xs text-emerald-700 mb-4 leading-relaxed font-medium">
                  {isRtl ? <>يرجى نسخ مفتاح API الجديد فوراً وتخزينه في مدير كلمات مرور آمن. لأسباب أمنية، <strong>لن يُعرض مرة أخرى أبداً</strong>.</> : <>Please copy your new API key immediately and store it in a secure password manager. For security reasons, <strong>it will never be displayed again</strong>.</>}
                </p>
                <div className="flex items-center gap-2 mb-6">
                  <input 
                    aria-label="Generated API Key"
                    type="text" 
                    readOnly 
                    value={generatedKey} 
                    className="flex-1 p-3 bg-white border border-emerald-300 rounded-xl font-mono text-xs font-bold text-slate-800 select-all focus:outline-none"
                  />
                  <Button 
                    onClick={handleCopyKey} 
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 px-4 rounded-xl shrink-0 gap-1"
                  >
                    {copiedKey ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedKey ? (isRtl ? 'تم النسخ' : 'Copied') : (isRtl ? 'نسخ المفتاح' : 'Copy Key')}
                  </Button>
                </div>
                <div className="flex justify-end">
                  <Button 
                    onClick={() => { setShowAddApiKey(false); setGeneratedKey(""); }} 
                    className="bg-brand hover:bg-brand-dark text-white font-bold px-6 rounded-xl shadow-md"
                  >
                    {isRtl ? "تم والإغلاق" : "Done & Close"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
