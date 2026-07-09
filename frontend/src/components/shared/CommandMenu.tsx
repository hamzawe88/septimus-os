"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, FileText, CheckSquare, Hash, Plus, Settings, MessageSquare, BarChart2, Briefcase, Zap, Terminal, Mic, MicOff } from "lucide-react";

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
export default function CommandMenu() {
  const { isRtl } = useLocalization();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isListening, setIsListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const { setCurrentView, setIsEntityModalOpen, channels, setActiveChannelId } = useAppStore();

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
    }
  }, [isOpen]);

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
        name: (isRtl ? `انضم إلى #${c.Name}` : `Join #${c.Name}`),
        icon: <Hash className="w-4 h-4" />,
        action: () => handleSelect(() => { setActiveChannelId(c.ID); setCurrentView("chat"); })
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
        className="w-full max-w-2xl bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-200/60 ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-4 border-b border-slate-100/80 bg-[#f8fafc]/50">
          <Search className="w-6 h-6 text-indigo-400 me-3 animate-pulse" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-slate-800 placeholder-slate-400 text-lg"
            placeholder={isRtl ? "اكتب أمراً أو ابحث..." : "Type a command or search..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button 
            onClick={toggleListen}
            className={`me-3 p-2 rounded-full transition-all duration-300 ${isListening ? 'bg-red-100 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse' : 'bg-slate-100 text-slate-500 hover:bg-brand-light hover:text-brand'}`}
            title={isRtl ? "تحدّث للبحث أو إنشاء مهمة" : "Speak to search or create a task"}
          >
            {isListening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>
          <kbd className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-500 bg-white shadow-sm rounded-md border border-slate-200 uppercase">
            ESC
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2 scrollbar-thin">
          {filteredCommands.length === 0 ? (
            <div className="py-14 text-center text-sm text-slate-500">
              {isRtl ? "لا نتائج لـ" : "No results found for"} <span className="font-medium text-slate-900">&quot;{query}&quot;</span>
            </div>
          ) : (
            filteredCommands.map((group, idx) => (
              <div key={idx} className="mb-4 last:mb-0">
                <div className="px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {group.group}
                </div>
                <div className="space-y-1">
                  {group.items.map((item, itemIdx) => (
                    <button
                      key={itemIdx}
                      onClick={item.action}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-[#dfb2e5]/10 hover:text-brand transition-colors text-start group"
                    >
                      <div className="text-slate-400 group-hover:text-brand transition-colors">
                        {item.icon}
                      </div>
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="bg-[#f8fafc] px-4 py-3 text-xs text-slate-500 border-t border-slate-100 flex justify-between items-center">
          <span>{isRtl ? "ابحث في التنقل والإجراءات والقنوات" : "Search navigation, actions, and channels"}</span>
          <span className="font-mono bg-slate-200 px-1.5 py-0.5 rounded text-slate-600">Septimus OS</span>
        </div>
      </div>
    </div>
  );
}
