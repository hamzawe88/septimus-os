"use client";

import React, { useEffect, useRef, useCallback } from "react";

import LoginScreen from "@/components/shared/LoginScreen";
import TopBar from "@/components/layout/TopBar";
import Sidebar from "@/components/layout/Sidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import EntityCreatorModal from "@/components/shared/EntityCreatorModal";
import CommandMenu from "@/components/shared/CommandMenu";
import KanbanBoard from "@/components/pm/KanbanBoard";
import { Centrifuge } from "centrifuge";
import BacklogView from "@/components/pm/BacklogView";
import DynamicBoard from "@/components/pm/DynamicBoard";
import EntityCreator from "@/components/entities/EntityCreator";

import WorkflowBuilder from "@/components/workflows/WorkflowBuilder";
import { AgentOrchestrator } from "@/components/agents/AgentOrchestrator";
import WorkDocsView from "@/components/workdocs/WorkDocsView";
import ReportsCenter from "@/components/reports/ReportsCenter";
import AutomationsView from "@/components/automations/AutomationsView";
import KnowledgeBase from "@/components/workdocs/KnowledgeBase";
import AdminDashboard from "@/components/admin/AdminDashboard";
import AuditLogsView from "@/components/admin/AuditLogsView";
import SettingsLayout from "@/components/settings/SettingsLayout";
import LiquidDashboard from "@/components/dashboard/LiquidDashboard";
import CrmPage from "./crm/page";
import HrPage from "./hr/page";
import FinancePage from "./finance/page";
import { useAppStore } from "@/store/useAppStore";
import ThreadsListSidebar from "@/components/chat/ThreadsListSidebar";
import FullPageChat from "@/components/chat/FullPageChat";
import AppStoreHub from "@/components/plugins/AppStoreHub";
import MyOrbitPage from "@/components/orbit/MyOrbitPage";
import { CorrespondenceView } from "@/components/correspondence/CorrespondenceView";

import { fetchWithAuth, API_BASE_URL, WS_URL } from "@/lib/apiClient";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

// ─── Root Component ──────────────────────────────────────────────────────────

