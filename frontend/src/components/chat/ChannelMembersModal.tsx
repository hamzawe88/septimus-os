"use client";

import { useState, useEffect, useCallback } from "react";
import { Shield, User, VolumeX, Volume2, ShieldAlert, UserPlus } from "lucide-react";
import { apiGet, apiPost } from "@/lib/apiClient";
import { ChannelMember } from "@/types/chat";
import { useLocalization } from "@/contexts/LocalizationContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tag } from "@/components/ui/tag";

interface ChannelMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId: string;
}

export default function ChannelMembersModal({ isOpen, onClose, channelId }: ChannelMembersModalProps) {
  const { t } = useLocalization();
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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
      setMembers(current => current.map(m => m.UserID === userId ? { ...m, IsMuted: !isMuted } : m));
    } catch (error) {
      console.error(error);
      setErrorMessage(t("chat.muteError"));
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      await apiPost(`/channels/${channelId}/members/role`, {
        user_id: userId,
        role: newRole
      });
      setMembers(current => current.map(m => m.UserID === userId ? { ...m, Role: newRole as ChannelMember['Role'] } : m));
    } catch (error) {
      console.error(error);
      setErrorMessage(t("chat.roleError"));
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberEmail.trim()) return;
    setAdding(true);
    try {
      const data = await apiPost(`/channels/${channelId}/members`, { email: newMemberEmail.trim() }) as ChannelMember;
      if (data) {
        setMembers(current => [...current, data]);
        setNewMemberEmail("");
      }
    } catch (error: unknown) {
      console.error(error);
      const msg = error instanceof Error ? error.message : t("common.error");
      setErrorMessage(msg);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[80vh] w-[95vw] max-w-lg flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="size-5 text-brand" aria-hidden />
            {t("chat.channelMembers")}
          </DialogTitle>
          <DialogDescription>{t("chat.channelMembersDescription")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleAddMember} className="flex items-end gap-2">
          <FormField label={t("chat.memberEmail")} htmlFor="channel-member-email" className="flex-1">
            <Input
              id="channel-member-email"
              type="email"
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
              placeholder={t("chat.memberEmailPlaceholder")}
            />
          </FormField>
            <Button
              type="submit"
              disabled={adding || !newMemberEmail.trim()}
            >
              <UserPlus />
              {adding ? t("common.loading") : t("chat.addMember")}
            </Button>
        </form>

        {errorMessage ? (
          <Alert tone="danger">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex-1 space-y-2 overflow-y-auto">
          {loading ? (
            <div className="space-y-2" aria-label={t("common.loading")}>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : members.length === 0 ? (
            <EmptyState
              icon={<User aria-hidden />}
              title={t("chat.noMembers")}
              description={t("chat.noMembersDescription")}
            />
          ) : (
            members.map((member) => (
              <div key={member.UserID} className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border p-3">
                <div className="flex flex-col">
                  <span className="text-foreground font-medium">{member.User?.Email || member.UserID}</span>
                  <Tag tone={member.Role === "OWNER" ? "danger" : member.Role === "ADMIN" ? "warning" : member.Role === "MODERATOR" ? "brand" : "neutral"} className="mt-1 w-fit">
                    {member.Role === 'OWNER' && <ShieldAlert />}
                    {member.Role === 'ADMIN' && <Shield />}
                    {member.Role === 'MODERATOR' && <Shield />}
                    {member.Role === 'MEMBER' && <User />}
                    {t(`chat.roles.${member.Role.toLowerCase()}`)}
                  </Tag>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={member.IsMuted ? "destructive" : "ghost"}
                    size="icon-sm"
                    onClick={() => handleMute(member.UserID, member.IsMuted)}
                    title={member.IsMuted ? t("chat.unmute") : t("chat.mute")}
                    aria-label={member.IsMuted ? t("chat.unmute") : t("chat.mute")}
                  >
                    {member.IsMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </Button>

                  <select
                    value={member.Role}
                    onChange={(e) => handleChangeRole(member.UserID, e.target.value)}
                    disabled={member.Role === "OWNER"}
                    className="h-8 rounded-[var(--radius-control)] border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
                    title={t("chat.changeRole")}
                    aria-label={`${t("chat.changeRole")}: ${member.User?.Email || member.UserID}`}
                  >
                    {member.Role === "OWNER" ? <option value="OWNER">{t("chat.roles.owner")}</option> : null}
                    <option value="MEMBER">{t("chat.roleMember")}</option>
                    <option value="MODERATOR">{t("chat.roleModerator")}</option>
                    <option value="ADMIN">{t("chat.roleAdmin")}</option>
                  </select>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
