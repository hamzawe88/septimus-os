"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, Activity, Cpu, ShieldAlert, Play, Square, Settings2 } from "lucide-react";
import { apiGet, apiPut } from "@/lib/apiClient";
import DeployAgentModal from "./DeployAgentModal";
import { useLocalization } from "@/contexts/LocalizationContext";

interface AgentEntityData {
  status?: string;
  name?: string;
  uptime?: string;
  tasks?: number;
}

interface AgentEntity {
  id: string;
  data?: AgentEntityData;
}

export default function AIOrchestratorView() {
  const { isRtl } = useLocalization();
  const [agents, setAgents] = useState<AgentEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);

  const fetchAgents = async () => {
    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      const res = await apiGet<{data: AgentEntity[]}>(`/entities?workspace_id=${workspaceId}&type=ai_agent`);
      if (res.data) {
        setAgents(res.data);
      }
    } catch (error) {
      console.error("Failed to fetch agents:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
    apiGet<{data: AgentEntity[]}>(`/entities?workspace_id=${workspaceId}&type=ai_agent`)
      .then((res) => {
        if (!cancelled && res.data) setAgents(res.data);
      })
      .catch((error) => console.error("Failed to fetch agents:", error))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStopAgent = async (agentId: string) => {
    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      await apiPut(`/entities/${agentId}?workspace_id=${workspaceId}`, {
        data: { status: "Idle" }
      });
      fetchAgents();
    } catch (error) {
      console.error("Failed to stop agent:", error);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-muted dark:bg-[#1a1d21] p-8 overflow-y-auto transition-colors">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 pb-6 border-b border-border dark:border-slate-800 gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-brand/10 dark:bg-brand/20 rounded-xl">
            <Sparkles className="w-8 h-8 text-brand" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground dark:text-white tracking-tight flex items-center gap-2">
              {isRtl ? "مركز الذكاء الاصطناعي" : "AI Center"} 
              <span dir="ltr" className="text-muted-foreground font-normal text-lg">(AI Orchestrator)</span>
            </h1>
            <p className="text-muted-foreground dark:text-muted-foreground mt-1">
              {isRtl ? "إدارة، مراقبة، ونشر الوكلاء المستقلين في مساحة العمل." : "Manage, monitor, and deploy autonomous agents in the workspace."}
            </p>
          </div>
        </div>
        <button 
          onClick={() => setIsDeployModalOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand hover:bg-brand/90 text-white rounded-xl font-bold transition-all shadow-[0_0_15px_rgba(var(--brand-rgb),0.2)] hover:shadow-[0_0_25px_rgba(var(--brand-rgb),0.4)]"
        >
          <Play className="w-4 h-4 fill-current" />
          {isRtl ? "نشر وكيل جديد" : "Deploy Agent"}
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        <div className="p-6 bg-card dark:bg-[#222529] border border-border dark:border-slate-800 rounded-2xl shadow-sm group hover:border-brand/50 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-muted-foreground dark:text-muted-foreground">Active Agents</span>
            <div className="p-2 bg-brand/10 rounded-lg group-hover:scale-110 transition-transform">
              <Cpu className="w-5 h-5 text-brand" />
            </div>
          </div>
          <div className="text-3xl font-black text-foreground dark:text-white font-mono">{agents.filter(a => a.data?.status === 'Running').length}</div>
        </div>

        <div className="p-6 bg-card dark:bg-[#222529] border border-border dark:border-slate-800 rounded-2xl shadow-sm group hover:border-emerald-500/50 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-muted-foreground dark:text-muted-foreground">Tasks Executed (24h)</span>
            <div className="p-2 bg-emerald-500/10 rounded-lg group-hover:scale-110 transition-transform">
              <Activity className="w-5 h-5 text-emerald-500" />
            </div>
          </div>
          <div className="text-3xl font-black text-foreground dark:text-white font-mono">14</div>
        </div>

        <div className="p-6 bg-card dark:bg-[#222529] border border-border dark:border-slate-800 rounded-2xl shadow-sm group hover:border-rose-500/50 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-muted-foreground dark:text-muted-foreground">{isRtl ? "الأخطاء" : "Errors"}</span>
            <div className="p-2 bg-rose-500/10 rounded-lg group-hover:scale-110 transition-transform">
              <ShieldAlert className="w-5 h-5 text-rose-500" />
            </div>
          </div>
          <div className="text-3xl font-black text-foreground dark:text-white font-mono">0</div>
        </div>

        <div className="p-6 bg-card dark:bg-[#222529] border border-border dark:border-slate-800 rounded-2xl shadow-sm group hover:border-amber-500/50 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-muted-foreground dark:text-muted-foreground">{isRtl ? "استهلاك الحوسبة" : "Compute Usage"}</span>
            <div className="p-2 bg-amber-500/10 rounded-lg group-hover:scale-110 transition-transform">
              <Sparkles className="w-5 h-5 text-amber-500" />
            </div>
          </div>
          <div dir="ltr" className="text-3xl font-black text-foreground dark:text-white font-mono text-end rtl:text-start">4.2M <span className="text-sm text-muted-foreground">tokens</span></div>
        </div>
      </div>

      {/* Active Agents Table */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-foreground dark:text-white flex items-center gap-2">
          {isRtl ? "قائمة الوكلاء" : "Agent List"}
          <span dir="ltr" className="text-sm font-normal text-muted-foreground">(Deployed Agents)</span>
        </h2>
      </div>
      
      <div className="bg-card dark:bg-[#222529] border border-border dark:border-slate-800 rounded-2xl overflow-hidden mb-8 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="bg-muted dark:bg-slate-800/50 border-b border-border dark:border-slate-800">
              <tr>
                <th className="px-6 py-4 font-bold text-muted-foreground dark:text-slate-300 text-start rtl:text-end">{isRtl ? "الوكيل" : "Agent"}</th>
                <th className="px-6 py-4 font-bold text-muted-foreground dark:text-slate-300 text-start rtl:text-end">{isRtl ? "الحالة" : "Status"}</th>
                <th className="px-6 py-4 font-bold text-muted-foreground dark:text-slate-300 text-start rtl:text-end">{isRtl ? "مدة التشغيل" : "Uptime"}</th>
                <th className="px-6 py-4 font-bold text-muted-foreground dark:text-slate-300 text-start rtl:text-end">{isRtl ? "المهام النشطة" : "Active Tasks"}</th>
                <th className="px-6 py-4 font-bold text-muted-foreground dark:text-slate-300 text-end rtl:text-start">{isRtl ? "الإجراءات" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-slate-800">
              {agents.map((agent) => {
                const data = agent.data || {};
                const status = data.status || "Idle";
                const name = data.name || "Unknown Agent";
                const uptime = data.uptime || "0m";
                const tasks = data.tasks || 0;
                
                return (
                  <tr key={agent.id} className="hover:bg-muted dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-foreground dark:text-white flex items-center gap-3">
                      <BotAvatar name={name} />
                      <span dir="ltr">{name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
                        status === "Running" 
                          ? "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" 
                          : "bg-muted dark:bg-slate-800 text-foreground dark:text-slate-300"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${status === "Running" ? "bg-emerald-500" : "bg-slate-400"}`} />
                        <span dir="ltr">{status}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground dark:text-muted-foreground font-mono" dir="ltr">{uptime}</td>
                    <td className="px-6 py-4 text-foreground dark:text-white font-mono">{tasks}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => alert(isRtl ? `إعدادات الوكيل ${name} ستتوفر في المرحلة القادمة.` : `Settings for agent ${name} will be available in the next phase.`)}
                          className="p-2 text-muted-foreground hover:text-brand hover:bg-brand/10 rounded-lg transition-colors" 
                          title={isRtl ? "الإعدادات" : "Settings"}
                        >
                          <Settings2 className="w-5 h-5" />
                        </button>
                        {status === "Running" && (
                          <button 
                            onClick={() => handleStopAgent(agent.id)}
                            className="p-2 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors" 
                            title={isRtl ? "إيقاف" : "Stop"}
                          >
                            <Square className="w-5 h-5 fill-current" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {agents.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground dark:text-muted-foreground">
                      <div className="w-16 h-16 bg-muted dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                        <Sparkles className="w-8 h-8 text-slate-300 dark:text-muted-foreground" />
                      </div>
                      <p className="text-base font-bold text-muted-foreground dark:text-muted-foreground">{isRtl ? "لا يوجد وكلاء حالياً" : "No agents available"}</p>
                      <p className="text-sm mt-1">{isRtl ? "انقر على \"نشر وكيل جديد\" للبدء في مساحة العمل." : "Click on \"Deploy Agent\" to get started in the workspace."}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DeployAgentModal 
        isOpen={isDeployModalOpen}
        onClose={() => setIsDeployModalOpen(false)}
        onDeployed={() => {
          setIsDeployModalOpen(false);
          fetchAgents();
        }}
      />
    </div>
  );
}

function BotAvatar({ name }: { name: string }) {
  return (
    <div className="w-10 h-10 rounded-xl bg-brand/10 dark:bg-brand/20 border border-brand/20 flex items-center justify-center text-brand font-black text-sm shadow-sm">
      <span dir="ltr">{name.substring(0, 2).toUpperCase()}</span>
    </div>
  );
}