export default function Home() {
  const {
    isLoggedIn, setIsLoggedIn,
    activeChannelId, setActiveChannelId,
    activeDmId,
    setChannels,
    messages, setMessages,
    setOnlineUsers,
    isEntityModalOpen, setIsEntityModalOpen,
    setCentrifuge,
    currentView,
    setIsRagSidebarOpen,
    isSidebarOpen,
    setHasMoreMessages,
    setMessageCursor
  } = useAppStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize channels and WS connection
  useEffect(() => {
    if (!isLoggedIn) return;
    const token = localStorage.getItem("septimus_token");
    if (!token) return;

    const savedUserStr = localStorage.getItem("septimus_user");
    const savedAvatar = localStorage.getItem("septimus_avatar");
    const savedName = localStorage.getItem("septimus_display_name");
    if (savedUserStr || savedAvatar || savedName) {
      try {
        const parsed = savedUserStr ? JSON.parse(savedUserStr) : {};
        const { currentUser, setCurrentUser } = useAppStore.getState();
        setCurrentUser({
          ...parsed,
          id: parsed.id || currentUser?.id || "current-user",
          name: savedName || parsed.name || currentUser?.name || "Admin",
          email: parsed.email || currentUser?.email || "admin@septimus.local",
          avatarUrl: savedAvatar || parsed.avatarUrl || currentUser?.avatarUrl,
        } as unknown as Parameters<typeof setCurrentUser>[0]);
      } catch { }
    }

    // Fetch channels to get the first one active
    fetchWithAuth(`${API_BASE_URL}/channels`)
      .then(res => res.json())
      .then(data => {
        const channelsData = Array.isArray(data) ? data : [];
        setChannels(channelsData);
        if (channelsData && channelsData.length > 0 && !activeChannelId) {
          setActiveChannelId(channelsData[0].id || channelsData[0].ID);
        }
      });

    // Setup Centrifugo
    let centrifugeInstance: Centrifuge;
    
    const fetchConnectionToken = async (): Promise<string> => {
      const tokenRes = await fetchWithAuth(`${API_BASE_URL}/chat/token`);
      const { token: cToken } = await tokenRes.json();
      return cToken;
    };

    const initCentrifuge = async () => {
      try {
        const cToken = await fetchConnectionToken();

        centrifugeInstance = new Centrifuge(WS_URL, {
          token: cToken,
          // Connection tokens expire after 5 minutes; Centrifugo calls this
          // to transparently refresh the token and keep the socket alive
          getToken: fetchConnectionToken
        });
        
        centrifugeInstance.on('publication', (ctx) => {
          const msg = ctx.data;
          window.dispatchEvent(new CustomEvent('ws-message', { detail: msg }));
        });


        // Global Presence events can be handled by subscribing to a global channel or relying on join/leave
        centrifugeInstance.on('join', (ctx) => {
          if(ctx.info?.user) setOnlineUsers((prev: Record<string, boolean>) => ({ ...prev, [ctx.info.user]: true }));
        });
        centrifugeInstance.on('leave', (ctx) => {
          if(ctx.info?.user) setOnlineUsers((prev: Record<string, boolean>) => ({ ...prev, [ctx.info.user]: false }));
        });

        centrifugeInstance.connect();
        setTimeout(() => setCentrifuge(centrifugeInstance), 0);

      } catch (e) {
        console.error("Centrifugo connect error:", e);
      }
    };
    initCentrifuge();

    // Setup custom event listener for RAG sidebar toggle
    const handleToggleRag = () => setIsRagSidebarOpen(true);
    window.addEventListener('toggle-rag-sidebar', handleToggleRag);

    return () => {
      if (centrifugeInstance) centrifugeInstance.disconnect();
      window.removeEventListener('toggle-rag-sidebar', handleToggleRag);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  const fetchInitialMessages = useCallback(async (targetId: string) => {
    try {
      const endpoint = `${API_BASE_URL}/channels/${targetId}/messages`;
      const res = await fetchWithAuth(`${endpoint}?limit=20`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setHasMoreMessages(data.has_more);
        setMessageCursor(data.next_cursor);
      }
    } catch (err) {
      console.error("Failed to fetch messages", err);
    }
  }, [setMessages, setHasMoreMessages, setMessageCursor]);

  useEffect(() => {
    if (currentView === 'chat' && activeChannelId) {
      fetchInitialMessages(activeChannelId);
    } else if (currentView === 'dm' && activeDmId) {
      fetchInitialMessages(activeDmId);
    }
  }, [activeChannelId, activeDmId, currentView, fetchInitialMessages]);

  if (!isLoggedIn) {
    return <LoginScreen onLogin={() => setIsLoggedIn(true)} />;
  }

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden">
      {/* ── Top Bar ── */}
      <TopBar />

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden bg-[var(--bg-primary)]">
        {isSidebarOpen && <Sidebar />}
        <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-primary)] relative">
        {currentView === "chat" || currentView === "dm" ? (
          <FullPageChat />
        ) : currentView === "dashboard" ? (
          <div className="flex-1 overflow-auto bg-white">
            <ErrorBoundary name="Liquid Dashboard">
              <LiquidDashboard />
            </ErrorBoundary>
          </div>
        ) : currentView === "kanban" ? (
          <div className="flex-1 overflow-auto bg-white">
            <ErrorBoundary name="Kanban Board">
              <KanbanBoard />
            </ErrorBoundary>
          </div>
        ) : currentView === "backlog" ? (
          <div className="flex-1 overflow-auto bg-white">
            <ErrorBoundary name="Backlog & Sprints">
              <BacklogView />
            </ErrorBoundary>
          </div>
        ) : currentView === "table" ? (
          <div className="flex-1 overflow-hidden bg-white">
            <ErrorBoundary name="Dynamic Board">
              <DynamicBoard />
            </ErrorBoundary>
          </div>
        ) : currentView === "entity_creator" ? (
          <div className="flex-1 overflow-hidden bg-white">
            <EntityCreator />
          </div>
        ) : currentView === "workdocs" ? (
          <div className="flex-1 overflow-hidden bg-white flex">
            <WorkDocsView projectId="5bf90680-cf33-44ae-851c-eef563e82920" />
          </div>
        ) : currentView === "knowledge_base" ? (
          <div className="flex-1 overflow-hidden bg-white flex">
            <KnowledgeBase />
          </div>
        ) : currentView === "orchestrator" ? (
          <div className="flex-1 overflow-hidden bg-[#f8fafc] flex flex-col min-h-0">
            <AgentOrchestrator />
          </div>
        ) : currentView === "admin_dashboard" ? (
          <div className="flex-1 overflow-hidden bg-white">
            <AdminDashboard />
          </div>
        ) : currentView === "audit_logs" ? (
          <div className="flex-1 overflow-hidden bg-white">
            <AuditLogsView />
          </div>
        ) : ['system_settings', 'saas_settings', 'roles_settings', 'webhooks_settings', 'apikeys_settings', 'appearance_settings', 'localization_settings', 'company_profile'].includes(currentView) ? (
          <div className="flex-1 overflow-hidden bg-white">
            <SettingsLayout />
          </div>
        ) : currentView === "reports" ? (
          <div className="flex-1 overflow-hidden bg-white ">
            <ReportsCenter />
          </div>
        ) : currentView === "automations" ? (
          <div className="flex-1 overflow-hidden bg-white">
            <AutomationsView />
          </div>
        ) : currentView === "crm" ? (
          <div className="flex-1 overflow-hidden bg-white">
            <CrmPage />
          </div>
        ) : currentView === "hr" ? (
          <div className="flex-1 overflow-hidden bg-white">
            <HrPage />
          </div>
        ) : currentView === "finance" ? (
          <div className="flex-1 overflow-hidden bg-white">
            <FinancePage />
          </div>
        ) : currentView === "workflows" ? (
          <div className="flex-1 overflow-hidden bg-white">
            <WorkflowBuilder />
          </div>
        ) : currentView === "plugins" ? (
          <AppStoreHub />
        ) : currentView === "correspondence" ? (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950">
            <CorrespondenceView />
          </div>
        ) : currentView === "orbit" ? (
          <div className="flex-1 overflow-hidden bg-slate-950">
            <ErrorBoundary name="My Orbit">
              <MyOrbitPage />
            </ErrorBoundary>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden bg-white flex items-center justify-center text-slate-400">
            Select an item from the sidebar
          </div>
        )}
        </div>

        {/* ── Right Sidebar ── */}
        <ThreadsListSidebar />
        <RightSidebar />
      </div>

      {/* ── Modals ── */}
      {isEntityModalOpen && (
        <EntityCreatorModal onClose={() => setIsEntityModalOpen(false)} />
      )}

      <CommandMenu />
    </div>
  );
}
