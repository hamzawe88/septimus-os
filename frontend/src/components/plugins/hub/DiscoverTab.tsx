"use client";

import React, { useState } from "react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { Search, Puzzle, Settings, Download, CheckCircle2, AlertCircle } from "lucide-react";
import IntegrationConfigModal from "./IntegrationConfigModal";

interface Plugin {
  id: string;
  name: string;
  description: string;
  category: "all" | "finance" | "communication" | "marketing" | "productivity";
  status: "installed" | "available" | "update";
  icon: string;
  version: string;
}

const mockPlugins: Plugin[] = [
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    description: "Connect your WhatsApp Business API to send and receive messages directly from the CRM.",
    category: "communication",
    status: "installed",
    icon: "💬",
    version: "1.0.5"
  },
  {
    id: "slack",
    name: "Slack Integration",
    description: "Receive notifications and interact with Septimus OS directly from your Slack workspace.",
    category: "communication",
    status: "available",
    icon: "📱",
    version: "1.2.0"
  },
  {
    id: "stripe",
    name: "Stripe Payments",
    description: "Accept credit cards and digital wallets natively within your invoices.",
    category: "finance",
    status: "available",
    icon: "💳",
    version: "3.0.1"
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    description: "Sync your CRM contacts and leads automatically to Mailchimp audiences.",
    category: "marketing",
    status: "available",
    icon: "📧",
    version: "1.1.0"
  },
  {
    id: "jira",
    name: "Jira Software",
    description: "Two-way sync between Septimus tasks and Jira issues for your engineering team.",
    category: "productivity",
    status: "installed",
    icon: "🎫",
    version: "2.0.0"
  },
  {
    id: "gdrive",
    name: "Google Drive",
    description: "Attach files directly from Google Drive to your WorkDocs and Tasks.",
    category: "productivity",
    status: "update",
    icon: "☁️",
    version: "1.5.2"
  },
  {
    id: "meta_ads",
    name: "Meta Ads Manager",
    description: "Track ad spend, impressions, and automatically import leads from Facebook and Instagram.",
    category: "marketing",
    status: "available",
    icon: "📊",
    version: "1.0.0"
  }
];

