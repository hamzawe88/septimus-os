"use client";

import React, { useEffect, useCallback } from "react";

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
import DriveView from "@/components/drive/DriveView";
import SettingsLayout from "@/components/settings/SettingsLayout";
import LiquidDashboard from "@/components/dashboard/LiquidDashboard";
import PmDashboard from "@/components/pm/PmDashboard";
import PmAnalytics from "@/components/pm/PmAnalytics";
import PmPlanning from "@/components/pm/PmPlanning";
import ProjectScopeBar from "@/components/pm/ProjectScopeBar";
import CrmPage from "./crm/page";
import HrPage from "./hr/page";
import FinancePage from "./finance/page";
import MeetingsPage from "./meetings/page";
import MyLeavePage from "./me/leave/page";
import MyPayslipsPage from "./me/payslips/page";
import MyProfilePage from "./me/profile/page";
import MyPerformancePage from "./me/performance/page";
import { useAppStore } from "@/store/useAppStore";
import { usePmStore } from "@/store/usePmStore";
import { useKnowledgeStore } from "@/store/useKnowledgeStore";
import { useAutomationStore } from "@/store/useAutomationStore";
import ThreadsListSidebar from "@/components/chat/ThreadsListSidebar";
import FullPageChat from "@/components/chat/FullPageChat";
import AppStoreHub from "@/components/plugins/AppStoreHub";
import MyOrbitPage from "@/components/orbit/MyOrbitPage";
import { CorrespondenceView } from "@/components/correspondence/CorrespondenceView";
import ImpersonationBanner from "@/components/layout/ImpersonationBanner";

import { fetchWithAuth, API_BASE_URL, WS_URL } from "@/lib/apiClient";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { useLocalization } from "@/contexts/LocalizationContext";

// ─── Root Component ──────────────────────────────────────────────────────────

