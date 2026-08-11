"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect, useRef } from "react";
import { Search, FileText, CheckSquare, Hash, Plus, Settings, MessageSquare, BarChart2, Briefcase, Zap, Terminal, Mic, MicOff, Globe, Loader2, Users, Pin } from "lucide-react";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
}

import { useAppStore } from "@/store/useAppStore";
import { useLocalization } from "@/contexts/LocalizationContext";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";

interface SearchResult {
  id?: string;
  entity_type?: string;
  content?: string;
  data?: Record<string, unknown>;
  match?: "lexical" | "semantic" | "hybrid";
}

export default function CommandMenu() {
  const { isRtl } = useLocalization();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [globalResults, setGlobalResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const { setCurrentView, setIsEntityModalOpen, channels, setActiveChannelId, currentUser } = useAppStore();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((open) => !open);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setQuery("");
      setGlobalResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setGlobalResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetchWithAuth(`${API_BASE_URL}/search/omni?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setGlobalResults(data.results || []);
        }
      } catch (err) {
        console.error("Search error", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, currentUser]);

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    if (!('webkitSpeechRecognition' in window)) {
      alert(isRtl ? "متصفحك لا يدعم التعرف على الكلام. يرجى استخدام Chrome." : "Your browser does not support speech recognition. Please use Chrome.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ar-SA';
    recognition.continuous = false;
    recognition.interimResults = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQuery(transcript);
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  if (!isOpen) return null;

  const handleSelect = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  const commands = [
    {
      group: isRtl ? "التنقل" : "Navigation",
      items: [
        { name: isRtl ? "الذهاب إلى الدردشة" : "Go to Chat", icon: <MessageSquare className="w-4 h-4" />, action: () => handleSelect(() => setCurrentView("chat")) },
        { name: isRtl ? "الذهاب إلى لوحة كانبان" : "Go to Kanban Board", icon: <CheckSquare className="w-4 h-4" />, action: () => handleSelect(() => setCurrentView("kanban")) },
        { name: isRtl ? "الذهاب إلى السبرنتات والمهام" : "Go to Sprints & Backlog", icon: <Terminal className="w-4 h-4" />, action: () => handleSelect(() => setCurrentView("backlog")) },
        { name: isRtl ? "الذهاب إلى مركز التقارير" : "Go to Reports Center", icon: <BarChart2 className="w-4 h-4" />, action: () => handleSelect(() => setCurrentView("reports")) },
        { name: isRtl ? "الذهاب إلى المستندات" : "Go to WorkDocs", icon: <FileText className="w-4 h-4" />, action: () => handleSelect(() => setCurrentView("workdocs")) },
        { name: isRtl ? "الذهاب إلى سير العمل" : "Go to Workflows", icon: <Zap className="w-4 h-4" />, action: () => handleSelect(() => setCurrentView("workflows")) },
        { name: isRtl ? "الذهاب إلى الإعدادات" : "Go to Settings", icon: <Settings className="w-4 h-4" />, action: () => handleSelect(() => setCurrentView("roles_settings")) },
      ],
    },
    {
      group: isRtl ? "المهام والإجراءات" : "Tasks & Actions",
      items: [
        { name: query ? (isRtl ? `إنشاء مهمة: ${query}` : `Create Task: ${query}`) : (isRtl ? "إنشاء مهمة جديدة" : "Create New Task"), icon: <Plus className="w-4 h-4" />, action: () => handleSelect(() => { 
          setCurrentView("entity_creator"); 
          setIsEntityModalOpen(true); 
        }) },
        { name: isRtl ? "سبرنت جديد" : "New Sprint", icon: <Briefcase className="w-4 h-4" />, action: () => handleSelect(() => setCurrentView("backlog")) },
      ],
    },
    {
      group: isRtl ? "القنوات" : "Channels",
      items: channels.map(c => ({
        name: (isRtl ? `انضم إلى #${c.name || c.Name}` : `Join #${c.name || c.Name}`),
        icon: <Hash className="w-4 h-4" />,
        action: () => handleSelect(() => { setActiveChannelId(c.id || c.ID || ''); setCurrentView("chat"); })
      })),
    }
  ];

  const filteredCommands = commands.map(group => ({
    ...group,
    items: group.items.filter(item => item.name.toLowerCase().includes(query.toLowerCase()))
  })).filter(group => group.items.length > 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] sm:pt-[20vh] px-4 backdrop-blur-md bg-slate-900/50 transition-all duration-300" onClick={() => setIsOpen(false)}>
      <div 
        className="w-full max-w-2xl bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-border/60 ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-4 border-b border-border/80 bg-background/50">
          <Search className="w-6 h-6 text-indigo-400 me-3 animate-pulse" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-foreground placeholder-slate-400 text-lg"
            placeholder={isRtl ? "اكتب أمراً أو ابحث..." : "Type a command or search..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button 
            onClick={toggleListen}
            className={`me-3 p-2 rounded-full transition-all duration-300 ${isListening ? 'bg-red-100 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse' : 'bg-muted text-muted-foreground hover:bg-brand-light hover:text-brand'}`}
            title={isRtl ? "تحدّث للبحث أو إنشاء مهمة" : "Speak to search or create a task"}
          >
            {isListening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>
          <kbd className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-card shadow-sm rounded-md border border-border uppercase">
            ESC
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2 scrollbar-thin">
          {isSearching && (
            <div className="py-8 flex justify-center items-center">
              <Loader2 className="w-5 h-5 text-brand animate-spin" />
            </div>
          )}

          {!isSearching && filteredCommands.length === 0 && globalResults.length === 0 ? (
            <div className="py-14 text-center text-sm text-muted-foreground">
              {isRtl ? "لا نتائج لـ" : "No results found for"} <span className="font-medium text-foreground">&quot;{query}&quot;</span>
            </div>
          ) : (
            <>
              {filteredCommands.map((group, idx) => (
                <div key={idx} className="mb-4 last:mb-0">
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {group.group}
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item, itemIdx) => (
                      <button
                        key={itemIdx}
                        onClick={item.action}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-[#dfb2e5]/10 hover:text-brand transition-colors text-start group"
                      >
                        <div className="text-muted-foreground group-hover:text-brand transition-colors">
                          {item.icon}
                        </div>
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {!isSearching && globalResults.length > 0 && (
                <div className="mb-4 mt-4 border-t border-border pt-4">
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5" />
                    {isRtl ? "نتائج البحث العالمي" : "Global Search Results"}
                  </div>
                  <div className="space-y-1">
                    {globalResults.map((result, idx) => (
                      <button
                        key={result.id || `global-${idx}`}
                        className="w-full flex flex-col gap-1 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-[#dfb2e5]/10 hover:text-brand transition-colors text-start group"
                        onClick={() => {
                          setIsOpen(false);
                          if (result.entity_type === 'message') {
                            setCurrentView('chat');
                            if (typeof result.data?.channel_id === "string") {
                              setActiveChannelId(result.data.channel_id);
                            }
                          }
                        }}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            {result.entity_type === 'crm_lead' && <Users className="w-4 h-4 text-blue-500" />}
                            {result.entity_type === 'finance_invoice' && <FileText className="w-4 h-4 text-green-500" />}
                            {result.entity_type === 'channel_pinned_task' && <Pin className="w-4 h-4 text-orange-500" />}
                            {!['crm_lead', 'finance_invoice', 'channel_pinned_task'].includes(result.entity_type || '') && <Globe className="w-4 h-4 text-muted-foreground" />}
                            <span className="font-semibold text-foreground capitalize group-hover:text-brand">{result.entity_type || 'Result'}</span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 ps-6">
                           {String(result.data?.title || result.data?.name || result.data?.description || result.content || (isRtl ? "لا توجد تفاصيل" : "No details available"))}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        
        <div className="bg-background px-4 py-3 text-xs text-muted-foreground border-t border-border flex justify-between items-center">
          <span>{isRtl ? "ابحث في التنقل والإجراءات والقنوات" : "Search navigation, actions, and channels"}</span>
          <span className="font-mono bg-slate-200 px-1.5 py-0.5 rounded text-muted-foreground">Septimus OS</span>
        </div>
      </div>
    </div>
  );
}
