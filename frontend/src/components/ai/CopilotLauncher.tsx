"use client";

import React, { useState, useEffect } from 'react';
import AgentChatDrawer from '@/components/ai/AgentChatDrawer';

/**
 * Septimus Copilot — controlled by SmartActionHub or Cmd/Ctrl+I.
 * Streams its replies live via AgentChatDrawer without duplicate floating triggers.
 */
export default function CopilotLauncher() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    };
    const onOpen = () => setIsOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-copilot', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-copilot', onOpen);
    };
  }, []);

  return (
    <AgentChatDrawer
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      agentType="supervisor"
      title="Septimus Copilot"
    />
  );
}