export default function Home() {
  const { t } = useLocalization();
  const {
    isAuthLoading, setIsAuthLoading,
    isLoggedIn, setIsLoggedIn,
    setIsImpersonated, setOriginalAdminId,
    activeChannelId, setActiveChannelId,
    activeDmId,
    setChannels,
    setMessages,
    setOnlineUsers,
    isEntityModalOpen, setIsEntityModalOpen,
    setCentrifuge,
    currentView,
    setIsRagSidebarOpen,
    isSidebarOpen,
    setHasMoreMessages,
    setMessageCursor,
    projectId
  } = useAppStore();

  const { activeTab: pmTab } = usePmStore();
  const { activeTab: knowledgeTab } = useKnowledgeStore();
  const { activeTab: automationTab } = useAutomationStore();

  // Auth hydration uses the backend's HttpOnly session cookie. No bearer token
  // is stored in localStorage or a script-readable cookie.
  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      try {
        const response = await fetchWithAuth(`${API_BASE_URL}/auth/session`);
        if (!active) return;
        if (!response.ok) {
          setIsLoggedIn(false);
          return;
        }
        const data = await response.json();
        const user = data.user || {};
        setIsLoggedIn(true);
        if (user.workspace_id) localStorage.setItem("currentWorkspaceId", user.workspace_id);
        if (user.is_impersonated) {
          setIsImpersonated(true);
          setOriginalAdminId(user.original_admin_id || null);
        }
      } catch {
        if (active) setIsLoggedIn(false);
      } finally {
        if (active) setIsAuthLoading(false);
      }
    };
    void hydrate();
    return () => { active = false; };
  }, [setIsLoggedIn, setIsAuthLoading, setIsImpersonated, setOriginalAdminId]);

  // Initialize channels and WS connection
  useEffect(() => {
    if (!isLoggedIn) return;

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
        if (channelsData && channelsData.length > 0 && !useAppStore.getState().activeChannelId) {
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
    const handleToggleRag = () => {
      // Proper toggle: open if closed, close if open
      // Also clear activeThread so RAG view takes priority
      const { isRagSidebarOpen: currentOpen, setActiveThread } = useAppStore.getState();
      if (currentOpen) {
        setIsRagSidebarOpen(false);
      } else {
        setActiveThread(null); // Clear thread so RAG view shows
        setIsRagSidebarOpen(true);
      }
    };
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

  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-[var(--radius-surface)] bg-brand text-2xl font-bold text-brand-foreground">
            S
          </div>
          <p className="font-medium text-muted-foreground">{t("common.checkingSession")}</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginScreen onLogin={() => setIsLoggedIn(true)} />;
  }

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden">
      <ImpersonationBanner />
      {/* ── Top Bar ── */}
      <TopBar />

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden bg-[var(--bg-primary)]">
        {isSidebarOpen && <Sidebar />}
        <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-primary)] relative">
        {currentView === "chat" || currentView === "dm" ? (
          <FullPageChat />
        ) : currentView === "dashboard" ? (
          <div className="flex-1 overflow-auto bg-background">
            <ErrorBoundary name="Liquid Dashboard">
              <LiquidDashboard />
            </ErrorBoundary>
          </div>
        ) : currentView === "pm" ? (
          <div className="flex min-h-0 flex-1 flex-col bg-background">
            <ProjectScopeBar />
            {pmTab === "dashboard" ? (
            <div className="min-h-0 flex-1 overflow-auto bg-background">
              <ErrorBoundary name="PM Dashboard">
                <PmDashboard />
              </ErrorBoundary>
            </div>
          ) : pmTab === "kanban" ? (
            <div className="min-h-0 flex-1 overflow-auto bg-background">
              <ErrorBoundary name="Kanban Board">
                <KanbanBoard />
              </ErrorBoundary>
            </div>
          ) : pmTab === "backlog" ? (
            <div className="min-h-0 flex-1 overflow-auto bg-background">
              <ErrorBoundary name="Backlog & Sprints">
                <BacklogView />
              </ErrorBoundary>
            </div>
          ) : pmTab === "table" ? (
            <div className="min-h-0 flex-1 overflow-hidden bg-background">
              <ErrorBoundary name="Dynamic Board">
                <DynamicBoard />
              </ErrorBoundary>
            </div>
          ) : pmTab === "analytics" ? (
            <div className="min-h-0 flex-1 overflow-hidden bg-background">
              <ErrorBoundary name="PM Analytics">
                <PmAnalytics />
              </ErrorBoundary>
            </div>
          ) : pmTab === "planning" ? (
            <div className="min-h-0 flex-1 overflow-hidden bg-background">
              <ErrorBoundary name="PM Planning">
                <PmPlanning />
              </ErrorBoundary>
            </div>
          ) : pmTab === "reports" ? (
            <div className="min-h-0 flex-1 overflow-hidden bg-background">
              <ReportsCenter />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center overflow-hidden bg-background text-muted-foreground">
              {t("common.selectSidebarItem")}
            </div>
          )}
          </div>
        ) : currentView === "knowledge" ? (
          knowledgeTab === "workdocs" ? (
            <div className="flex-1 overflow-hidden bg-card flex">
              <WorkDocsView projectId={projectId || undefined} />
            </div>
          ) : knowledgeTab === "knowledge_base" ? (
            <div className="flex-1 overflow-hidden bg-card flex">
              <KnowledgeBase />
            </div>
          ) : knowledgeTab === "drive" ? (
            <div className="flex-1 overflow-auto bg-[var(--bg-primary)]">
              <ErrorBoundary name="Septimus Drive">
                <DriveView />
              </ErrorBoundary>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden bg-card flex items-center justify-center text-muted-foreground">
              Select an item from the sidebar
            </div>
          )
        ) : currentView === "automation" ? (
          automationTab === "workflows" ? (
            <div className="flex-1 overflow-hidden bg-card">
              <WorkflowBuilder />
            </div>
          ) : automationTab === "automations" ? (
            <div className="flex-1 overflow-hidden bg-card">
              <AutomationsView />
            </div>
          ) : automationTab === "entity_creator" ? (
            <div className="flex-1 overflow-hidden bg-card">
              <EntityCreator />
            </div>
          ) : (
            <div className="flex-1 overflow-hidden bg-card flex items-center justify-center text-muted-foreground">
              Select an item from the sidebar
            </div>
          )
        ) : currentView === "orchestrator" ? (
          <div className="flex-1 overflow-hidden bg-background flex flex-col min-h-0">
            <AgentOrchestrator />
          </div>
        ) : currentView === "admin_dashboard" ? (
          <div className="flex-1 overflow-hidden bg-card">
            <AdminDashboard />
          </div>

        ) : ['system_settings', 'saas_settings', 'roles_settings', 'webhooks_settings', 'apikeys_settings', 'appearance_settings', 'localization_settings', 'company_profile'].includes(currentView) ? (
          <div className="flex-1 overflow-hidden bg-card">
            <SettingsLayout />
          </div>
        ) : currentView === "crm" ? (
          <div className="flex-1 overflow-hidden bg-card">
            <CrmPage />
          </div>
        ) : currentView === "hr" ? (
          <div className="flex-1 overflow-hidden bg-card">
            <HrPage />
          </div>
        ) : currentView === "finance" ? (
          <div className="flex-1 overflow-hidden bg-card">
            <FinancePage />
          </div>
        ) : currentView === "plugins" ? (
          <AppStoreHub />
        ) : currentView === "correspondence" ? (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-muted dark:bg-slate-950">
            <CorrespondenceView />
          </div>
        ) : currentView === "orbit" ? (
          <div className="flex-1 overflow-hidden bg-slate-950">
            <ErrorBoundary name="My Orbit">
              <MyOrbitPage />
            </ErrorBoundary>
          </div>
        ) : currentView === "meetings" ? (
          <div className="flex-1 overflow-hidden bg-muted dark:bg-slate-950">
            <ErrorBoundary name="Meetings">
              <MeetingsPage />
            </ErrorBoundary>
          </div>
        ) : currentView === "my_leave" ? (
          <div className="flex-1 overflow-hidden bg-card"><MyLeavePage /></div>
        ) : currentView === "my_payslips" ? (
          <div className="flex-1 overflow-hidden bg-card"><MyPayslipsPage /></div>
        ) : currentView === "my_profile" ? (
          <div className="flex-1 overflow-hidden bg-card"><MyProfilePage /></div>
        ) : currentView === "my_performance" ? (
          <div className="flex-1 overflow-hidden bg-card"><MyPerformancePage /></div>
        ) : (
          <div className="flex-1 overflow-hidden bg-card flex items-center justify-center text-muted-foreground">
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
