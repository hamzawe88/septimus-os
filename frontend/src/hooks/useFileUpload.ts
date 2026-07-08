import { useRef, useState, type ChangeEvent } from "react";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";

export interface UploadedAttachment {
  url: string;
  type: string;
  name: string;
}

// Owns the hidden file input, upload request, and attachment/upload state.
// Extracted from MessageInput to keep the component focused on composing text.
export function useFileUpload() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachment, setAttachment] = useState<UploadedAttachment | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/upload`, {
        method: "POST",
        headers: {},
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setAttachment({ url: data.url, type: data.type, name: file.name });
      } else {
        alert(data.error || "Upload failed");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to upload file");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return { fileInputRef, attachment, setAttachment, isUploading, handleFileSelect };
}
