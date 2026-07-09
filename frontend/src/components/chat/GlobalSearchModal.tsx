import React, { useState, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { Search, X, MessageSquare } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from "@/contexts/LocalizationContext";

interface SearchResult {
  ID?: string;
  Content?: string;
  AIAgentRole?: string;
  User?: { Email?: string };
  Channel?: { Name?: string };
}

export default function GlobalSearchModal() {
  const { isRtl } = useLocalization();
  const { isGlobalSearchOpen, setIsGlobalSearchOpen } = useAppStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
                const res = await fetchWithAuth(`${API_BASE_URL}/search/messages?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data || []);
        }
      } catch (err) {
        console.error("Search error", err);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (!isGlobalSearchOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh] bg-black/60 backdrop-blur-sm px-4">
      <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh]">
        
        {/* Search Header */}
        <div className="flex items-center px-4 py-3 border-b border-slate-200 bg-white">
          <Search className="w-5 h-5 text-slate-400 me-3" />
          <input
            autoFocus
            type="text"
            placeholder={isRtl ? "ابحث في القنوات والرسائل والأشخاص..." : "Search channels, messages, or people..."}
            className="flex-1 bg-transparent border-none outline-none text-slate-900 placeholder-slate-400 text-lg"
            value={searchQuery}
            onChange={(e) => {
              const value = e.target.value;
              setSearchQuery(value);
              if (value.trim().length < 2) setResults([]);
            }}
          />
          <button 
            onClick={() => setIsGlobalSearchOpen(false)}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors ms-2"
            aria-label={isRtl ? "إغلاق البحث الشامل" : "Close Global Search"}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Results */}
        <ScrollArea className="flex-1 p-2">
          {searchQuery.trim().length > 0 ? (
            <div className="py-2">
              <h3 className="px-3 text-xs font-semibold text-[var(--sb-bg)] uppercase tracking-wider mb-2">{isRtl ? "النتائج" : "Results"}</h3>
              {isSearching ? (
                <div className="p-4 text-sm text-slate-500 text-center">{isRtl ? "جارِ البحث..." : "Searching..."}</div>
              ) : results.length === 0 ? (
                <div className="p-4 text-sm text-slate-500 text-center">{isRtl ? "لا نتائج لـ" : "No results found for"} &quot;{searchQuery}&quot;</div>
              ) : (
                results.map((res, idx) => (
                  <button
                    key={res.ID || idx}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-slate-50 focus:bg-slate-100 transition-colors text-start group"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded bg-slate-100 text-slate-500 group-hover:text-[var(--sb-bg)] transition-colors shrink-0">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-900 font-medium">
                          {res.User?.Email || res.AIAgentRole || "System"}
                        </span>
                        <span className="text-slate-500 text-xs">
                          {isRtl ? "في" : "in"} {res.Channel?.Name || (isRtl ? "غير معروف" : "Unknown")}
                        </span>
                      </div>
                      <div className="text-slate-500 text-sm truncate">{res.Content}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400">
              <Search className="w-12 h-12 mb-4 opacity-20" />
              <p>{isRtl ? "اكتب للبحث في مساحة العمل" : "Type to search across your workspace"}</p>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
