import React, { useRef } from "react";
import Draggable from "react-draggable";
import { useAppStore } from "@/store/useAppStore";
import ChatWindow from "./ChatWindow";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function ChatDock() {
  const { floatingChats, removeFloatingChat, unreadDMs, setUnreadDMs, activeThread, isRagSidebarOpen, addFloatingChat } = useAppStore();

  const handleOpenChat = (id: string, name: string) => {
    if (unreadDMs[id]) {
      const newDms = { ...unreadDMs };
      delete newDms[id];
      setUnreadDMs(newDms);
    }
    addFloatingChat({ id, name });
  };

  const hasUnreadHeads = Object.entries(unreadDMs).some(
    ([id]) => !floatingChats.find(c => c.id === id)
  );

  const dragRef = useRef<HTMLDivElement>(null);

  return (
    <>
      {/* Fixed DM Chat Heads */}
      {hasUnreadHeads && (
        <Draggable nodeRef={dragRef} bounds="body">
          <div ref={dragRef} className="fixed bottom-6 left-6 z-[9999] flex flex-col gap-3 cursor-move touch-none">
          {Object.entries(unreadDMs).map(([id, data]) => {
            if (floatingChats.find(c => c.id === id)) return null;

            return (
              <button
                key={id}
                onClick={() => handleOpenChat(id, data.name)}
                className="relative rounded-full shadow-lg hover:scale-110 transition-transform focus:outline-none"
                aria-label={`Open chat with ${data.name}`}
                title={`Chat with ${data.name}`}
              >
                <Avatar className="w-12 h-12 border-2 border-white shadow-sm">
                  <AvatarFallback className="bg-brand-light text-brand font-bold">
                    {data.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute -top-1 -end-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white border-2 border-white">
                  {data.count}
                </span>
              </button>
            );
          })}
        </div>
        </Draggable>
      )}

      {/* Active Chat Windows - Fixed at bottom */}
      {floatingChats.length > 0 && (
        <div className={`fixed bottom-6 ${(activeThread || isRagSidebarOpen) ? "left-[340px]" : "left-6"} z-[9998] flex gap-4 transition-all duration-300 ease-in-out`} dir="ltr">
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
      )}
    </>
  );
}
