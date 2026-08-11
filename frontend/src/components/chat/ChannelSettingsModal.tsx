"use client";

import { useState } from "react";
import { Hash, Save, ShieldAlert } from "lucide-react";
import { apiPut } from "@/lib/apiClient";
import { Channel } from "@/types/chat";
import { useLocalization } from "@/contexts/LocalizationContext";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
  const [errorMessage, setErrorMessage] = useState("");
  const [prevChannel, setPrevChannel] = useState<Channel | null>(null);

  // Sync form state when a different channel is selected (adjust-state-during-render pattern)
  if (channel !== prevChannel) {
    setPrevChannel(channel);
    if (channel) {
      setName(channel.name || channel.Name || '');
      setDescription(channel.description || channel.Description || '');
      const t = channel.type || channel.Type || '';
      setIsPrivate(t === 'PRIVATE');
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channel) return;

    if (channel.is_system || channel.IsSystem) {
      setErrorMessage(t("chat.systemChannelError"));
      return;
    }

    setLoading(true);
    try {
      await apiPut(`/channels/${channel.id || channel.ID}`, {
        name,
        description,
        is_private: isPrivate
      });
      onUpdate();
      onClose();
    } catch {
      setErrorMessage(t("chat.saveSettingsError"));
    } finally {
      setLoading(false);
    }
  };

  if (!channel) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hash className="size-5 text-brand" aria-hidden />
            {t("chat.channelSettings")}
          </DialogTitle>
          <DialogDescription>{t("chat.channelSettingsDescription")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label={t("chat.channelName")} htmlFor="channel-settings-name" required>
            <Input
              id="channel-settings-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={channel.is_system || channel.IsSystem}
              placeholder={t("chat.channelName")}
            />
          </FormField>
          
          <FormField label={t("chat.channelDesc")} htmlFor="channel-settings-description">
            <Textarea
              id="channel-settings-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={channel.is_system || channel.IsSystem}
              className="h-24 resize-none"
              placeholder={t("chat.channelDescOptional")}
            />
          </FormField>

          <FormField label={t("chat.channelPrivacy")} htmlFor="channel-settings-privacy">
            <select
              id="channel-settings-privacy"
              value={isPrivate ? "private" : "public"}
              onChange={(e) => setIsPrivate(e.target.value === "private")}
              disabled={channel.is_system || channel.IsSystem}
              className="h-9 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
            >
              <option value="public">{t("chat.publicChannelOpt")}</option>
              <option value="private">{t("chat.privateChannelOpt")}</option>
            </select>
          </FormField>

          {(channel.is_system || channel.IsSystem) && (
            <Alert tone="warning">
              <ShieldAlert />
              <AlertDescription>{t("chat.systemChannelNote")}</AlertDescription>
            </Alert>
          )}

          {errorMessage ? (
            <Alert tone="danger"><AlertDescription>{errorMessage}</AlertDescription></Alert>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button
              type="submit" 
              disabled={loading || !name.trim() || (channel.is_system ?? channel.IsSystem)}
            >
              <Save />
              {loading ? t("common.saving") : t("common.saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
