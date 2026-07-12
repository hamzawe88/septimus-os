import React from "react";
import { useAppStore } from "@/store/useAppStore";
import ChatWindow from "./ChatWindow";

export default function ChatDock() {
  const { floatingChats, removeFloatingChat, activeThread, isRagSidebarOpen } = useAppStore();

  if (!floatingChats || floatingChats.length === 0) return null;

  const offsetClass = (activeThread || isRagSidebarOpen) ? "start-[350px]" : "start-[290px]";

  return (
    <div className={`fixed bottom-6 ${offsetClass} z-[9998] flex gap-4 transition-all duration-300 ease-in-out`} dir="ltr">
      {floatingChats.map(chat => (
        <div key={chat.id} className="transition-transform duration-300 ease-out animate-in slide-in-from-bottom-10">
          <ChatWindow 
            chatId={chat.id} 
            chatName={chat.name}
            onClose={() => removeFloatingChat(chat.id)} 
          />
        </div>
      ))}
    </div>
  );
}
