"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Hash, Lock, Loader2 } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { fetchWithAuth,     API_BASE_URL } from '@/lib/apiClient';

interface NewChannelModalProps {
  onClose: () => void;
}

export default function NewChannelModal({ onClose }: NewChannelModalProps) {
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
        throw new Error("Failed to create channel");
      }

      const newChannel = await res.json();
      setChannels([...channels, newChannel]);
      setActiveChannelId(newChannel.id);
      setCurrentView("chat");
      
      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to create channel");
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
            <h2 id="modal-title" className="modal-title">Create a channel</h2>
          </div>
          <button onClick={onClose} className="modal-close-btn" aria-label="Close modal">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <p className="text-sm text-slate-500 mb-4">
            Channels are where your team communicates. They’re best when organized around a topic — #marketing, for example.
          </p>
          
          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              type="text"
              required
              placeholder="e.g. plan-budget"
              className="modal-input font-medium"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description (optional)</label>
            <input
              type="text"
              aria-label="Channel Description"
              placeholder="What's this channel about?"
              className="modal-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-group flex items-center justify-between mt-2 p-3 bg-[#f8fafc] rounded-md border border-slate-200 ">
            <div>
              <label className="form-label mb-0 flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-slate-600 " />
                Make private
              </label>
              <p className="text-xs text-slate-500 mt-1">
                When a channel is set to private, it can only be viewed or joined by invitation.
              </p>
            </div>
            <input
              type="checkbox"
              title="Make Private"
              className="w-4 h-4 accent-indigo-600 cursor-pointer"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />
          </div>

          <div className="modal-footer mt-6">
            <Button type="button" title="Cancel" variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" title="Create Channel" disabled={isSubmitting} className="modal-submit-btn bg-brand hover:bg-brand">
              {isSubmitting && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