export default function DiscoverTab() {
  const { t, isRtl } = useLocalization();
  const [plugins, setPlugins] = useState<Plugin[]>(mockPlugins);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<Plugin["category"]>("all");
  const [selectedAppForConfig, setSelectedAppForConfig] = useState<Plugin | null>(null);

  const categories: { id: Plugin["category"]; label: string }[] = [
    { id: "all", label: t("plugins.categoryAll") },
    { id: "finance", label: t("plugins.categoryFinance") },
    { id: "communication", label: t("plugins.categoryCommunication") },
    { id: "marketing", label: t("plugins.categoryMarketing") },
    { id: "productivity", label: t("plugins.categoryProductivity") }
  ];

  const filteredPlugins = plugins.filter((plugin) => {
    const matchesCategory = activeCategory === "all" || plugin.category === activeCategory;
    const matchesSearch = plugin.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          plugin.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const translateName = (id: string, name: string) => {
    if (!isRtl) return name;
    switch (id) {
      case "whatsapp": return "واتساب للأعمال";
      case "slack": return "تكامل سلاك (Slack)";
      case "stripe": return "مدفوعات سترايب (Stripe)";
      case "mailchimp": return "ميل تشيمب (Mailchimp)";
      case "jira": return "جيرا (Jira Software)";
      case "gdrive": return "جوجل درايف";
      case "meta_ads": return "إعلانات ميتا (Meta Ads)";
      default: return name;
    }
  };

  const translateDescription = (id: string, desc: string) => {
    if (!isRtl) return desc;
    switch (id) {
      case "whatsapp": return "اربط حساب واتساب للأعمال الخاص بك لإرسال واستقبال الرسائل مباشرة من النظام.";
      case "slack": return "تلقى الإشعارات وتفاعل مع النظام مباشرة من مساحة عمل سلاك الخاصة بك.";
      case "stripe": return "استقبل المدفوعات بالبطاقات الائتمانية والمحافظ الرقمية في فواتيرك.";
      case "mailchimp": return "مزامنة جهات الاتصال والعملاء المحتملين تلقائيًا مع قوائم ميل تشيمب.";
      case "jira": return "مزامنة ثنائية الاتجاه بين مهام النظام وتذاكر جيرا لفريق الهندسة.";
      case "gdrive": return "قم بإرفاق الملفات مباشرة من جوجل درايف إلى مستندات العمل والمهام.";
      case "meta_ads": return "تتبع الإنفاق الإعلاني واستيراد العملاء المحتملين تلقائيًا من فيسبوك وإنستجرام.";
      default: return desc;
    }
  };

  const handleConfigSuccess = () => {
    if (selectedAppForConfig) {
      setPlugins(prev => prev.map(p => p.id === selectedAppForConfig.id ? { ...p, status: "installed" } : p));
    }
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="p-8 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto">
          {/* Search and Filters */}
          <div className="mt-8 flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto hide-scrollbar">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                    activeCategory === cat.id
                      ? "bg-brand text-white shadow-md shadow-brand/20"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-80">
              <div className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                placeholder={t("plugins.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#222529] border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/50 text-slate-800 dark:text-slate-200 ps-10"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Plugin Grid */}
      <div className="p-8 max-w-7xl mx-auto w-full">
        {filteredPlugins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Puzzle className="w-16 h-16 mb-4 opacity-20" />
            <h3 className="text-xl font-bold mb-2">
              {t("plugins.noPluginsFound")}
            </h3>
            <p>{t("plugins.tryDifferentSearch")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredPlugins.map((plugin) => (
              <div 
                key={plugin.id} 
                className="bg-white dark:bg-[#1a1d21] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col hover:shadow-xl hover:border-brand/30 transition-all group"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="w-14 h-14 bg-slate-50 dark:bg-[#222529] rounded-2xl flex items-center justify-center text-3xl border border-slate-100 dark:border-slate-800 group-hover:scale-110 transition-transform">
                    {plugin.icon}
                  </div>
                  {plugin.status === "installed" && (
                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-1 rounded-full border border-emerald-100 dark:border-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t("plugins.installed")}
                    </span>
                  )}
                  {plugin.status === "update" && (
                    <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-1 rounded-full border border-amber-100 dark:border-amber-800">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {t("plugins.updateAvailable")}
                    </span>
                  )}
                </div>
                
                <h3 className="text-lg font-black text-slate-800 dark:text-white mb-2">
                  {translateName(plugin.id, plugin.name)}
                </h3>
                
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 flex-1 line-clamp-3">
                  {translateDescription(plugin.id, plugin.description)}
                </p>

                <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-mono text-slate-400">
                    v{plugin.version}
                  </span>
                  
                  {plugin.status === "installed" || plugin.status === "update" ? (
                    <button 
                      onClick={() => setSelectedAppForConfig(plugin)}
                      className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-brand dark:hover:text-brand transition-colors bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 px-4 py-2 rounded-xl"
                    >
                      <Settings className="w-4 h-4" />
                      {t("plugins.settings")}
                    </button>
                  ) : (
                    <button 
                      onClick={() => setSelectedAppForConfig(plugin)}
                      className="flex items-center gap-2 text-sm font-bold text-white bg-brand hover:bg-brand-hover shadow-md shadow-brand/20 transition-all px-4 py-2 rounded-xl"
                    >
                      <Download className="w-4 h-4" />
                      {t("plugins.install")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <IntegrationConfigModal
        app={selectedAppForConfig}
        isOpen={!!selectedAppForConfig}
        onClose={() => setSelectedAppForConfig(null)}
        onSuccess={handleConfigSuccess}
      />
    </div>
  );
}
