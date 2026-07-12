import React, { useState } from "react";
import { Award, Sparkles, Share2, Flame, CheckCircle, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocalization } from "@/contexts/LocalizationContext";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { OrbitProfile } from "./types";

interface GamificationColumnProps {
  profile: OrbitProfile;
  onUpdateEnergyMode: (mode: string) => Promise<void>;
  onRefreshProfile?: () => void;
}

export default function GamificationColumn({
  profile,
  onUpdateEnergyMode,
  onRefreshProfile,
}: GamificationColumnProps) {
  const { t, language } = useLocalization();
  const [isHarvesting, setIsHarvesting] = useState(false);
  const [harvestData, setHarvestData] = useState<{
    summary: string;
    completed_count: number;
    xp_earned: number;
  } | null>(null);
  const [isHarvestModalOpen, setIsHarvestModalOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

  // Calculate XP progress for the current level (each level requires 200 XP)
  const xpInCurrentLevel = profile.xp % 200;
  const progressPercent = Math.min(100, Math.max(0, (xpInCurrentLevel / 200) * 100));

  const handleGenerateHarvest = async () => {
    setIsHarvesting(true);
    setShareSuccess(false);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/orbit/harvest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: language === "ar" ? "ar" : "en" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.summary) {
        setHarvestData({
          summary: data.summary,
          completed_count: data.completed_count || 0,
          xp_earned: data.xp_earned || 0,
        });
        setIsHarvestModalOpen(true);
      }
    } catch (err) {
      console.error("Failed to generate harvest:", err);
    } finally {
      setIsHarvesting(false);
      if (onRefreshProfile) onRefreshProfile();
    }
  };

  const handleShareToChannel = async () => {
    if (!harvestData || isSharing) return;
    setIsSharing(true);
    try {
      // Find #general channel or first available channel
      const chRes = await fetchWithAuth(`${API_BASE_URL}/channels`, { method: "GET" });
      const chData = await chRes.json().catch(() => ({}));
      const channels = chData.channels || [];
      const generalCh = channels.find((c: { id: string; name?: string }) => c.name?.toLowerCase().includes("general")) || channels[0];

      if (generalCh) {
        await fetchWithAuth(`${API_BASE_URL}/channels/${generalCh.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: harvestData.summary }),
        });
      }
      setShareSuccess(true);
    } catch (err) {
      console.error("Failed to share harvest:", err);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-800/50 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Award className="w-4 h-4 text-amber-500" />
          {t("my_orbit.gamification_title", "Productivity Pulse")}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
        {/* Level Ring & XP Meter */}
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-xs text-center relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center justify-between mb-3">
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30 font-mono font-bold">
              Level {profile.level}
            </span>
            <span className="text-xs font-mono text-brand dark:text-blue-400 font-semibold">
              Total XP: {profile.xp}
            </span>
          </div>

          <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">
            {profile.level_title || "Novice Cadet 🌟"}
          </h4>

          {/* Progress bar */}
          <div className="w-full bg-slate-200 dark:bg-slate-800 h-3 rounded-full overflow-hidden p-0.5 mb-2">
            <div
              className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-brand rounded-full transition-all duration-500 shadow-2xs"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1 font-mono">
            <span>{xpInCurrentLevel} / 200 XP</span>
            <span className="text-slate-400 dark:text-slate-600">•</span>
            <span>{200 - xpInCurrentLevel} {t("my_orbit.xp_to_next", "XP to next level")}</span>
          </p>
        </div>

        {/* Daily Energy Mode Selector */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-xs space-y-3">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
            {t("my_orbit.energy_mode_title", "Daily Energy Selector")}
          </label>

          <div className="space-y-2">
            <button
              onClick={() => onUpdateEnergyMode("HIGH_ENERGY")}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl border flex items-center justify-between transition-all ${
                profile.daily_energy_mode === "HIGH_ENERGY"
                  ? "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-500/15 dark:border-amber-500/50 dark:text-amber-300 shadow-2xs font-semibold"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <span className="text-xs font-medium">
                {t("my_orbit.mode_high_energy", "⚡ High Energy (Complex Architecture & Coding)")}
              </span>
              {profile.daily_energy_mode === "HIGH_ENERGY" && (
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              )}
            </button>
            <button
              onClick={() => onUpdateEnergyMode("DEEP_FOCUS")}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl border flex items-center justify-between transition-all ${
                profile.daily_energy_mode === "DEEP_FOCUS"
                  ? "bg-purple-50 border-purple-300 text-purple-900 dark:bg-purple-500/15 dark:border-purple-500/50 dark:text-purple-300 shadow-2xs font-semibold"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <span className="text-xs font-medium">
                {t("my_orbit.mode_deep_focus", "🧠 Deep Focus (Zen Single-Tasking)")}
              </span>
              {profile.daily_energy_mode === "DEEP_FOCUS" && (
                <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
              )}
            </button>
            <button
              onClick={() => onUpdateEnergyMode("LIGHT")}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl border flex items-center justify-between transition-all ${
                profile.daily_energy_mode === "LIGHT"
                  ? "bg-blue-50 border-blue-300 text-blue-900 dark:bg-blue-500/15 dark:border-blue-500/50 dark:text-blue-300 shadow-2xs font-semibold"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <span className="text-xs font-medium">
                {t("my_orbit.mode_light", "☕ Light Maintenance (Quick Approvals & 5m Reviews)")}
              </span>
              {profile.daily_energy_mode === "LIGHT" && (
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
              )}
            </button>
          </div>
        </div>

        {/* Earned Badges Grid */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-xs space-y-3">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
            {t("my_orbit.earned_badges", "Earned Badges Showcase")}
          </label>

          {(!profile.earned_badges || profile.earned_badges.length === 0) ? (
            <p className="text-xs text-slate-500 text-center py-4 italic">
              {t("my_orbit.no_badges", "Complete tasks and level up to unlock badges!")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {profile.earned_badges.map((badge, idx) => (
                <div
                  key={idx}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 font-semibold flex items-center gap-1.5 shadow-2xs"
                >
                  <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>{badge.replace(/_/g, " ")}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Weekly Harvest Generator Card */}
        <div className="bg-gradient-to-br from-slate-50 via-white to-blue-50/40 dark:from-slate-900 dark:via-slate-800 dark:to-blue-950/40 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-xs text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-brand/10 border border-brand/20 dark:bg-blue-500/10 dark:border-blue-500/30 flex items-center justify-center mx-auto text-brand dark:text-blue-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            {t("my_orbit.weekly_harvest_title", "AI Weekly Harvest")}
          </h4>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {t("my_orbit.weekly_harvest_desc", "One-click executive report summarizing all completed tasks and achievements this week.")}
          </p>
          <Button
            onClick={handleGenerateHarvest}
            disabled={isHarvesting}
            className="w-full bg-brand hover:bg-brand-dark text-white font-medium text-xs rounded-xl py-2.5 shadow-sm flex items-center justify-center gap-2"
          >
            {isHarvesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>{t("my_orbit.generate_harvest_btn", "✨ Generate Weekly Harvest")}</span>
          </Button>
        </div>
      </div>

      {/* Harvest Modal */}
      {isHarvestModalOpen && harvestData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                {t("my_orbit.harvest_modal_title", "🎯 My Weekly Orbit Harvest")}
              </h3>
              <button
                onClick={() => setIsHarvestModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-sans whitespace-pre-wrap">
              {harvestData.summary}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsHarvestModalOpen(false)}
                className="rounded-xl border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs"
              >
                Close
              </Button>
              <Button
                onClick={handleShareToChannel}
                disabled={isSharing || shareSuccess}
                className="bg-brand hover:bg-brand-dark text-white rounded-xl text-xs flex items-center gap-1.5 shadow-sm"
              >
                {isSharing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : shareSuccess ? (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Share2 className="w-3.5 h-3.5" />
                )}
                <span>
                  {shareSuccess
                    ? t("my_orbit.shared_success", "Shared Successfully!")
                    : t("my_orbit.share_to_channel_btn", "📢 Share to Team Channel (#general)")}
                </span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
