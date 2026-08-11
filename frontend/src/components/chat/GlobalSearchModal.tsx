import React, { useState, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { Search, X, MessageSquare } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
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
  const { t } = useLocalization();
  const { isGlobalSearchOpen, setIsGlobalSearchOpen } = useAppStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const handleOpenSearch = (e: Event) => {
      const customEvent = e as CustomEvent<{ query: string }>;
      if (customEvent.detail?.query) {
        setSearchQuery(customEvent.detail.query);
      }
      setIsGlobalSearchOpen(true);
    };
    window.addEventListener("septimus:open-global-search", handleOpenSearch);
    return () => window.removeEventListener("septimus:open-global-search", handleOpenSearch);
  }, [setIsGlobalSearchOpen]);

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
    <div className="fixed inset-0 z-[200] flex items-start justify-center bg-overlay/60 px-4 pt-[10vh] backdrop-blur-sm">
      <div
        aria-label={t("chat.globalSearch.title")}
        aria-modal="true"
        className="relative flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-surface)] border border-border bg-popover text-popover-foreground shadow-[var(--shadow-overlay)]"
        role="dialog"
      >
        <div className="flex items-center border-b border-border bg-popover px-4 py-3">
          <Search className="me-3 size-5 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            type="text"
            placeholder={t("chat.globalSearch.placeholder")}
            className="min-w-0 flex-1 border-none bg-transparent text-lg text-foreground outline-none placeholder:text-muted-foreground"
            value={searchQuery}
            aria-label={t("chat.globalSearch.inputLabel")}
            onChange={(e) => {
              const value = e.target.value;
              setSearchQuery(value);
              if (value.trim().length < 2) setResults([]);
            }}
          />
          <button
            type="button"
            onClick={() => setIsGlobalSearchOpen(false)}
            className="ms-2 rounded-[var(--radius-control)] p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={t("chat.globalSearch.close")}
          >
            <X className="size-5" />
          </button>
        </div>

        <ScrollArea className="flex-1 p-2">
          {searchQuery.trim().length > 0 ? (
            <div className="py-2">
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                {t("chat.globalSearch.results")}
              </h3>
              {isSearching ? (
                <div className="space-y-2 p-3" aria-label={t("chat.globalSearch.searching")}>
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : results.length === 0 ? (
                <EmptyState
                  icon={<Search aria-hidden />}
                  title={t("chat.globalSearch.noResults")}
                  description={`${t("chat.globalSearch.noResultsFor")} “${searchQuery}”`}
                  className="border-0 py-8 shadow-none"
                />
              ) : (
                results.map((res, idx) => (
                  <button
                    type="button"
                    key={res.ID || idx}
                    className="group flex w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-3 text-start transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-muted text-muted-foreground transition-colors group-hover:text-brand">
                      <MessageSquare className="size-4" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">
                          {res.User?.Email || res.AIAgentRole || t("chat.system")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t("chat.globalSearch.inChannel")} {res.Channel?.Name || t("chat.globalSearch.unknownChannel")}
                        </span>
                      </div>
                      <div className="truncate text-sm text-muted-foreground">{res.Content}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <EmptyState
              icon={<Search aria-hidden />}
              title={t("chat.globalSearch.emptyTitle")}
              description={t("chat.globalSearch.emptyDescription")}
              className="border-0 py-12 shadow-none"
            />
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
