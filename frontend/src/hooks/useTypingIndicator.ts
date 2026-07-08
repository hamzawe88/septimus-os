import { useRef } from "react";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";

// Broadcasts "user is typing" to a channel with a debounced "stopped typing"
// follow-up. Extracted from MessageInput so the component's onChange stays thin.
export function useTypingIndicator(channelId: string | undefined, userEmail: string) {
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const sendTypingState = (isTyping: boolean) => {
    if (!channelId) return;
    fetchWithAuth(`${API_BASE_URL}/chat/typing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel_id: channelId,
        user_email: userEmail,
        is_typing: isTyping,
      }),
    }).catch(() => {});
  };

  // Call on every keystroke: fires "typing" once, then "stopped" after 2.5s idle.
  const notifyTyping = () => {
    if (channelId && !isTypingRef.current) {
      isTypingRef.current = true;
      sendTypingState(true);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      sendTypingState(false);
    }, 2500);
  };

  return { notifyTyping };
}
