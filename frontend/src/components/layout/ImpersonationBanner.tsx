"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { useLocalization } from "@/contexts/LocalizationContext";
import { ShieldAlert } from "lucide-react";
import { API_BASE_URL, fetchWithAuth } from "@/lib/apiClient";

export default function ImpersonationBanner() {
  const router = useRouter();
  const { isImpersonated, setIsImpersonated, setOriginalAdminId } = useAppStore();
  const { t, isRtl } = useLocalization();

  if (!isImpersonated) return null;

  const handleEndSession = async () => {
    localStorage.removeItem("septimus_user");
    try {
      await fetchWithAuth(`${API_BASE_URL}/auth/logout`, { method: "POST" });
    } finally {
      setIsImpersonated(false);
      setOriginalAdminId(null);
      router.replace("/");
      router.refresh();
    }
  };

  return (
    <div className={`w-full bg-red-600/90 backdrop-blur text-white flex items-center justify-between px-4 py-2 text-sm font-medium shadow-md z-[100] relative`}>
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-5 h-5 animate-pulse" />
        <span>
          {t("impersonation.message")}
        </span>
      </div>
      <button 
        onClick={handleEndSession}
        className={`bg-card text-red-600 px-3 py-1 rounded shadow-sm hover:bg-red-50 transition-colors ${isRtl ? "font-cairo" : ""}`}
      >
        {t("impersonation.endSession")}
      </button>
    </div>
  );
}
