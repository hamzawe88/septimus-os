"use client";

import React, { useState } from "react";
import { 
  X, 
  Search, 
  Plus, 
  Check, 
  Sparkles, 
  Cpu, 
  Users, 
  DollarSign, 
  Briefcase, 
  ShieldCheck, 
  Workflow, 
  MessageSquare, 
  BookOpen, 
  Globe 
} from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";

export interface WidgetDefinition {
  id: string;
  nameKey: string;
  descriptionKey: string;
  category: "all" | "ai" | "finance" | "hr" | "crm" | "ops" | "security";
  defaultSpan: "col-span-1" | "col-span-1 md:col-span-2" | "col-span-1 md:col-span-2 lg:col-span-3";
  iconName: string;
  component: React.ComponentType;
}

interface WidgetMarketplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableWidgets: WidgetDefinition[];
  activeWidgets: string[];
  onAddWidget: (id: string) => void;
  onRemoveWidget: (id: string) => void;
}

export default function WidgetMarketplaceModal({
  isOpen,
  onClose,
  availableWidgets,
  activeWidgets,
  onAddWidget,
  onRemoveWidget,
}: WidgetMarketplaceModalProps) {
  const { t } = useLocalization();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");

  if (!isOpen) return null;

  const categories = [
    { id: "all", label: t("dashboard.marketplace.all"), icon: Sparkles },
    { id: "ai", label: t("dashboard.marketplace.aiAutomation"), icon: Cpu },
    { id: "finance", label: t("dashboard.marketplace.financeHr"), icon: DollarSign },
    { id: "hr", label: t("dashboard.marketplace.hrPeople"), icon: Users },
    { id: "crm", label: t("dashboard.marketplace.salesCrm"), icon: Briefcase },
    { id: "ops", label: t("dashboard.marketplace.operationsPm"), icon: Workflow },
    { id: "security", label: t("dashboard.marketplace.itSecurity"), icon: ShieldCheck },
  ];

  const getWidgetIcon = (iconName: string) => {
    switch (iconName) {
      case "cpu": return <Cpu className="w-5 h-5 text-brand" />;
      case "users": return <Users className="w-5 h-5 text-success" />;
      case "dollar": return <DollarSign className="w-5 h-5 text-info" />;
      case "briefcase": return <Briefcase className="w-5 h-5 text-warning" />;
      case "workflow": return <Workflow className="w-5 h-5 text-brand" />;
      case "shield": return <ShieldCheck className="w-5 h-5 text-destructive" />;
      case "message": return <MessageSquare className="w-5 h-5 text-brand" />;
      case "book": return <BookOpen className="w-5 h-5 text-info" />;
      case "globe": return <Globe className="w-5 h-5 text-success" />;
      default: return <Sparkles className="w-5 h-5 text-brand" />;
    }
  };

  const filteredWidgets = availableWidgets.filter((w) => {
    const localizedName = t(w.nameKey);
    const localizedDesc = t(w.descriptionKey);
    const matchesCategory = activeTab === "all" || w.category === activeTab;
    const matchesSearch =
      localizedName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      localizedDesc.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/55 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        data-testid="widget-marketplace"
        role="dialog"
        aria-modal="true"
        aria-labelledby="widget-marketplace-title"
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-[var(--radius-surface)] border border-border bg-popover text-popover-foreground shadow-[var(--shadow-overlay)] animate-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/35 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-[var(--radius-control)] bg-brand text-brand-foreground shadow-[var(--shadow-raised)]">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 id="widget-marketplace-title" className="text-lg font-bold">
                {t("dashboard.marketplace.title")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("dashboard.marketplace.subtitle")}
              </p>
            </div>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            aria-label={t("common.close")}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Search Bar & Categories */}
        <div className="flex flex-col gap-4 border-b border-border p-6 pb-3">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t("dashboard.marketplace.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full ps-10 pe-4"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeTab === cat.id;
              return (
                <Button
                  key={cat.id}
                  onClick={() => setActiveTab(cat.id)}
                  variant={isActive ? "default" : "secondary"}
                  size="sm"
                  aria-pressed={isActive}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Widgets Grid */}
        <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredWidgets.length === 0 ? (
            <EmptyState
              className="col-span-full"
              icon={<Search />}
              title={t("dashboard.marketplace.noResultsTitle")}
              description={t("dashboard.marketplace.noResultsDesc")}
            />
          ) : (
            filteredWidgets.map((widget) => {
              const isAdded = activeWidgets.includes(widget.id);
              return (
                <div 
                  key={widget.id}
                  className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                    isAdded 
                      ? "border-brand/30 bg-brand-light shadow-[var(--shadow-raised)]"
                      : "border-border bg-card hover:border-brand/30 hover:shadow-[var(--shadow-raised)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border bg-muted">
                        {getWidgetIcon(widget.iconName)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold">
                          {t(widget.nameKey)}
                          </h3>
                          <span className="rounded-[var(--radius-control)] bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                            {widget.defaultSpan.includes("md:col-span-2") ? t("dashboard.gridWide") : t("dashboard.gridCompact")}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {t(widget.descriptionKey)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-end border-t border-border pt-3">
                    {isAdded ? (
                      <Button
                        onClick={() => onRemoveWidget(widget.id)}
                        variant="secondary"
                        size="sm"
                        className="group text-success hover:text-destructive"
                      >
                        <Check className="w-3.5 h-3.5 group-hover:hidden" />
                        <X className="w-3.5 h-3.5 hidden group-hover:inline" />
                        <span className="group-hover:hidden">{t("dashboard.marketplace.added")}</span>
                        <span className="hidden group-hover:inline">{t("dashboard.marketplace.remove")}</span>
                      </Button>
                    ) : (
                      <Button
                        onClick={() => onAddWidget(widget.id)}
                        size="sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t("dashboard.marketplace.add")}</span>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-border bg-muted/35 px-6 py-4">
          <span className="text-xs text-muted-foreground">
            {t("dashboard.marketplace.pinnedCount")} <strong className="font-bold text-foreground">{activeWidgets.length}</strong>
          </span>
          <Button
            onClick={onClose}
            variant="secondary"
          >
            {t("common.done")}
          </Button>
        </div>
      </div>
    </div>
  );
}
