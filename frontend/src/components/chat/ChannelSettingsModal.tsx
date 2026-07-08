"use client";

import { useState } from "react";
import { X, Hash } from "lucide-react";
import { apiPut } from "@/lib/apiClient";
import { Channel } from "@/types/chat";
import { useLocalization } from "@/contexts/LocalizationContext";

interface ChannelSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: Channel | null;
  onUpdate: () => void;
}

export default function ChannelSettingsModal({ isOpen, onClose, channel, onUpdate }: ChannelSettingsModalProps) {
  const { t } = useLocalization();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [prevChannel, setPrevChannel] = useState<Channel | null>(null);

  // Sync form state when a different channel is selected (adjust-state-during-render pattern)
  if (channel !== prevChannel) {
    setPrevChannel(channel);
    if (channel) {
      setName(channel.Name);
      setDescription(channel.Description || "");
      setIsPrivate(channel.Type === "PRIVATE");
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channel) return;

    if (channel.IsSystem) {
      alert(t("chat.systemChannelError"));
      return;
    }

    setLoading(true);
    try {
      await apiPut(`/channels/${channel.ID}`, {
        name,
        description,
        is_private: isPrivate
      });
      onUpdate();
      onClose();
    } catch {
      alert(t("chat.saveSettingsError"));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !channel) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-background border border-border rounded-xl w-[400px] flex flex-col shadow-2xl relative">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Hash size={20} className="text-brand" />
            {t("chat.channelSettings")}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded-md transition-colors" title={t("common.close")}>
            <X size={20} className="text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{t("chat.channelName")}</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={channel.IsSystem}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-foreground focus:ring-1 focus:ring-brand focus:border-brand focus:outline-none disabled:opacity-50"
              title={t("chat.channelName")}
              placeholder={t("chat.channelName")}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{t("chat.channelDesc")}</label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={channel.IsSystem}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-foreground focus:ring-1 focus:ring-brand focus:border-brand focus:outline-none h-24 resize-none disabled:opacity-50"
              title={t("chat.channelDesc")}
              placeholder={t("chat.channelDescOptional")}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{t("chat.channelPrivacy")}</label>
            <select
              value={isPrivate ? "private" : "public"}
              onChange={(e) => setIsPrivate(e.target.value === "private")}
              disabled={channel.IsSystem}
              className="w-full bg-background border border-input rounded-md px-3 py-2 text-foreground focus:ring-1 focus:ring-brand focus:border-brand focus:outline-none disabled:opacity-50"
              title={t("chat.channelPrivacy")}
            >
              <option value="public">{t("chat.publicChannelOpt")}</option>
              <option value="private">{t("chat.privateChannelOpt")}</option>
            </select>
          </div>

          {channel.IsSystem && (
            <p className="text-xs text-orange-400 bg-orange-400/10 p-2 rounded">
              {t("chat.systemChannelNote")}
            </p>
          )}

          <div className="pt-2">
            <button 
              type="submit" 
              disabled={loading || channel.IsSystem}
              className="w-full bg-brand text-white py-2 rounded-md hover:bg-brand/90 transition-colors disabled:opacity-50 font-medium"
            >
              {loading ? t("common.saving") : t("common.saveChanges")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
