"use client";

import React, { useState, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useToastStore } from "@/store/useToastStore";
import DocumentUploadModal from "./shared/DocumentUploadModal";
import NewChannelModal from "./shared/NewChannelModal";
import NewDmModal from "./shared/NewDmModal";
import ChatDock from "./chat/ChatDock";

import CatchUpModal from "./chat/CatchUpModal";
import GlobalSearchModal from "./chat/GlobalSearchModal";
import CopilotLauncher from "./ai/CopilotLauncher";
import { ToastContainer } from "./shared/ToastContainer";
import UpgradeModal from "./billing/UpgradeModal";

interface TierGateDetail {
  error?: string;
  required_tier?: string;
  current_tier?: string;
  message?: string;
}

export default function GlobalModals() {
  const { 
    isLoggedIn,
    isDocumentModalOpen, setIsDocumentModalOpen,
    isNewChannelModalOpen, setIsNewChannelModalOpen,
    isNewDmModalOpen, setIsNewDmModalOpen,
    isCatchUpModalOpen, setIsCatchUpModalOpen
  } = useAppStore();

  const { toast } = useToastStore();

  const [tierGateInfo, setTierGateInfo] = useState<{
    isOpen: boolean;
    requiredTier: string;
    currentTier: string;
  }>({
    isOpen: false,
    requiredTier: "business",
    currentTier: "free",
  });

  useEffect(() => {
    // Listen for 402 Tier Gate triggers dispatched by apiClient.ts
    const handleTierGate = (e: Event) => {
      const customEvent = e as CustomEvent<TierGateDetail>;
      const detail = customEvent.detail || {};
      setTierGateInfo({
        isOpen: true,
        requiredTier: detail.required_tier || "business",
        currentTier: detail.current_tier || "free",
      });
    };

    // Listen for WebSocket / NATS real-time subscription upgrade broadcasts
    const handleWsMessage = (e: Event) => {
      const customEvent = e as CustomEvent<{ event?: string; type?: string; tier?: string; workspace_id?: string }>;
      const detail = customEvent.detail || {};
      const eventType = detail.event || detail.type;

      if (eventType === "events.billing.upgraded" || eventType === "simulated.tier.upgrade") {
        const upgradedTier = detail.tier || "Enterprise";
        toast.success(`🎉 Workspace subscription successfully upgraded to ${upgradedTier.toUpperCase()} Plan!`, 6000);
        // Dispatch event for active billing dashboard or tier badges to auto-refresh
        window.dispatchEvent(new Event("septimus:subscription-refreshed"));
      }
    };

    window.addEventListener("septimus:tier-gate", handleTierGate);
    window.addEventListener("ws-message", handleWsMessage);

    return () => {
      window.removeEventListener("septimus:tier-gate", handleTierGate);
      window.removeEventListener("ws-message", handleWsMessage);
    };
  }, [toast]);

  return (
    <>
      {isDocumentModalOpen && (
        <DocumentUploadModal 
          isOpen={isDocumentModalOpen} 
          onClose={() => setIsDocumentModalOpen(false)} 
        />
      )}
      
      {isNewChannelModalOpen && (
        <NewChannelModal 
          onClose={() => setIsNewChannelModalOpen(false)} 
        />
      )}

      {isNewDmModalOpen && (
        <NewDmModal 
          onClose={() => setIsNewDmModalOpen(false)} 
        />
      )}

      {isCatchUpModalOpen && (
        <CatchUpModal 
          isOpen={isCatchUpModalOpen}
          onClose={() => setIsCatchUpModalOpen(false)} 
        />
      )}

      {/* Floating Chat System */}
      {isLoggedIn && <ChatDock />}

      {/* Septimus Copilot (supervisor agent, ⌘I) */}
      {isLoggedIn && <CopilotLauncher />}

      {/* Global Search */}
      <GlobalSearchModal />

      {/* Global Toast Notifications */}
      <ToastContainer />

      {/* Global Feature Tier Gate Modal (Triggered on HTTP 402) */}
      <UpgradeModal
        isOpen={tierGateInfo.isOpen}
        onClose={() => setTierGateInfo((prev) => ({ ...prev, isOpen: false }))}
        requiredTier={tierGateInfo.requiredTier}
        currentTier={tierGateInfo.currentTier}
      />
    </>
  );
}
