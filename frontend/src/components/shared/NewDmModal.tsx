"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Search, Loader2, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAppStore } from "@/store/useAppStore";
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from "@/contexts/LocalizationContext";

interface NewDmModalProps {
  onClose: () => void;
}

interface User {
  id: string;
  email: string;
  role: string;
}

export default function NewDmModal({ onClose }: NewDmModalProps) {
  const { isRtl } = useLocalization();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch users when search changes
  useEffect(() => {
    const fetchUsers = async () => {
      try {
                const res = await fetchWithAuth(`${API_BASE_URL}/users/search?q=${search}`);
        if (res.ok) {
          const data = await res.json();
          setUsers(data || []);
        }
      } catch (err) {
        console.error("Failed to fetch users", err);
      }
    };
    
    // Simple debounce
    const timeout = setTimeout(fetchUsers, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const filteredUsers = users.filter((u) => !selectedUsers.find(su => su.id === u.id));

  const toggleUser = (user: User) => {
    if (selectedUsers.find(su => su.id === user.id)) {
      setSelectedUsers((prev) => prev.filter((su) => su.id !== user.id));
    } else {
      setSelectedUsers((prev) => [...prev, user]);
      setSearch("");
    }
  };

  const { channels, setChannels, addFloatingChat } = useAppStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedUsers.length === 0) return;
    
    setIsSubmitting(true);
    try {
            // We will create a channel of type DM, by sending user_ids.

      const res = await fetchWithAuth(`${API_BASE_URL}/channels`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          
        },
        body: JSON.stringify({
          user_ids: selectedUsers.map(u => u.id)
        })
      });

      if (!res.ok) {
        throw new Error("Failed to create DM");
      }

      const newChannel = await res.json();
      const channelId = newChannel.ID || newChannel.id;
      const channelName = (newChannel.Name || newChannel.name) ? (newChannel.Name || newChannel.name) : (selectedUsers.map(u => u.email.split('@')[0]).join(", ") || "Direct Message");
      newChannel.ID = channelId;
      newChannel.Name = channelName;
      newChannel.Type = "DM";

      setChannels([...channels, newChannel]);
      
      const { setCurrentView, setActiveChannelId, setActiveDmId } = useAppStore.getState();
      setActiveChannelId(channelId);
      setActiveDmId(channelId);
      addFloatingChat({ id: channelId, name: channelName });
      setCurrentView('chat');
      
      onClose();
    } catch (err) {
      console.error(err);
      alert(isRtl ? "فشل إنشاء المحادثة" : "Failed to create DM");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-content max-w-lg">
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <div className="modal-icon-bg">
              <MessageSquare className="w-5 h-5 text-brand" />
            </div>
            <h2 id="modal-title" className="modal-title">{isRtl ? "الرسائل المباشرة" : "Direct Messages"}</h2>
          </div>
          <button onClick={onClose} className="modal-close-btn" aria-label={isRtl ? "إغلاق النافذة" : "Close modal"}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body pb-0">
          <div className="form-group relative mb-2">
            <Search className="absolute start-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={isRtl ? "اكتب اسم شخص..." : "Type the name of a person..."}
              className="modal-input ps-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          {/* Selected Users Chips */}
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-1.5 bg-brand-light text-brand px-2 py-1 rounded text-sm font-medium border border-brand-light ">
                  <Avatar className="w-4 h-4">
                    <AvatarFallback className="text-[8px]">{u.email[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                  {u.email}
                  <button type="button" onClick={() => toggleUser(u)} className="hover:text-brand-dark :text-indigo-100 ms-1" title={isRtl ? "إزالة المستخدم" : "Remove User"}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Search Results List */}
          <div className="border border-slate-200 rounded-md overflow-hidden max-h-48 overflow-y-auto mb-4">
            {filteredUsers.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-500 ">{isRtl ? "لا يوجد أشخاص مطابقون." : "No matching people found."}</div>
            ) : (
              filteredUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleUser(u)}
                  aria-label={isRtl ? "بدء محادثة" : "Start Conversation"}
                  className="w-full text-start flex items-center gap-3 p-2 hover:bg-[#f8fafc] :bg-slate-800 border-b border-slate-100 last:border-0 transition-colors"
                >
                  <Avatar className="w-8 h-8">
                    <AvatarFallback>{u.email[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-sm font-medium text-slate-900 ">{u.email}</div>
                    <div className="text-xs text-slate-500 ">{u.role}</div>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="modal-footer pt-4 pb-6 mt-0 border-t border-slate-100 ">
            <Button type="submit" disabled={isSubmitting || selectedUsers.length === 0} className="modal-submit-btn bg-brand hover:bg-brand w-full sm:w-auto ms-auto">
              {isSubmitting && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
              {isRtl ? "بدء" : "Go"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
