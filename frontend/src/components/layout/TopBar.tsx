/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Menu, Search, Bell, HeadphonesIcon, ChevronDown, MessageSquare, LogOut, User, MapPin, Settings, Flame, MessageCircle, X, LayoutGrid, Briefcase, Users, Wallet, Shield, Zap } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import SettingsModal from "./SettingsModal";
import HuddleWidget from "@/components/huddles/HuddleWidget";
import AttendanceModal from "./AttendanceModal";
import { useThemeStore } from "@/store/useThemeStore";
import { fetchWithAuth, apiDelete, API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from "@/contexts/LocalizationContext";

interface SearchResult {
  entity_type?: string;
  distance?: number;
  content?: string;
}

interface CurrentUserExtended {
  WorkspaceID?: string;
  workspace_id?: string;
  avatarUrl?: string;
  name?: string;
  email?: string;
}

export default function TopBar() {
  const { logoUrl } = useThemeStore();
  const companyName = "Septimus OS"; // Fallback or move to a separate store
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAttendanceOpen, setIsAttendanceOpen] = useState(false);
  const { currentUser, notifications, centrifuge, isSidebarOpen, setIsSidebarOpen, setIsCatchUpModalOpen, setCurrentView } = useAppStore();
  const [isHuddleActive, setIsHuddleActive] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isMessengerOpen, setIsMessengerOpen] = useState(false);
  const [isAppGridOpen, setIsAppGridOpen] = useState(false);
  const { t, isRtl } = useLocalization();

  const unreadCount = notifications ? notifications.filter((n: { isRead?: boolean }) => !n.isRead).length : 0;

  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const messengerRef = useRef<HTMLDivElement>(null);
  const appGridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (searchRef.current && !searchRef.current.contains(target)) {
        setShowDropdown(false);
      }
      if (profileRef.current && !profileRef.current.contains(target)) {
        setIsProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(target)) {
        setIsNotifOpen(false);
      }
      if (messengerRef.current && !messengerRef.current.contains(target)) {
        setIsMessengerOpen(false);
      }
      if (appGridRef.current && !appGridRef.current.contains(target)) {
        setIsAppGridOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      queueMicrotask(() => {
        if (results.length > 0) setResults([]);
        if (showDropdown) setShowDropdown(false);
      });
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const user = currentUser as unknown as CurrentUserExtended;
        const workspaceId = user?.WorkspaceID || user?.workspace_id || "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e";
        const res = await fetchWithAuth(`${API_BASE_URL}/search/semantic?workspace_id=${workspaceId}&q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
          setShowDropdown(true);
        }
      } catch (err) {
        console.error("Search error", err);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query, results.length, showDropdown, currentUser]);

  return (
    <header className="topbar" role="banner">
      {/* Left — Workspace Name (aligns with sidebar width) */}
      <div className="topbar-left">
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="me-2 p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-md transition-colors shrink-0"
          aria-label={t("topbar.toggleSidebar")}
        >
          <Menu className="w-5 h-5" />
        </button>
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-8 w-auto object-contain me-2" />
        ) : (
          <div className="topbar-logo" aria-hidden>S</div>
        )}
        <button className="topbar-workspace-btn" aria-label={t("topbar.switchWorkspace")}>
          {companyName || "Septimus OS"}
          <ChevronDown className="topbar-chevron" aria-hidden />
        </button>
      </div>

      {/* Center — Search */}
      <div className="topbar-center" ref={searchRef}>
        <div className="relative w-full max-w-2xl xl:w-[60%] transition-all duration-300 ease-in-out flex items-center bg-white/10 hover:bg-white/20 rounded-md border border-transparent hover:border-white/20 px-2 group">
          <Search className="w-4 h-4 text-white/70 group-hover:text-white me-2" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            placeholder={t("topbar.search")}
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/70 py-1.5 text-sm"
            aria-label={t("topbar.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-medium text-white/90 ms-2">
            ⌘K
          </kbd>

          {/* Search Dropdown */}
          {showDropdown && (
            <div className="absolute top-full start-0 end-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-2xl z-50 max-h-[60vh] overflow-y-auto">
              {isSearching ? (
                <div className="p-4 text-sm text-slate-500 text-center flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-slate-300 border-t-[var(--sb-bg)] rounded-full animate-spin" />
                  Searching...
                </div>
              ) : results.length === 0 ? (
                <div className="p-6 text-sm text-slate-500 text-center">
                  <Search className="w-8 h-8 opacity-20 mx-auto mb-2" />
                  No results found for &quot;{query}&quot;
                </div>
              ) : (
                <div className="py-2">
                  <h3 className="px-4 text-xs font-semibold text-[var(--sb-bg)] uppercase tracking-wider mb-2">Results</h3>
                  <ul className="space-y-1">
                    {results.map((res: SearchResult, idx) => (
                      <li key={idx} className="mx-2 p-2 hover:bg-slate-50 rounded-md cursor-pointer flex items-start space-x-3 transition-colors group">
                        <div className="flex items-center justify-center w-8 h-8 rounded bg-slate-100 text-slate-500 group-hover:text-[var(--sb-bg)] transition-colors shrink-0">
                          <MessageSquare className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-semibold text-[var(--sb-bg)] uppercase">
                              {res.entity_type}
                            </span>
                            <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Match: {((1 - (res.distance ?? 0)) * 100).toFixed(0)}%</span>
                          </div>
                          <p className="text-sm text-slate-600 truncate mt-0.5">
                            {res.content}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right — Controls */}
      <div className="topbar-right" role="toolbar" aria-label={t("topbar.actions")}>
        {/* Catch Up Swipe Feed Button */}
        <button
          onClick={() => setIsCatchUpModalOpen(true)}
          title={t("topbar.catchUp")}
          aria-label={t("topbar.catchUp")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-white text-xs font-bold shadow-md hover:opacity-90 transition-opacity"
        >
          <Flame className="w-4 h-4 animate-pulse text-amber-200" />
          <span className="hidden sm:inline">{t("topbar.catchUp")}</span>
        </button>

        {/* Global App Switcher Grid */}
        <div className="relative" ref={appGridRef}>
          <button 
            className="topbar-icon-btn" 
            aria-label={t("topbar.appSwitcher")}
            onClick={() => { setIsAppGridOpen(!isAppGridOpen); setIsNotifOpen(false); setIsProfileOpen(false); setIsMessengerOpen(false); }}
          >
            <LayoutGrid className="w-5 h-5" />
          </button>
          {isAppGridOpen && (
            <div className={`absolute ${isRtl ? "left-0" : "right-0"} mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden`} dir={isRtl ? "rtl" : "ltr"}>
              <div className="p-4 bg-slate-50 border-b border-slate-100">
                <h3 className="font-bold text-slate-800">{t("appGrid.title")}</h3>
                <p className="text-xs text-slate-500">{t("appGrid.subtitle")}</p>
              </div>
              <div className="p-4 grid grid-cols-3 gap-3">
                <button onClick={() => { setCurrentView('chat'); setIsAppGridOpen(false); }} className="flex flex-col items-center justify-center p-3 rounded-xl hover:bg-indigo-50 transition-colors group">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform"><MessageSquare className="w-5 h-5" /></div>
                  <span className="text-xs font-bold text-slate-700 mt-2">{t("appGrid.chat")}</span>
                </button>
                <button onClick={() => { setCurrentView('crm'); setIsAppGridOpen(false); }} className="flex flex-col items-center justify-center p-3 rounded-xl hover:bg-emerald-50 transition-colors group">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform"><Briefcase className="w-5 h-5" /></div>
                  <span className="text-xs font-bold text-slate-700 mt-2">{t("appGrid.crm")}</span>
                </button>
                <button onClick={() => { setCurrentView('hr'); setIsAppGridOpen(false); }} className="flex flex-col items-center justify-center p-3 rounded-xl hover:bg-sky-50 transition-colors group">
                  <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center text-sky-600 group-hover:scale-110 transition-transform"><Users className="w-5 h-5" /></div>
                  <span className="text-xs font-bold text-slate-700 mt-2">{t("appGrid.hr")}</span>
                </button>
                <button onClick={() => { setCurrentView('finance'); setIsAppGridOpen(false); }} className="flex flex-col items-center justify-center p-3 rounded-xl hover:bg-amber-50 transition-colors group">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform"><Wallet className="w-5 h-5" /></div>
                  <span className="text-xs font-bold text-slate-700 mt-2">{t("appGrid.finance")}</span>
                </button>
                <button onClick={() => { setCurrentView('workflows'); setIsAppGridOpen(false); }} className="flex flex-col items-center justify-center p-3 rounded-xl hover:bg-purple-50 transition-colors group">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform"><Zap className="w-5 h-5" /></div>
                  <span className="text-xs font-bold text-slate-700 mt-2">{t("appGrid.workflows")}</span>
                </button>
                <button onClick={() => { setCurrentView('admin_dashboard'); setIsAppGridOpen(false); }} className="flex flex-col items-center justify-center p-3 rounded-xl hover:bg-rose-50 transition-colors group">
                  <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 group-hover:scale-110 transition-transform"><Shield className="w-5 h-5" /></div>
                  <span className="text-xs font-bold text-slate-700 mt-2">{t("appGrid.admin")}</span>
                </button>
                <button onClick={() => { setCurrentView('system_settings'); setIsAppGridOpen(false); }} className="flex flex-col items-center justify-center p-3 rounded-xl hover:bg-slate-100 transition-colors group">
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 group-hover:scale-110 transition-transform"><Settings className="w-5 h-5" /></div>
                  <span className="text-xs font-bold text-slate-700 mt-2">{t("appGrid.settings")}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button 
            className="topbar-icon-btn" 
            aria-label={t("topbar.notifications")}
            onClick={() => { setIsNotifOpen(!isNotifOpen); setIsProfileOpen(false); setIsMessengerOpen(false); }}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && <span className="topbar-notif-dot" aria-hidden />}
          </button>
          {isNotifOpen && (
            <div className={`absolute ${isRtl ? "left-0" : "right-0"} mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden`} dir={isRtl ? "rtl" : "ltr"}>
              <div className="flex items-center justify-between p-3 border-b border-slate-100 bg-white ">
                <span className="font-semibold text-sm text-[var(--sb-bg)] [var(--sb-bg)]">{t("topbar.notifications")}</span>
                <button 
                  onClick={() => {
                    const updated = notifications.map(n => ({ ...n, isRead: true }));
                    useAppStore.getState().setNotifications(updated);
                  }}
                  className="text-xs text-[var(--sb-bg)] hover:underline"
                >
                  {t("topbar.markAllRead")}
                </button>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {notifications && notifications.length > 0 ? (
                  notifications.map((notif, idx: number) => (
                    <div key={idx} className={`p-3 border-b border-slate-100 hover:bg-white :bg-slate-100/50 cursor-pointer flex items-start space-x-3 ${!notif.isRead ? 'bg-brand-light/50 ' : ''}`}>
                      <div className="p-2 bg-brand-light text-[var(--sb-bg)] [var(--sb-bg)] rounded-full shrink-0">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm text-[var(--sb-bg)] ">
                          {notif.messageKey ? t(notif.messageKey, notif.message) : notif.message}
                        </p>
                        <p className="text-xs text-[var(--sb-bg)]/70 [var(--sb-bg)]/70 mt-1">{notif.createdAt ? new Date(notif.createdAt).toLocaleTimeString() : ""}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-sm text-[var(--sb-bg)]/70 [var(--sb-bg)]/70">
                    {t("topbar.noNotifications")}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Messenger */}
        <div className="relative" ref={messengerRef}>
          <button 
            className="topbar-icon-btn" 
            aria-label={t("topbar.messages")}
            onClick={() => { setIsMessengerOpen(!isMessengerOpen); setIsNotifOpen(false); setIsProfileOpen(false); }}
          >
            <MessageCircle className="w-5 h-5" />
            {useAppStore.getState().channels.filter(c => c.Type === "DM").length > 0 && <span className="topbar-notif-dot" aria-hidden />}
          </button>
          {isMessengerOpen && (
            <div className="absolute end-0 mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden">
              <div className="flex items-center justify-between p-3 border-b border-slate-100 bg-white">
                <span className="font-semibold text-sm text-[var(--sb-bg)]">{t("topbar.messages")}</span>
                <button className="text-xs text-brand hover:underline" onClick={() => { setIsMessengerOpen(false); useAppStore.getState().setIsNewDmModalOpen(true); }}>{t("topbar.newMessage")}</button>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {useAppStore.getState().channels.filter(c => c.Type === "DM").length > 0 ? (
                  useAppStore.getState().channels.filter(c => c.Type === "DM").map((dm) => (
                    <div 
                      key={dm.ID} 
                      className="p-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer flex items-center justify-between group"
                      onClick={() => {
                        useAppStore.getState().addFloatingChat({ id: dm.ID, name: dm.Name || t("topbar.directMessage") });
                        setIsMessengerOpen(false);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-brand text-white">{dm.Name?.charAt(0).toUpperCase() || "D"}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{dm.Name || t("topbar.directMessage")}</p>
                          <p className="text-xs text-slate-500 truncate w-40">{t("topbar.tapToViewChat")}</p>
                        </div>
                      </div>
                      <button 
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-colors"
                        title={t("topbar.deleteConversation")}
                        aria-label={t("topbar.deleteConversation")}
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm(t("topbar.confirmDeleteConversation"))) {
                            try {
                              await apiDelete(`/channels/${dm.ID}`);
                              useAppStore.getState().setChannels(useAppStore.getState().channels.filter(c => c.ID !== dm.ID));
                              useAppStore.getState().removeFloatingChat(dm.ID);
                            } catch (err: unknown) {
                              const msg = err instanceof Error ? err.message : t("common.unknownError");
                              alert(t("topbar.deleteError") + msg);
                            }
                          }
                        }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-sm text-slate-500">
                    {t("topbar.noMessages")}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Settings */}
        <button 
          className="topbar-icon-btn" 
          aria-label={t("topbar.settings")}
          onClick={() => setIsSettingsOpen(true)}
        >
          <Settings className="w-5 h-5" />
        </button>

        {/* Attendance Button */}
        <button 
          className="topbar-icon-btn" 
          aria-label={t("topbar.attendance")}
          onClick={() => setIsAttendanceOpen(true)}
        >
          <MapPin className="w-5 h-5" />
        </button>

        {/* Huddle */}
        <button 
          className={`topbar-icon-btn ${isHuddleActive ? 'text-primary bg-primary/10' : ''}`} 
          aria-label={t("topbar.huddle")}
          onClick={() => setIsHuddleActive(!isHuddleActive)}
        >
          <HeadphonesIcon className="w-5 h-5" />
        </button>

        {/* Profile */}
        <div className="relative" ref={profileRef}>
          <button onClick={() => { setIsProfileOpen(!isProfileOpen); setIsNotifOpen(false); setIsMessengerOpen(false); }}>
            <Avatar className="topbar-avatar hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer" aria-label={t("topbar.userProfile")}>
              <AvatarImage src={(currentUser as unknown as CurrentUserExtended)?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(String((currentUser as unknown as CurrentUserExtended)?.name || "User"))}&background=random`} alt={String((currentUser as unknown as CurrentUserExtended)?.name || "User")} />
              <AvatarFallback className="topbar-avatar-fallback">{String((currentUser as unknown as CurrentUserExtended)?.name || "US").substring(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
          </button>
          
          {isProfileOpen && (
            <div className={`absolute ${isRtl ? "left-0" : "right-0"} mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden`} dir={isRtl ? "rtl" : "ltr"}>
              <div className="p-4 border-b border-slate-100 flex items-center space-x-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={currentUser?.avatarUrl || `https://ui-avatars.com/api/?name=${currentUser?.name || "User"}&background=random`} />
                  <AvatarFallback>{currentUser?.name?.substring(0, 2).toUpperCase() || "US"}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-bold text-[var(--sb-bg)] [var(--sb-bg)] truncate w-32">{currentUser?.name || "User"}</p>
                  <p className="text-xs text-[var(--sb-bg)]/70 [var(--sb-bg)]/70 truncate w-32">{currentUser?.email || "user@septimus.local"}</p>
                </div>
              </div>
              <div className="p-2 space-y-1">
                <button 
                  onClick={() => { setIsProfileOpen(false); setIsSettingsOpen(true); }}
                  className="w-full flex items-center space-x-2 px-3 py-2 hover:bg-slate-100 :bg-slate-100 rounded-md text-sm text-slate-700 transition-colors"
                >
                  <User className="w-4 h-4" />
                  <span>{t("topbar.profileSettings")}</span>
                </button>
                <button 
                  onClick={() => {
                    if (centrifuge) centrifuge.disconnect();
                    localStorage.removeItem('septimus_token');
                    window.location.href = '/';
                  }}
                  className="w-full flex items-center space-x-2 px-3 py-2 hover:bg-red-50 :bg-red-900/30 text-red-600 rounded-md text-sm transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{t("topbar.signOut")}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <AttendanceModal isOpen={isAttendanceOpen} onClose={() => setIsAttendanceOpen(false)} />
      {isHuddleActive && <HuddleWidget onClose={() => setIsHuddleActive(false)} />}
    </header>
  );
}
