"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Hash, Lock, Loader2 } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from "@/contexts/LocalizationContext";

interface NewChannelModalProps {
  onClose: () => void;
}

export default function NewChannelModal({ onClose }: NewChannelModalProps) {
  const { isRtl } = useLocalization();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { channels, setChannels, setActiveChannelId, setCurrentView } = useAppStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
            const res = await fetchWithAuth(`${API_BASE_URL}/channels`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          
        },
        body: JSON.stringify({
          name: name.trim(),
          is_private: isPrivate,
          description: description.trim()
        })
      });

      if (!res.ok) {
        throw new Error(isRtl ? "فشل إنشاء القناة" : "Failed to create channel");
      }

      const newChannel = await res.json();
      // API now returns snake_case: id, name, type
      const channelId = newChannel.id || newChannel.ID;
      setChannels([...channels, newChannel]);
      setActiveChannelId(channelId);
      setCurrentView("chat");
      
      onClose();
    } catch (err) {
      console.error(err);
      alert(isRtl ? "فشل إنشاء القناة" : "Failed to create channel");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-content">
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <div className="modal-icon-bg">
              <Hash className="w-5 h-5 text-brand" />
            </div>
            <h2 id="modal-title" className="modal-title">{isRtl ? "إنشاء قناة" : "Create a channel"}</h2>
          </div>
          <button onClick={onClose} className="modal-close-btn" aria-label={isRtl ? "إغلاق النافذة" : "Close modal"}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <p className="text-sm text-muted-foreground mb-4">
            {isRtl ? "القنوات هي حيث يتواصل فريقك. تكون الأفضل عند تنظيمها حول موضوع — مثل ‏#التسويق." : "Channels are where your team communicates. They’re best when organized around a topic — #marketing, for example."}
          </p>
          
          <div className="form-group">
            <label className="form-label">{isRtl ? "الاسم" : "Name"}</label>
            <input
              type="text"
              required
              placeholder={isRtl ? "مثال: plan-budget" : "e.g. plan-budget"}
              className="modal-input font-medium"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">{isRtl ? "الوصف (اختياري)" : "Description (optional)"}</label>
            <input
              type="text"
              aria-label={isRtl ? "وصف القناة" : "Channel Description"}
              placeholder={isRtl ? "ما موضوع هذه القناة؟" : "What's this channel about?"}
              className="modal-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-group flex items-center justify-between mt-2 p-3 bg-background rounded-md border border-border ">
            <div>
              <label className="form-label mb-0 flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-muted-foreground " />
                {isRtl ? "اجعلها خاصة" : "Make private"}
              </label>
              <p className="text-xs text-muted-foreground mt-1">
                {isRtl ? "عند تعيين القناة كخاصة، لا يمكن عرضها أو الانضمام إليها إلا بدعوة." : "When a channel is set to private, it can only be viewed or joined by invitation."}
              </p>
            </div>
            <input
              type="checkbox"
              title={isRtl ? "اجعلها خاصة" : "Make Private"}
              className="w-4 h-4 accent-indigo-600 cursor-pointer"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />
          </div>

          <div className="modal-footer mt-6">
            <Button type="button" title={isRtl ? "إلغاء" : "Cancel"} variant="ghost" onClick={onClose} disabled={isSubmitting}>
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" title={isRtl ? "إنشاء القناة" : "Create Channel"} disabled={isSubmitting} className="modal-submit-btn bg-brand hover:bg-brand">
              {isSubmitting && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
              {isRtl ? "إنشاء" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
