"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Shield, User, VolumeX, Volume2, ShieldAlert } from "lucide-react";
import { apiGet, apiPost } from "@/lib/apiClient";
import { ChannelMember } from "@/types/chat";
import { useLocalization } from "@/contexts/LocalizationContext";

interface ChannelMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId: string;
}

export default function ChannelMembersModal({ isOpen, onClose, channelId }: ChannelMembersModalProps) {
  const { t } = useLocalization();
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMembers = useCallback(async () => {
    if (!channelId) return;
    setLoading(true);
    try {
      const data = await apiGet(`/channels/${channelId}/members`) as ChannelMember[];
      if (data) {
        setMembers(data);
      }
    } catch (error) {
      console.error("Failed to fetch members:", error);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    if (isOpen && channelId) {
      setTimeout(() => {
        fetchMembers();
      }, 0);
    }
  }, [isOpen, channelId, fetchMembers]);

  const handleMute = async (userId: string, isMuted: boolean) => {
    try {
      await apiPost(`/channels/${channelId}/members/mute`, {
        user_id: userId,
        is_muted: !isMuted
      });
      setMembers(members.map(m => m.UserID === userId ? { ...m, IsMuted: !isMuted } : m));
    } catch (error) {
      console.error(error);
      alert(t("chat.muteError"));
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      await apiPost(`/channels/${channelId}/members/role`, {
        user_id: userId,
        role: newRole
      });
      setMembers(members.map(m => m.UserID === userId ? { ...m, Role: newRole as ChannelMember['Role'] } : m));
    } catch (error) {
      console.error(error);
      alert(t("chat.roleError"));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-background border border-border rounded-xl w-[500px] max-h-[80vh] flex flex-col shadow-2xl relative">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <User size={20} className="text-brand" />
            {t("chat.channelMembers")}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded-md transition-colors" title={t("common.close")}>
            <X size={20} className="text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-4">
          {loading ? (
            <p className="text-center text-muted-foreground">{t("common.loading")}</p>
          ) : members.length === 0 ? (
            <p className="text-center text-muted-foreground">{t("chat.noMembers")}</p>
          ) : (
            members.map((member) => (
              <div key={member.UserID} className="flex items-center justify-between bg-accent/50 p-3 rounded-lg border border-border">
                <div className="flex flex-col">
                  <span className="text-foreground font-medium">{member.User?.Email || member.UserID}</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    {member.Role === 'OWNER' && <ShieldAlert size={12} className="text-red-400" />}
                    {member.Role === 'ADMIN' && <Shield size={12} className="text-orange-400" />}
                    {member.Role === 'MODERATOR' && <Shield size={12} className="text-brand" />}
                    {member.Role === 'MEMBER' && <User size={12} />}
                    {member.Role}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleMute(member.UserID, member.IsMuted)}
                    title={member.IsMuted ? t("chat.unmute") : t("chat.mute")}
                    className={`p-2 rounded-md transition-colors ${member.IsMuted ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-accent text-muted-foreground hover:bg-accent/80'}`}
                  >
                    {member.IsMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                  
                  <select 
                    value={member.Role}
                    onChange={(e) => handleChangeRole(member.UserID, e.target.value)}
                    className="bg-background border border-input text-foreground text-sm rounded-md px-2 py-1 focus:outline-none focus:border-brand"
                    title={t("chat.changeRole")}
                  >
                    <option value="MEMBER">{t("chat.roleMember")}</option>
                    <option value="MODERATOR">{t("chat.roleModerator")}</option>
                    <option value="ADMIN">{t("chat.roleAdmin")}</option>
                  </select>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
