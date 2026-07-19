"use client";

import React, { useState } from "react";
import { Sparkles, Zap, Lock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiPost } from "@/lib/apiClient";
import { CheckoutSessionResponse } from "@/types/billing";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  requiredTier: string;
  currentTier?: string;
  featureName?: string;
}

export default function UpgradeModal({
  isOpen,
  onClose,
  requiredTier = "business",
  currentTier = "free",
  featureName = "AI Miner & Advanced Autonomous Workflows",
}: UpgradeModalProps) {
  const [loading, setLoading] = useState(false);

  const handleQuickUpgrade = async () => {
    setLoading(true);
    try {
      const res = await apiPost("/api/v1/billing/checkout", {
        tier: requiredTier,
        return_url: window.location.href,
        simulated: true,
      }) as CheckoutSessionResponse;

      if (res && res.url) {
        window.location.href = res.url;
      }
    } catch (err) {
      console.error("Upgrade checkout error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border border-purple-500/30 text-white max-w-lg rounded-2xl shadow-2xl p-6 overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />

        <DialogHeader className="space-y-3 relative z-10">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-purple-400 mb-1">
            <Lock className="w-6 h-6" />
          </div>
          <DialogTitle className="text-2xl font-black text-white flex items-center gap-2 tracking-tight">
            Feature Tier Gate
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-gradient-to-r from-purple-500 to-indigo-500 text-white">
              {requiredTier} Required
            </span>
          </DialogTitle>
          <DialogDescription className="text-gray-300 text-sm leading-relaxed">
            You are attempting to access <strong className="text-purple-300 font-semibold">{featureName}</strong>, which requires the <span className="uppercase font-bold text-white">{requiredTier}</span> subscription plan. Your workspace is currently on <span className="uppercase font-bold text-gray-400">{currentTier}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-purple-950/40 border border-purple-500/20 rounded-xl p-4 my-4 space-y-2.5 relative z-10">
          <h4 className="text-xs font-bold uppercase text-purple-300 tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-purple-400" />
            Unlocks immediately upon upgrade:
          </h4>
          <ul className="text-xs text-gray-200 space-y-1.5 font-sans">
            <li className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
              Unlimited Diwan correspondence & legal AI auditing
            </li>
            <li className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
              Autonomous NATS multi-agent execution
            </li>
            <li className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
              Row-Level Security (`RLS`) compliance guarantee
            </li>
          </ul>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-3 pt-2 relative z-10">
          <Button
            onClick={onClose}
            variant="outline"
            className="border-gray-700 hover:bg-gray-800 text-gray-300 w-full sm:w-auto text-xs"
          >
            Stay on {currentTier.toUpperCase()}
          </Button>
          <Button
            onClick={handleQuickUpgrade}
            disabled={loading}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs px-6 py-5 shadow-lg shadow-purple-600/30 flex-1 flex items-center justify-center gap-2"
          >
            {loading ? (
              <span>Preparing Checkout...</span>
            ) : (
              <>
                <span>Instant Upgrade to {requiredTier.toUpperCase()} Pro</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
