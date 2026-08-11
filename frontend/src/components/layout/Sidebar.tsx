"use client";

import React, { useEffect, useState, useRef } from "react";
import { apiGet } from '@/lib/apiClient';
import { useAppStore } from "@/store/useAppStore";
import { useLocalization } from "@/contexts/LocalizationContext";
import { useCorrespondenceStore } from "@/store/useCorrespondenceStore";
import { useFinanceStore } from "@/store/useFinanceStore";
import { useCrmStore } from "@/store/useCrmStore";
import { useHrStore } from "@/store/useHrStore";
import { usePmStore } from "@/store/usePmStore";
import { useKnowledgeStore } from "@/store/useKnowledgeStore";
import { useAutomationStore } from "@/store/useAutomationStore";
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
  Ticket,
  MoreVertical,
  Table,
  LayoutDashboard,
  MapPin,
  Calendar,
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
  Archive,
  HardDrive,
  Receipt,
  Target,
  Gauge,
  Video
} from 'lucide-react';
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
  const [prevDefaultExpanded, setPrevDefaultExpanded] = React.useState(defaultExpanded);

  if (defaultExpanded !== prevDefaultExpanded) {
    setPrevDefaultExpanded(defaultExpanded);
    if (defaultExpanded) {
      setIsExpanded(true);
    }
  }

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
  onRequestDelete,
}: {
  ch: Channel & { unread?: number };
  isActive: boolean;
  onClick: () => void;
  onOpenSettings?: () => void;
  onOpenMembers?: () => void;
  onRequestDelete?: (id: string, name: string) => void;
}) {
  const { t } = useLocalization();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={`sidebar-item w-full ${isActive ? "active" : ""}`}
        aria-current={isActive ? "page" : undefined}
      >
        {ch.type === "PRIVATE" || ch.Type === "PRIVATE" ? (
          <Lock className="sidebar-item-icon" aria-hidden />
        ) : (
          <Hash className="sidebar-item-icon" aria-hidden />
        )}
        <span className={`sidebar-item-name flex-1 ${ch.unread ? "font-bold" : ""}`}>
          {ch.name || ch.Name}
        </span>
        {ch.unread && (
          <span className="sidebar-badge" aria-label={`${ch.unread} unread messages`}>
            {ch.unread}
          </span>
        )}
      </button>

      <button
        className="absolute start-2 top-1/2 -translate-y-1/2 rounded-[var(--radius-control)] p-1 text-sb-text opacity-0 transition-all hover:bg-sb-hover hover:text-sb-text-active group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        title={t("sidebar.channelSettings")}
      >
        <MoreVertical size={16} />
      </button>

      {showMenu && (
        <div ref={menuRef} className="absolute start-0 top-10 z-50 w-40 rounded-[var(--radius-surface)] border border-border bg-popover py-1 text-popover-foreground shadow-[var(--shadow-overlay)]">
          <button
            className="w-full px-4 py-2.5 text-start text-sm text-foreground transition-colors hover:bg-muted"
            onClick={(e) => { e.stopPropagation(); setShowMenu(false); onOpenSettings?.(); }}
          >
            {t("sidebar.channelSettings")}
          </button>
          <button
            className="w-full px-4 py-2.5 text-start text-sm text-foreground transition-colors hover:bg-muted"
            onClick={(e) => { e.stopPropagation(); setShowMenu(false); onOpenMembers?.(); }}
          >
            {t("sidebar.membersAndPermissions")}
          </button>
          {!(ch.is_system || ch.IsSystem) && (
            <button
              className="w-full border-t border-border px-4 py-2.5 text-start text-sm text-destructive transition-colors hover:bg-destructive/10"
              onClick={(e) => { e.stopPropagation(); setShowMenu(false); onRequestDelete?.(ch.id || ch.ID || '', ch.name || ch.Name || ''); }}
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
  onRequestDelete,
}: {
  dm: Channel & { unread?: number };
  isActive: boolean;
  onClick: () => void;
  onRequestDelete?: (id: string, name: string) => void;
}) {
  const { t } = useLocalization();
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    const dmId = dm.ID || dm.id;
    if (dmId) {
      onRequestDelete?.(dmId, dm.Name || dm.name || t("sidebar.directMessageDefault"));
    }
  };

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={`sidebar-item w-full ${isActive ? "active" : ""}`}
        aria-current={isActive ? "page" : undefined}
      >
        <div className="me-2 h-2 w-2 shrink-0 rounded-full bg-success" />
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
        className="absolute start-2 top-1/2 -translate-y-1/2 rounded-[var(--radius-control)] p-1 text-sb-text-muted opacity-0 transition-all hover:bg-sb-hover hover:text-destructive group-hover:opacity-100"
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
  const { t } = useLocalization();
  const { activeTab, setActiveTab } = useCorrespondenceStore();
  const { activeTab: financeTab, setActiveTab: setFinanceTab } = useFinanceStore();
  const { activeTab: crmTab, setActiveTab: setCrmTab } = useCrmStore();
  const { activeTab: hrTab, setActiveTab: setHrTab } = useHrStore();
  const { activeTab: pmTab, setActiveTab: setPmTab } = usePmStore();
  const { activeTab: knowledgeTab, setActiveTab: setKnowledgeTab } = useKnowledgeStore();
  const { activeTab: automationTab, setActiveTab: setAutomationTab } = useAutomationStore();
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
  const [displayName, setDisplayName] = useState("Hamza Admin");

  const [isChannelMembersOpen, setIsChannelMembersOpen] = useState(false);
  const [isChannelSettingsOpen, setIsChannelSettingsOpen] = useState(false);
  const [selectedActionChannel, setSelectedActionChannel] = useState<Channel | null>(null);

  // Global channel delete state — lives at Sidebar level, not inside ChannelItem
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const executeChannelDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      const { fetchWithAuth, API_BASE_URL } = await import('@/lib/apiClient');
      const res = await fetchWithAuth(`${API_BASE_URL}/channels/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setChannels(channels.filter((c: Channel) => (c.id || c.ID) !== deleteTarget.id));
        if (activeChannelId === deleteTarget.id) setActiveChannelId('');
        if (activeDmId === deleteTarget.id) setActiveDmId('');
        setDeleteTarget(null);
      } else {
        const body = await res.json().catch(() => ({}));
        setDeleteError(body.error || `فشل الحذف (${res.status})`);
      }
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "خطأ غير معروف");
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (statusMenuRef.current && !statusMenuRef.current.contains(event.target as Node)) {
        setIsStatusMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);

    // Load avatar and name
    setTimeout(() => {
      const savedAvatar = localStorage.getItem("septimus_avatar");
      if (savedAvatar) setAvatarUrl(savedAvatar);
      const savedName = localStorage.getItem("septimus_display_name");
      if (savedName) setDisplayName(savedName);
    }, 0);

    // Listen for avatar and name updates
    const handleAvatarUpdate = () => {
      const newAvatar = localStorage.getItem("septimus_avatar");
      if (newAvatar) setAvatarUrl(newAvatar);
    };
    const handleNameUpdate = () => {
      const newName = localStorage.getItem("septimus_display_name");
      if (newName) setDisplayName(newName);
    };
    window.addEventListener("septimus_avatar_updated", handleAvatarUpdate);
    window.addEventListener("septimus_display_name_updated", handleNameUpdate);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("septimus_avatar_updated", handleAvatarUpdate);
      window.removeEventListener("septimus_display_name_updated", handleNameUpdate);
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

  const publicChannels = channels.filter(c => {
    const t = c.type || c.Type || '';
    return t === "PUBLIC" || t === "PRIVATE";
  });
  const dms = channels.filter(c => {
    const t = c.type || c.Type || '';
    return t === "DM";
  });

  return (
    <aside className="sidebar animate-fade-in" aria-label={t("sidebar.navigationLabel")}>
      <ScrollArea className="sidebar-scroll">


        {/* User Status */}
        <div className="relative mb-2" ref={statusMenuRef}>
          <div className="sidebar-user hover-scale-soft cursor-pointer hover:bg-white/5 transition-colors" onClick={() => setIsStatusMenuOpen(!isStatusMenuOpen)}>
            <div className="relative">
              <Avatar className="sidebar-user-avatar rounded-[var(--radius-control)] border border-sb-divider shadow-[var(--shadow-raised)]">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt={displayName} className="rounded-[var(--radius-control)] object-cover" />
                ) : null}
                <AvatarFallback className="rounded-[var(--radius-control)] bg-brand text-sm font-bold text-brand-foreground">{displayName ? displayName.charAt(0).toUpperCase() : t("sidebar.defaultAvatar")}</AvatarFallback>
              </Avatar>
              <span className={`sidebar-user-status ${userStatus === 'offline' ? '!bg-sb-text-muted' : userStatus === 'away' ? '!bg-warning' : userStatus === 'busy' ? '!bg-destructive' : '!bg-success'} !border-2 !border-sb-bg`} aria-label={t(`sidebar.status.${userStatus}`)} />
            </div>
            <div className="sidebar-user-info">
              <p className="sidebar-user-name">{displayName}</p>
              <p className="sidebar-user-sub w-[100px] truncate">{customStatusText || t(`sidebar.status.${userStatus}`)}</p>
            </div>
            <ChevronRight className={`sidebar-user-chevron transition-transform ${isStatusMenuOpen ? 'rotate-90' : ''}`} aria-hidden />
          </div>

          {/* Status Dropdown */}
          {isStatusMenuOpen && (
            <div className="absolute start-0 top-full z-50 mt-1 w-full overflow-hidden rounded-[var(--radius-surface)] border border-border bg-popover text-sm text-popover-foreground shadow-[var(--shadow-overlay)]">
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-foreground transition-colors hover:bg-muted"
                onClick={() => { setUserStatus("online"); setIsStatusMenuOpen(false); }}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-success"></span>
                {t("sidebar.status.online")}
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-foreground transition-colors hover:bg-muted"
                onClick={() => { setUserStatus("away"); setIsStatusMenuOpen(false); }}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-warning"></span>
                {t("sidebar.status.away")}
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-foreground transition-colors hover:bg-muted"
                onClick={() => { setUserStatus("busy"); setIsStatusMenuOpen(false); }}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-destructive"></span>
                {t("sidebar.status.busy")}
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-foreground transition-colors hover:bg-muted"
                onClick={() => { setUserStatus("offline"); setIsStatusMenuOpen(false); }}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground"></span>
                {t("sidebar.status.offline")}
              </button>
              <div className="border-t border-border p-2">
                <input
                  type="text"
                  placeholder={t("sidebar.status.customPlaceholder")}
                  className="w-full rounded-[var(--radius-control)] border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
          <button className={`sidebar-item ${currentView === 'meetings' ? "active text-brand font-bold" : ""}`} onClick={() => setCurrentView('meetings')}>
            <Video className={`sidebar-item-icon ${currentView === 'meetings' ? "text-brand" : ""}`} aria-hidden />
            <span className="sidebar-item-name">{t("sidebar.meetings", "الاجتماعات المرئية")}</span>
          </button>
          <button
            className={`sidebar-item ${currentView === 'correspondence' ? "active text-brand font-bold" : ""}`}
            onClick={() => {
              setCurrentView('correspondence');
              setActiveTab('dashboard');
            }}
          >
            <FileText className={`sidebar-item-icon ${currentView === 'correspondence' ? "text-brand" : ""}`} aria-hidden />
            <span className="sidebar-item-name">{t("sidebar.officialCorrespondence")}</span>
          </button>
        </SidebarSection>

        <SidebarDivider />

        {/* === CHAT & MESSAGING CONTEXT === */}
        <SidebarSection label={t("sidebar.channels")} onAdd={() => setIsNewChannelModalOpen(true)} defaultExpanded={currentView === "chat" || currentView === "dm"}>
              <button className={`sidebar-item ${currentView === 'chat' && activeChannelId === '' ? "active" : ""}`} onClick={() => setCurrentView('chat')}>
                <MessageSquare className="sidebar-item-icon" aria-hidden />
                <span className="sidebar-item-name">{t("sidebar.globalChat")}</span>
              </button>
              {publicChannels.map((ch) => (
                <ChannelItem
                  key={ch.id || ch.ID}
                  ch={ch}
                  isActive={activeChannelId === (ch.id || ch.ID)}
                  onClick={() => {
                    setActiveChannelId(ch.id || ch.ID || '');
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
                  onRequestDelete={(id, name) => setDeleteTarget({ id, name })}
                />
              ))}
            </SidebarSection>

            <SidebarDivider />

            <SidebarSection label={t("sidebar.directMessages")} onAdd={() => setIsNewDmModalOpen(true)} defaultExpanded={currentView === "chat" || currentView === "dm"}>
              {dms.map((dm) => (
                <DmItem
                  key={dm.ID || dm.id || ''}
                  dm={dm}
                  isActive={currentView === 'dm' && activeDmId === (dm.ID || dm.id)}
                  onClick={() => {
                    setActiveDmId(dm.ID || dm.id || '');
                    setCurrentView('dm');
                  }}
                  onRequestDelete={(id, name) => setDeleteTarget({ id, name })}
                />
              ))}
            </SidebarSection>

        {/* === DIWAN & CORRESPONDENCE CONTEXT === */}
        {(currentView === 'correspondence') && (
          <SidebarSection label={t("correspondence.title")}>
            <div className="space-y-1">
              <button
                className={`sidebar-item ${activeTab === 'dashboard' ? "active" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => { setCurrentView('correspondence'); setActiveTab('dashboard'); }}
              >
                <LayoutDashboard className="sidebar-item-icon" aria-hidden />
                <span className="sidebar-item-name">{t("correspondence.tabDashboard")}</span>
              </button>
              <button
                className={`sidebar-item ${activeTab === 'designer' ? "active" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => { setCurrentView('correspondence'); setActiveTab('designer'); }}
              >
                <FileSpreadsheet className="sidebar-item-icon" aria-hidden />
                <span className="sidebar-item-name">{t("correspondence.tabTemplates")}</span>
              </button>
              <button
                className={`sidebar-item ${activeTab === 'editor' ? "active" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => { setCurrentView('correspondence'); setActiveTab('editor'); }}
              >
                <Edit3 className="sidebar-item-icon" aria-hidden />
                <span className="sidebar-item-name">{t("correspondence.tabEditor")}</span>
              </button>
              <button
                className={`sidebar-item ${activeTab === 'archive' ? "active" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => { setCurrentView('correspondence'); setActiveTab('archive'); }}
              >
                <Archive className="sidebar-item-icon" aria-hidden />
                <span className="sidebar-item-name">{t("correspondence.tabArchive")}</span>
              </button>
            </div>
          </SidebarSection>
        )}

        {/* === CRM CONTEXT === */}
        <SidebarSection label={t("sidebar.crm")} defaultExpanded={currentView === "crm"}>
            <div className="space-y-1">
              <button className={`sidebar-item ${crmTab === 'dashboard' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('crm'); setCrmTab('dashboard'); }}>
                <LayoutDashboard className={`sidebar-item-icon ${crmTab === 'dashboard' ? "text-brand" : ""}`} aria-hidden />
                <span className="sidebar-item-name">{t("crm.tabs.dashboard") || "Dashboard"}</span>
              </button>

              <button className={`sidebar-item ${crmTab === 'leads' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('crm'); setCrmTab('leads'); }}>
                <Users className={`sidebar-item-icon ${crmTab === 'leads' ? "text-brand" : ""}`} aria-hidden />
                <span className="sidebar-item-name">{t("crm.tabs.leads") || "Leads"}</span>
              </button>

              <button className={`sidebar-item ${crmTab === 'tickets' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('crm'); setCrmTab('tickets'); }}>
                <Ticket className={`sidebar-item-icon ${crmTab === 'tickets' ? "text-brand" : ""}`} aria-hidden />
                <span className="sidebar-item-name">{t("crm.tabs.tickets") || "Support Tickets"}</span>
              </button>
            </div>
          </SidebarSection>

        {/* === HR CONTEXT === */}
        {/* === MY SPACE (Employee Self-Service) === */}
        <SidebarSection label={t("sidebar.mySpace", "My Space")} defaultExpanded={["my_leave", "my_payslips", "my_profile"].includes(currentView)}>
            <div className="space-y-1">
              <button className={`sidebar-item ${currentView === 'my_leave' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setCurrentView('my_leave')}>
                <Calendar className={`sidebar-item-icon ${currentView === 'my_leave' ? "text-brand" : ""}`} aria-hidden />
                <span className="sidebar-item-name">{t("ess.myLeave", "My Leave")}</span>
              </button>
              <button className={`sidebar-item ${currentView === 'my_payslips' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setCurrentView('my_payslips')}>
                <Receipt className={`sidebar-item-icon ${currentView === 'my_payslips' ? "text-brand" : ""}`} aria-hidden />
                <span className="sidebar-item-name">{t("ess.myPayslips", "My Payslips")}</span>
              </button>
              <button className={`sidebar-item ${currentView === 'my_performance' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setCurrentView('my_performance')}>
                <Target className={`sidebar-item-icon ${currentView === 'my_performance' ? "text-brand" : ""}`} aria-hidden />
                <span className="sidebar-item-name">{t("ess.myPerformance", "My Performance")}</span>
              </button>
              <button className={`sidebar-item ${currentView === 'my_profile' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setCurrentView('my_profile')}>
                <Users className={`sidebar-item-icon ${currentView === 'my_profile' ? "text-brand" : ""}`} aria-hidden />
                <span className="sidebar-item-name">{t("ess.myProfile", "My Profile")}</span>
              </button>
            </div>
          </SidebarSection>

        <SidebarSection label={t("sidebar.hr")} defaultExpanded={currentView === "hr"}>
            <div className="space-y-1">
              <button className={`sidebar-item ${hrTab === 'dashboard' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('hr'); setHrTab('dashboard'); }}>
                <LayoutDashboard className={`sidebar-item-icon ${hrTab === 'dashboard' ? "text-brand" : ""}`} aria-hidden />
                <span className="sidebar-item-name">{t("hr.tabs.dashboard") || "Dashboard"}</span>
              </button>

              <button className={`sidebar-item ${hrTab === 'directory' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('hr'); setHrTab('directory'); }}>
                <Users className={`sidebar-item-icon ${hrTab === 'directory' ? "text-brand" : ""}`} aria-hidden />
                <span className="sidebar-item-name">{t("hr.tabs.directory") || "Employees 360"}</span>
              </button>

              <button className={`sidebar-item ${hrTab === 'attendance' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('hr'); setHrTab('attendance'); }}>
                <MapPin className={`sidebar-item-icon ${hrTab === 'attendance' ? "text-brand" : ""}`} aria-hidden />
                <span className="sidebar-item-name">{t("hr.tabs.attendance") || "GPS Attendance"}</span>
              </button>

              <button className={`sidebar-item ${hrTab === 'leave' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('hr'); setHrTab('leave'); }}>
                <Calendar className={`sidebar-item-icon ${hrTab === 'leave' ? "text-brand" : ""}`} aria-hidden />
                <span className="sidebar-item-name">{t("hr.tabs.leave") || "Leave Requests"}</span>
              </button>

              <button className={`sidebar-item ${hrTab === 'settings' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('hr'); setHrTab('settings'); }}>
                <Settings className={`sidebar-item-icon ${hrTab === 'settings' ? "text-brand" : ""}`} aria-hidden />
                <span className="sidebar-item-name">{t("hr.tabs.settings") || "Department Settings"}</span>
              </button>
            </div>
          </SidebarSection>

        {/* === FINANCE CONTEXT === */}
        <SidebarSection label={t("sidebar.finance")} defaultExpanded={currentView === "finance"}>
            <div className="space-y-1">
              <button className={`sidebar-item ${financeTab === 'dashboard' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('finance'); setFinanceTab('dashboard'); }}>
                <LayoutDashboard className={`sidebar-item-icon ${financeTab === 'dashboard' ? "text-brand" : ""}`} aria-hidden />
                <span className="sidebar-item-name">{t("sidebar.dashboard") || "Financial Dashboard"}</span>
              </button>

              <button className={`sidebar-item ${financeTab === 'invoices' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('finance'); setFinanceTab('invoices'); }}>
                <CreditCard className={`sidebar-item-icon ${financeTab === 'invoices' ? "text-brand" : ""}`} aria-hidden />
                <span className="sidebar-item-name">{t("sidebar.invoices") || "Invoices"}</span>
              </button>

              <button className={`sidebar-item ${financeTab === 'expenses' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('finance'); setFinanceTab('expenses'); }}>
                <Receipt className={`sidebar-item-icon ${financeTab === 'expenses' ? "text-brand" : ""}`} aria-hidden />
                <span className="sidebar-item-name">{t("sidebar.expenses") || "Expenses"}</span>
              </button>

              <button className={`sidebar-item ${financeTab === 'vat' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('finance'); setFinanceTab('vat'); }}>
                <FileText className={`sidebar-item-icon ${financeTab === 'vat' ? "text-brand" : ""}`} aria-hidden />
                <span className="sidebar-item-name">{t("sidebar.vatReturn") || "VAT Return"}</span>
              </button>
            </div>
          </SidebarSection>

        {/* === ADMIN CONTEXT === */}
        {(['admin_dashboard', 'roles_settings', 'appearance_settings', 'localization_settings', 'system_settings', 'saas_settings', 'integrations', 'plugins', 'orchestrator'].includes(currentView)) && (
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
              <button className={`sidebar-item ${currentView === 'plugins' ? "active" : ""}`} onClick={() => setCurrentView('plugins')}>
                <Puzzle className="sidebar-item-icon" aria-hidden />
                <span className="sidebar-item-name">{t("sidebar.plugins")}</span>
              </button>
            </SidebarSection>

            <SidebarDivider />

            <SidebarSection label={t("sidebar.aiAgents")}>
              <div className="space-y-1">
                <Gated feature="ai.agents" mode="lock">
                  <button className={`sidebar-item w-full ${currentView === 'orchestrator' ? "active" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setCurrentView('orchestrator')}>
                    <Sparkles className="sidebar-item-icon" aria-hidden />
                    <span className="sidebar-item-name">{t("sidebar.aiCenter")}</span>
                  </button>
                </Gated>
              </div>
            </SidebarSection>
          </>
        )}

        {/* === PM CONTEXT === */}
        <SidebarSection label={t("sidebar.agile_pm", "إدارة المشاريع")} defaultExpanded={currentView === "pm"}>
              <div className="space-y-1">
                <button className={`sidebar-item ${pmTab === 'dashboard' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('pm'); setPmTab('dashboard'); }}>
                  <LayoutDashboard className={`sidebar-item-icon ${pmTab === 'dashboard' ? "text-brand" : ""}`} aria-hidden />
                  <span className="sidebar-item-name">{t("pm.sidebar.projects_overview", "نظرة عامة على المشاريع")}</span>
                </button>
                <button className={`sidebar-item ${pmTab === 'kanban' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('pm'); setPmTab('kanban'); }}>
                  <LayoutGrid className={`sidebar-item-icon ${pmTab === 'kanban' ? "text-brand" : ""}`} aria-hidden />
                  <span className="sidebar-item-name">{t("sidebar.kanban", "لوحات كانبان")}</span>
                </button>
                <button className={`sidebar-item ${pmTab === 'backlog' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('pm'); setPmTab('backlog'); }}>
                  <ListTodo className={`sidebar-item-icon ${pmTab === 'backlog' ? "text-brand" : ""}`} aria-hidden />
                  <span className="sidebar-item-name">{t("sidebar.backlog", "قائمة المهام المتراكمة")}</span>
                </button>
                <button className={`sidebar-item ${pmTab === 'table' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('pm'); setPmTab('table'); }}>
                  <Table className={`sidebar-item-icon ${pmTab === 'table' ? "text-brand" : ""}`} aria-hidden />
                  <span className="sidebar-item-name">{t("sidebar.table", "المهام والجدولة")}</span>
                </button>
                <button className={`sidebar-item ${pmTab === 'planning' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('pm'); setPmTab('planning'); }}>
                  <Calendar className={`sidebar-item-icon ${pmTab === 'planning' ? "text-brand" : ""}`} aria-hidden />
                  <span className="sidebar-item-name">{t("pm.planning.sidebar")}</span>
                </button>
                <button className={`sidebar-item ${pmTab === 'analytics' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('pm'); setPmTab('analytics'); }}>
                  <Gauge className={`sidebar-item-icon ${pmTab === 'analytics' ? "text-brand" : ""}`} aria-hidden />
                  <span className="sidebar-item-name">{t("pm.analytics", "Delivery analytics")}</span>
                </button>
                <button className={`sidebar-item ${pmTab === 'reports' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('pm'); setPmTab('reports'); }}>
                  <PieChart className={`sidebar-item-icon ${pmTab === 'reports' ? "text-brand" : ""}`} aria-hidden />
                  <span className="sidebar-item-name">{t("sidebar.reports_center", "التقارير التحليلية")}</span>
                </button>
              </div>
            </SidebarSection>

        {/* === KNOWLEDGE CONTEXT === */}
        <SidebarSection label={t("sidebar.knowledgeBase", "المعرفة والمستندات")} defaultExpanded={currentView === "knowledge"}>
              <div className="space-y-1">
                <button className={`sidebar-item ${knowledgeTab === 'workdocs' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('knowledge'); setKnowledgeTab('workdocs'); }}>
                  <FileText className={`sidebar-item-icon ${knowledgeTab === 'workdocs' ? "text-brand" : ""}`} aria-hidden />
                  <span className="sidebar-item-name">{t("sidebar.workDocs", "مستندات العمل")}</span>
                </button>
                <button className={`sidebar-item ${knowledgeTab === 'knowledge_base' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('knowledge'); setKnowledgeTab('knowledge_base'); }}>
                  <Database className={`sidebar-item-icon ${knowledgeTab === 'knowledge_base' ? "text-brand" : ""}`} aria-hidden />
                  <span className="sidebar-item-name">{t("sidebar.knowledgeBase", "قاعدة المعرفة")}</span>
                </button>
                <button className={`sidebar-item ${knowledgeTab === 'drive' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('knowledge'); setKnowledgeTab('drive'); }}>
                  <HardDrive className={`sidebar-item-icon ${knowledgeTab === 'drive' ? "text-brand" : ""}`} aria-hidden />
                  <span className="sidebar-item-name">Septimus Drive</span>
                </button>
              </div>
            </SidebarSection>

        {/* === AUTOMATION CONTEXT === */}
        <SidebarSection label={t("sidebar.automationsAndData", "الأتمتة والبيانات")} defaultExpanded={currentView === "automation"}>
              <div className="space-y-1">
                <button className={`sidebar-item ${automationTab === 'workflows' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('automation'); setAutomationTab('workflows'); }}>
                  <Zap className={`sidebar-item-icon ${automationTab === 'workflows' ? "text-brand" : ""}`} aria-hidden />
                  <span className="sidebar-item-name">{t("sidebar.workflows", "مسارات العمل")}</span>
                </button>
                <button className={`sidebar-item ${automationTab === 'automations' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('automation'); setAutomationTab('automations'); }}>
                  <Zap className={`sidebar-item-icon ${automationTab === 'automations' ? "text-brand" : ""}`} aria-hidden />
                  <span className="sidebar-item-name">{t("sidebar.automations", "الأتمتة الذكية")}</span>
                </button>
                <Gated feature="data.builder" mode="lock">
                  <button className={`sidebar-item ${automationTab === 'entity_creator' ? "active text-brand font-bold" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setCurrentView('automation'); setAutomationTab('entity_creator'); }}>
                    <Database className={`sidebar-item-icon ${automationTab === 'entity_creator' ? "text-brand" : ""}`} aria-hidden />
                    <span className="sidebar-item-name">{t("sidebar.entityCreator")}</span>
                  </button>
                </Gated>
              </div>
            </SidebarSection>

        </div>
      </ScrollArea>

      {/* Modals */}
      {selectedActionChannel && (
        <>
          <ChannelMembersModal
            isOpen={isChannelMembersOpen}
            onClose={() => setIsChannelMembersOpen(false)}
            channelId={selectedActionChannel.id || selectedActionChannel.ID || ''}
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

      {/* Global Channel Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-foreground/35 backdrop-blur-sm">
          <div className="m-4 w-full max-w-sm rounded-[var(--radius-surface)] border border-border bg-popover p-6 text-popover-foreground shadow-[var(--shadow-overlay)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <svg className="h-5 w-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-foreground">{t("sidebar.deleteChannelTitle", "Delete Channel")}</h3>
                <p className="text-sm text-muted-foreground">{t("sidebar.deleteChannelConfirm", "Are you sure you want to delete")} <strong>{deleteTarget.name}</strong>?</p>
              </div>
            </div>
            {deleteError && (
              <div className="mb-4 rounded-[var(--radius-control)] border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{deleteError}</div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                className="rounded-[var(--radius-control)] bg-muted px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
                onClick={() => { setDeleteTarget(null); setDeleteError(""); }}
                disabled={isDeleting}
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                className="rounded-[var(--radius-control)] bg-destructive px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
                onClick={executeChannelDelete}
                disabled={isDeleting}
              >
                {isDeleting ? t("common.deleting", "Deleting...") : t("common.confirmDelete", "Confirm Delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
