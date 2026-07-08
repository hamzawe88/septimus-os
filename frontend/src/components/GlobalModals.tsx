"use client";

import React from "react";
import { useAppStore } from "@/store/useAppStore";
import DocumentUploadModal from "./shared/DocumentUploadModal";
import NewChannelModal from "./shared/NewChannelModal";
import NewDmModal from "./shared/NewDmModal";
import ChatDock from "./chat/ChatDock";

import CatchUpModal from "./chat/CatchUpModal";
import GlobalSearchModal from "./chat/GlobalSearchModal";
import { ToastContainer } from "./shared/ToastContainer";

export default function GlobalModals() {
  const { 
    isLoggedIn,
    isDocumentModalOpen, setIsDocumentModalOpen,
    isNewChannelModalOpen, setIsNewChannelModalOpen,
    isNewDmModalOpen, setIsNewDmModalOpen,
    isCatchUpModalOpen, setIsCatchUpModalOpen
  } = useAppStore();

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

      {/* Global Search */}
      <GlobalSearchModal />

      {/* Global Toast Notifications */}
      <ToastContainer />
    </>
  );
}
