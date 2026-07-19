"use client";

import React, { useEffect, useState, useRef } from "react";
import { apiGet } from '@/lib/apiClient';
import { useAppStore } from "@/store/useAppStore";
import { useLocalization } from "@/contexts/LocalizationContext";
import Gated from "@/components/billing/Gated";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ChannelMembersModal from "../chat/ChannelMembersModal";
import ChannelSettingsModal from "../chat/ChannelSettingsModal";
import { 
  MessageSquare, 
  Hash, 
  Users, 
  Plus, 
  LayoutGrid,
  Zap,
  Lock, 
  Sparkles, 
  ChevronDown,
  ChevronRight,
  FileText,
  MoreVertical,
  Table,
  LayoutDashboard,
  ListTodo,
  Database,
  PieChart,
  Shield,
  Settings,
  CreditCard,
  Puzzle,
  Trash2,
  Orbit,
  FileSpreadsheet,
  Edit3,
  Archive
} from 'lucide-react';
import { useCorrespondenceStore } from "@/store/useCorrespondenceStore";
import type { Channel } from "@/types";

// ─── Sub-components ─────────────────────────────────────────────────────

function SidebarDivider() {
  return <div className="sidebar-divider" />;
}

function SidebarSection({
  label,
  children,
  onAdd,
  defaultExpanded = true,
}: {
  label: string;
  children: React.ReactNode;
  onAdd?: () => void;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-header group">
        <button 
          className="sidebar-section-label" 
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <ChevronDown 
            className={`sidebar-section-chevron transition-transform ${isExpanded ? "" : "-rotate-90"}`} 
          />
          {label}
        </button>
        {onAdd && (
          <button
            onClick={onAdd}
            className="sidebar-section-add"
            aria-label={`Add ${label}`}
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
      {isExpanded && <div className="sidebar-section-items">{children}</div>}
    </div>
  );
}

function ChannelItem({
  ch,
  isActive,
  onClick,
  onOpenSettings,
  onOpenMembers,
  onDelete,
}: {
  ch: Channel & { unread?: number };
  isActive: boolean;
  onClick: () => void;
  onOpenSettings?: () => void;
  onOpenMembers?: () => void;
  onDelete?: (id: string) => void;
}) {
  const { t } = useLocalization();
  const [showMenu, setShowMenu] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    if (!confirm(t("sidebar.confirmDeleteChannel"))) return;
    try {
      const { apiDelete } = await import('@/lib/apiClient');
      await apiDelete(`/channels/${ch.ID}`);
      onDelete?.(ch.ID);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(t("sidebar.deleteError") + msg);
    }
  };

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={`sidebar-item w-full ${isActive ? "active" : ""}`}
        aria-current={isActive ? "page" : undefined}
      >
        {ch.Type === "PRIVATE" ? (
          <Lock className="sidebar-item-icon" aria-hidden />
        ) : (
          <Hash className="sidebar-item-icon" aria-hidden />
        )}
        <span className={`sidebar-item-name flex-1 ${ch.unread ? "font-bold" : ""}`}>
          {ch.Name}
        </span>
        {ch.unread && (
          <span className="sidebar-badge" aria-label={`${ch.unread} unread messages`}>
            {ch.unread}
          </span>
        )}
      </button>

      <button
        className="absolute start-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 hover:text-white p-1 rounded hover:bg-white/10 transition-all"
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        title={t("sidebar.channelSettings")}
      >
        <MoreVertical size={16} />
      </button>

      {showMenu && (
        <div className="absolute start-0 top-10 bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1 w-40">
          <button 
            className="w-full text-start px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            onClick={(e) => { e.stopPropagation(); setShowMenu(false); onOpenSettings?.(); }}
          >
            {t("sidebar.channelSettings")}
          </button>
          <button 
            className="w-full text-start px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            onClick={(e) => { e.stopPropagation(); setShowMenu(false); onOpenMembers?.(); }}
          >
            {t("sidebar.membersAndPermissions")}
          </button>
          
          {!ch.IsSystem && (
            <button 
              className="w-full text-start px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 border-t border-gray-100 transition-colors"
              onClick={handleDelete}
            >
              {t("sidebar.deleteChannel")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DmItem({
  dm,
  isActive,
  onClick,
  onDelete,
}: {
  dm: Channel & { unread?: number };
  isActive: boolean;
  onClick: () => void;
  onDelete?: (id: string) => void;
}) {
  const { t } = useLocalization();
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t("sidebar.confirmDeleteDm"))) return;
    try {
      const { apiDelete } = await import('@/lib/apiClient');
      await apiDelete(`/channels/${dm.ID || dm.id}`);
      onDelete?.(dm.ID || dm.id || '');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(t("sidebar.deleteError") + msg);
    }
  };

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={`sidebar-item w-full ${isActive ? "active" : ""}`}
        aria-current={isActive ? "page" : undefined}
      >
        <div className="w-2 h-2 rounded-full bg-green-500 me-2 shrink-0" />
        <span className={`sidebar-item-name flex-1 text-start truncate ${dm.unread ? "font-bold" : ""}`}>
          {dm.Name || dm.name || t("sidebar.directMessageDefault")}
        </span>
        {dm.unread && (
          <span className="sidebar-badge" aria-label={`${dm.unread} unread messages`}>
            {dm.unread}
          </span>
        )}
      </button>

      <button
        className="absolute start-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 p-1 rounded hover:bg-white/10 transition-all"
        onClick={handleDelete}
        title={t("sidebar.deleteDm")}
        aria-label={t("sidebar.deleteDm")}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}



// ─── Main Sidebar ─────────────────────────────────────────────────────────



export default function Sidebar() {
  const { t, isRtl } = useLocalization();
  const { activeTab, setActiveTab } = useCorrespondenceStore();
  const { 
    activeChannelId, setActiveChannelId,
    activeDmId, setActiveDmId,
    channels, setChannels,
    currentView, setCurrentView,
    setIsNewChannelModalOpen,
    setIsNewDmModalOpen,
    userStatus, setUserStatus,
    customStatusText, setCustomStatusText
  } = useAppStore();

  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const [avatarUrl, setAvatarUrl] = useState("");

  const [isChannelMembersOpen, setIsChannelMembersOpen] = useState(false);
  const [isChannelSettingsOpen, setIsChannelSettingsOpen] = useState(false);
  const [selectedActionChannel, setSelectedActionChannel] = useState<Channel | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (statusMenuRef.current && !statusMenuRef.current.contains(event.target as Node)) {
        setIsStatusMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    
    // Load avatar
    setTimeout(() => {
      const savedAvatar = localStorage.getItem("septimus_avatar");
      if (savedAvatar) setAvatarUrl(savedAvatar);
    }, 0);
    
    // Listen for avatar updates
    const handleAvatarUpdate = () => {
      const newAvatar = localStorage.getItem("septimus_avatar");
      if (newAvatar) setAvatarUrl(newAvatar);
    };
    window.addEventListener("septimus_avatar_updated", handleAvatarUpdate);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("septimus_avatar_updated", handleAvatarUpdate);
    };
  }, []);

  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const data = await apiGet("/channels");
        setChannels(data as Channel[] || []);
      } catch (err) {
        console.error("Failed to fetch channels", err);
      }
    };
    fetchChannels();
  }, [setChannels]);

  const publicChannels = channels.filter(c => c.Type === "PUBLIC" || c.Type === "PRIVATE");
  const dms = channels.filter(c => c.Type === "DM");

  return (
    <aside className="sidebar animate-fade-in" aria-label="Navigation sidebar">
      <ScrollArea className="sidebar-scroll">


        {/* User Status */}
        <div className="relative mb-2" ref={statusMenuRef}>
          <div className="sidebar-user hover-scale-soft cursor-pointer hover:bg-white/5 transition-colors" onClick={() => setIsStatusMenuOpen(!isStatusMenuOpen)}>
            <div className="relative">
              <Avatar className="sidebar-user-avatar rounded-lg border border-slate-200 shadow-sm">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt="Hamza Admin" className="rounded-lg object-cover" />
                ) : null}
                <AvatarFallback className="bg-gradient-to-br from-[#2563EB] to-[#60A5FA] text-white font-bold text-sm rounded-lg shadow-inner">A</AvatarFallback>
              </Avatar>
              <span className={`sidebar-user-status ${userStatus === 'offline' ? '!bg-gray-400' : userStatus === 'away' ? '!bg-yellow-400' : userStatus === 'busy' ? '!bg-red-500' : '!bg-green-500'} !border-2 !border-white`} aria-label={userStatus} />
            </div>
            <div className="sidebar-user-info">
              <p className="sidebar-user-name">Hamza Admin</p>
              <p className="sidebar-user-sub capitalize truncate w-[100px]">{customStatusText || (userStatus === 'online' ? 'Active' : userStatus === 'busy' ? 'In a meeting' : userStatus)}</p>
            </div>
            <ChevronRight className={`sidebar-user-chevron transition-transform ${isStatusMenuOpen ? 'rotate-90' : ''}`} aria-hidden />
          </div>

          {/* Status Dropdown */}
          {isStatusMenuOpen && (
            <div className="absolute top-full start-0 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg z-50 overflow-hidden text-sm">
              <button 
                className="w-full text-start px-3 py-2 flex items-center gap-2 hover:bg-sb-hover transition-colors text-sb-text"
                onClick={() => { setUserStatus("online"); setIsStatusMenuOpen(false); }}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0"></span>
                Active
              </button>
              <button 
                className="w-full text-start px-3 py-2 flex items-center gap-2 hover:bg-sb-hover transition-colors text-sb-text"
                onClick={() => { setUserStatus("away"); setIsStatusMenuOpen(false); }}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0"></span>
                Away
              </button>
              <button 
                className="w-full text-start px-3 py-2 flex items-center gap-2 hover:bg-sb-hover transition-colors text-sb-text"
                onClick={() => { setUserStatus("busy"); setIsStatusMenuOpen(false); }}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0"></span>
                In a meeting
              </button>
              <button 
                className="w-full text-start px-3 py-2 flex items-center gap-2 hover:bg-sb-hover transition-colors text-sb-text"
                onClick={() => { setUserStatus("offline"); setIsStatusMenuOpen(false); }}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-gray-400 shrink-0"></span>
                Offline
              </button>
              <div className="border-t border-gray-200 p-2">
                <input 
                  type="text" 
                  placeholder="Set custom status..." 
                  className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[var(--brand)] bg-transparent text-sb-text placeholder-gray-400"
                  value={customStatusText}
                  onChange={(e) => setCustomStatusText(e.target.value)}
                  onKeyDown={(e) => {
                    if(e.key === 'Enter') {
                      setIsStatusMenuOpen(false);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 px-3 py-4 space-y-4">
        
        {/* === GLOBAL NAVIGATION === */}
        <SidebarSection label={t("sidebar.main")}>
          <button className={`sidebar-item ${currentView === 'dashboard' ? "active" : ""}`} onClick={() => setCurrentView('dashboard')}>
            <LayoutDashboard className="sidebar-item-icon" aria-hidden />
            <span className="sidebar-item-name">{t("sidebar.dashboard")}</span>
          </button>
          <button className={`sidebar-item ${currentView === 'orbit' ? "active" : ""}`} onClick={() => setCurrentView('orbit')}>
            <Orbit className="sidebar-item-icon" aria-hidden />
            <span className="sidebar-item-name">{t("my_orbit.title", "My Orbit")}</span>
          </button>
        </SidebarSection>
        
        <SidebarDivider />

        {/* === CHAT & MESSAGING CONTEXT === */}
        {(currentView === 'chat' || currentView === 'dm') && (
          <>
            <SidebarSection label={t("sidebar.channels")} onAdd={() => setIsNewChannelModalOpen(true)}>
              <button className={`sidebar-item ${currentView === 'chat' && activeChannelId === '' ? "active" : ""}`} onClick={() => setCurrentView('chat')}>
                <MessageSquare className="sidebar-item-icon" aria-hidden />
                <span className="sidebar-item-name">{t("sidebar.globalChat")}</span>
              </button>
              {publicChannels.map((ch) => (
                <ChannelItem
                  key={ch.ID}
                  ch={ch}
                  isActive={activeChannelId === ch.ID}
                  onClick={() => {
                    setActiveChannelId(ch.ID);
                    setCurrentView('chat');
                  }}
                  onOpenSettings={() => {
                    setSelectedActionChannel(ch);
                    setIsChannelSettingsOpen(true);
                  }}
                  onOpenMembers={() => {
                    setSelectedActionChannel(ch);
                    setIsChannelMembersOpen(true);
                  }}
                  onDelete={(id) => {
                    setChannels(channels.filter((c: Channel) => c.ID !== id));
                    if (activeChannelId === id) setActiveChannelId('');
                  }}
                />
              ))}
            </SidebarSection>
            
            <SidebarDivider />
            
            <SidebarSection label={t("sidebar.directMessages")} onAdd={() => setIsNewDmModalOpen(true)}>
              {dms.map((dm) => (
                <DmItem
                  key={dm.ID || dm.id || ''}
                  dm={dm}
                  isActive={currentView === 'dm' && activeDmId === (dm.ID || dm.id)}
                  onClick={() => {
                    setActiveDmId(dm.ID || dm.id || '');
                    setCurrentView('dm');
                  }}
                  onDelete={(id) => {
                    setChannels(channels.filter((c: Channel) => (c.ID || c.id) !== id));
                    if (activeDmId === id) setActiveDmId('');
                  }}
                />
              ))}
            </SidebarSection>
          </>
        )}

        {/* === DIWAN & CORRESPONDENCE CONTEXT === */}
        {(currentView === 'correspondence') && (
          <SidebarSection label={isRtl ? "إدارة الديوان والمراسلات" : "Official Diwan Module"}>
            <div className="space-y-1">
              <button 
                className={`sidebar-item ${activeTab === 'dashboard' ? "active" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`} 
                onClick={() => { setCurrentView('correspondence'); setActiveTab('dashboard'); }}
              >
                <LayoutDashboard className="sidebar-item-icon" aria-hidden />
                <span className="sidebar-item-name">{isRtl ? "لوحة القيادة السيادية" : "Diwan Dashboard & Stats"}</span>
              </button>
              <button 
                className={`sidebar-item ${activeTab === 'designer' ? "active" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`} 
                onClick={() => { setCurrentView('correspondence'); setActiveTab('designer'); }}
              >
                <FileSpreadsheet className="sidebar-item-icon" aria-hidden />
                <span className="sidebar-item-name">{isRtl ? "تصميم القوالب والهوية" : "Template & Brand Studio"}</span>
              </button>
              <button 
                className={`sidebar-item ${activeTab === 'editor' ? "active" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`} 
                onClick={() => { setCurrentView('correspondence'); setActiveTab('editor'); }}
              >
                <Edit3 className="sidebar-item-icon" aria-hidden />
                <span className="sidebar-item-name">{isRtl ? "صياغة وتحرير المراسلات" : "Correspondence Editor"}</span>
              </button>
              <button 
                className={`sidebar-item ${activeTab === 'archive' ? "active" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`} 
                onClick={() => { setCurrentView('correspondence'); setActiveTab('archive'); }}
              >
                <Archive className="sidebar-item-icon" aria-hidden />
                <span className="sidebar-item-name">{isRtl ? "الأرشيف ومسارات الإحالة" : "Smart Archive & Forwarding"}</span>
              </button>
            </div>
          </SidebarSection>
        )}

        {/* === CRM CONTEXT === */}
        {(currentView === 'crm') && (
          <SidebarSection label={t("sidebar.crm")}>
            <div className="space-y-1">
              <button className={`sidebar-item ${currentView === 'crm' ? "active" : "text-slate-500 hover:text-slate-800"}`} onClick={() => setCurrentView('crm')}>
                <Users className="sidebar-item-icon" aria-hidden />
                <span className="sidebar-item-name">{t("sidebar.leadsAndDeals")}</span>
              </button>
            </div>
          </SidebarSection>
        )}

        {/* === HR CONTEXT === */}
        {(currentView === 'hr') && (
          <SidebarSection label={t("sidebar.hr")}>
            <div className="space-y-1">
              <button className={`sidebar-item ${currentView === 'hr' ? "active" : "text-slate-500 hover:text-slate-800"}`} onClick={() => setCurrentView('hr')}>
                <Users className="sidebar-item-icon" aria-hidden />
                <span className="sidebar-item-name">{t("sidebar.employeeDirectory")}</span>
              </button>
            </div>
          </SidebarSection>
        )}

        {/* === FINANCE CONTEXT === */}
        {(currentView === 'finance') && (
          <SidebarSection label={t("sidebar.finance")}>
            <div className="space-y-1">
              <button className={`sidebar-item ${currentView === 'finance' ? "active" : "text-slate-500 hover:text-slate-800"}`} onClick={() => setCurrentView('finance')}>
                <CreditCard className="sidebar-item-icon" aria-hidden />
                <span className="sidebar-item-name">{t("sidebar.invoicesAndBilling")}</span>
              </button>
            </div>
          </SidebarSection>
        )}

        {/* === ADMIN CONTEXT === */}
        {(['admin_dashboard', 'roles_settings', 'audit_logs', 'appearance_settings', 'localization_settings', 'system_settings', 'saas_settings', 'integrations', 'plugins', 'orchestrator'].includes(currentView)) && (
          <>
            <SidebarSection label={t("sidebar.settings")}>
              <button className={`sidebar-item ${currentView === 'admin_dashboard' ? "active" : ""}`} onClick={() => setCurrentView('admin_dashboard')}>
                <Shield className="sidebar-item-icon" aria-hidden />
                <span className="sidebar-item-name">{t("sidebar.adminCenter")}</span>
              </button>
              <button className={`sidebar-item ${['system_settings', 'appearance_settings', 'localization_settings', 'roles_settings', 'company_profile'].includes(currentView) ? "active" : ""}`} onClick={() => setCurrentView('system_settings')}>
                <Settings className="sidebar-item-icon" aria-hidden />
                <span className="sidebar-item-name">{t("sidebar.systemSettings")}</span>
              </button>
              <button className={`sidebar-item ${currentView === 'saas_settings' ? "active text-brand font-bold" : ""}`} onClick={() => setCurrentView('saas_settings')}>
                <Sparkles className="sidebar-item-icon text-brand" aria-hidden />
                <span className="sidebar-item-name">{t("sidebar.saas", "اشتراك الـ SaaS والحصص")}</span>
              </button>
            </SidebarSection>
            
            <SidebarDivider />
            
            <SidebarSection label={t("sidebar.system")}>
              <button className={`sidebar-item ${currentView === 'audit_logs' ? "active" : ""}`} onClick={() => setCurrentView('audit_logs')}>
                <FileText className="sidebar-item-icon" aria-hidden />
                <span className="sidebar-item-name">{t("sidebar.auditLogs")}</span>
              </button>
              <button className={`sidebar-item ${currentView === 'plugins' ? "active" : ""}`} onClick={() => setCurrentView('plugins')}>
                <Puzzle className="sidebar-item-icon" aria-hidden />
                <span className="sidebar-item-name">{t("sidebar.plugins")}</span>
              </button>
            </SidebarSection>
            
            <SidebarDivider />
            
            <SidebarSection label={t("sidebar.aiAgents")}>
              <div className="space-y-1">
                <Gated feature="ai.agents" mode="lock">
                  <button className={`sidebar-item w-full ${currentView === 'orchestrator' ? "active" : "text-slate-500 hover:text-slate-800"}`} onClick={() => setCurrentView('orchestrator')}>
                    <Sparkles className="sidebar-item-icon" aria-hidden />
                    <span className="sidebar-item-name">{t("sidebar.aiCenter")}</span>
                  </button>
                </Gated>
              </div>
            </SidebarSection>
          </>
        )}

        {/* === AGILE / WORKFLOWS / ANALYTICS CONTEXT === */}
        {(['workflows', 'kanban', 'backlog', 'table', 'reports', 'automations', 'workdocs', 'knowledge_base', 'entity_creator', 'pm'].includes(currentView)) && (
          <>
            <SidebarSection label={t("sidebar.agile_pm")}>
              <div className="space-y-1">
                <button className={`sidebar-item ${currentView === 'kanban' ? "active" : "text-slate-500 hover:text-slate-800"}`} onClick={() => setCurrentView('kanban')}>
                  <LayoutGrid className="sidebar-item-icon" aria-hidden />
                  <span className="sidebar-item-name">{t("sidebar.kanban")}</span>
                </button>
                <button className={`sidebar-item ${currentView === 'backlog' ? "active" : "text-slate-500 hover:text-slate-800"}`} onClick={() => setCurrentView('backlog')}>
                  <ListTodo className="sidebar-item-icon" aria-hidden />
                  <span className="sidebar-item-name">{t("sidebar.backlog")}</span>
                </button>
                <button className={`sidebar-item ${currentView === 'table' ? "active" : "text-slate-500 hover:text-slate-800"}`} onClick={() => setCurrentView('table')}>
                  <Table className="sidebar-item-icon" aria-hidden />
                  <span className="sidebar-item-name">{t("sidebar.table")}</span>
                </button>
              </div>
            </SidebarSection>

            <SidebarDivider />

            <SidebarSection label={t("sidebar.analytics")}>
              <div className="space-y-1">
                <button className={`sidebar-item ${currentView === 'reports' ? "active" : "text-slate-500 hover:text-slate-800"}`} onClick={() => setCurrentView('reports')}>
                  <PieChart className="sidebar-item-icon" aria-hidden />
                  <span className="sidebar-item-name">{t("sidebar.reports_center")}</span>
                </button>
                <button className={`sidebar-item ${currentView === 'automations' ? "active" : "text-slate-500 hover:text-slate-800"}`} onClick={() => setCurrentView('automations')}>
                  <Zap className="sidebar-item-icon" aria-hidden />
                  <span className="sidebar-item-name">{t("sidebar.automations")}</span>
                </button>
              </div>
            </SidebarSection>

            <SidebarDivider />

            <SidebarSection label={t("sidebar.knowledgeBase")}>
              <div className="space-y-1">
                <button className={`sidebar-item ${currentView === 'workdocs' ? "active" : "text-slate-500 hover:text-slate-800"}`} onClick={() => setCurrentView('workdocs')}>
                  <FileText className="sidebar-item-icon" aria-hidden />
                  <span className="sidebar-item-name">{t("sidebar.workDocs")}</span>
                </button>
                <button className={`sidebar-item ${currentView === 'knowledge_base' ? "active" : "text-slate-500 hover:text-slate-800"}`} onClick={() => setCurrentView('knowledge_base')}>
                  <Database className="sidebar-item-icon" aria-hidden />
                  <span className="sidebar-item-name">{t("sidebar.knowledgeBase")}</span>
                </button>
              </div>
            </SidebarSection>

            <SidebarDivider />

            <SidebarSection label={t("sidebar.automationsAndData")}>
              <div className="space-y-1">
                <button className={`sidebar-item ${currentView === 'workflows' ? "active" : "text-slate-500 hover:text-slate-800"}`} onClick={() => setCurrentView('workflows')}>
                  <Zap className="sidebar-item-icon" aria-hidden />
                  <span className="sidebar-item-name">{t("sidebar.workflows")}</span>
                </button>
                <button className={`sidebar-item ${currentView === 'entity_creator' ? "active" : "text-slate-500 hover:text-slate-800"}`} onClick={() => setCurrentView('entity_creator')}>
                  <Database className="sidebar-item-icon" aria-hidden />
                  <span className="sidebar-item-name">{t("sidebar.entityCreator")}</span>
                </button>
              </div>
            </SidebarSection>
          </>
        )}

        </div>
      </ScrollArea>

      {/* Modals */}
      {selectedActionChannel && (
        <>
          <ChannelMembersModal
            isOpen={isChannelMembersOpen}
            onClose={() => setIsChannelMembersOpen(false)}
            channelId={selectedActionChannel.ID}
          />
          <ChannelSettingsModal
            isOpen={isChannelSettingsOpen}
            onClose={() => setIsChannelSettingsOpen(false)}
            channel={selectedActionChannel}
            onUpdate={() => {
              apiGet("/channels")
                .then(data => setChannels(data as Channel[] || []))
                .catch(err => console.error(err));
            }}
          />
        </>
      )}
    </aside>
  );
}
