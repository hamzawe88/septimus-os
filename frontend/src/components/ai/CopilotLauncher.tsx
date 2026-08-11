"use client";

import React, { useState, useEffect } from 'react';
import AgentChatDrawer, { AgentType } from '@/components/ai/AgentChatDrawer';

/**
 * Septimus Copilot — controlled by SmartActionHub or Cmd/Ctrl+I.
 * Streams its replies live via AgentChatDrawer without duplicate floating triggers.
 */
export default function CopilotLauncher() {
  const [isOpen, setIsOpen] = useState(false);
  const [agentType, setAgentType] = useState<AgentType>('supervisor');
  const [title, setTitle] = useState('Septimus Copilot');
  const [contextData, setContextData] = useState<Record<string, unknown> | undefined>(undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    };
    const onOpen = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setAgentType(customEvent.detail.agentType || 'supervisor');
        setTitle(customEvent.detail.title || 'Septimus Copilot');
        setContextData(customEvent.detail.contextData);
      } else {
        setAgentType('supervisor');
        setTitle('Septimus Copilot');
        setContextData(undefined);
      }
      setIsOpen(true);
    };
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
      agentType={agentType}
      title={title}
      contextData={contextData}
    />
  );
}
