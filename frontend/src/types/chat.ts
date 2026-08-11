// ═══════════════════════════════════════════════════════════════
// Septimus OS — Chat & Messaging Types
// ═══════════════════════════════════════════════════════════════

export interface Channel {
  // snake_case (canonical — from Go json tags)
  id: string;
  name: string;
  type: 'PUBLIC' | 'PRIVATE' | 'DM';
  description?: string;
  workspace_id?: string;
  project_id?: string;
  is_archived?: boolean;
  is_system?: boolean;
  created_at?: string;
  updated_at?: string;
  // PascalCase aliases — kept for backward compatibility with existing consumers
  ID?: string;
  Name?: string;
  Type?: 'PUBLIC' | 'PRIVATE' | 'DM';
  Description?: string;
  WorkspaceID?: string;
  ProjectID?: string;
  IsSystem?: boolean;
  CreatedAt?: string;
  UpdatedAt?: string;
  // UI-only
  unread?: number;
}

export interface ChannelMember {
  ChannelID: string;
  UserID: string;
  Role: 'OWNER' | 'ADMIN' | 'MODERATOR' | 'MEMBER';
  IsMuted: boolean;
  JoinedAt?: string;
  User?: {
    ID: string;
    Email: string;
  };
}

export interface Message {
  ID: string;
  ChannelID: string;
  UserID?: string;
  Content: string;
  Type: 'user' | 'system' | 'ai' | 'ai_proposal';
  AIAgentRole?: string;
  ParentID?: string;
  AttachmentURL?: string;
  AttachmentType?: string;
  User?: {
    ID: string;
    Email: string;
  };
  Channel?: {
    ID: string;
    Name: string;
  };
  CreatedAt?: string;
  UpdatedAt?: string;
}

/**
 * Thread / ActiveThread — the normalized shape used by setActiveThread.
 * All callers (FullPageChat, ThreadsListSidebar) must populate these fields.
 * The `channel_id` is critical: RightSidebar uses it for the Centrifuge
 * subscription and for posting replies.
 */
export interface Thread {
  /** UUID of the parent (root) message */
  id: string;
  /** UUID of the channel the parent message belongs to */
  channel_id: string;
  /** "human" | "ai" | "system" */
  type: string;
  /** Display name / email of the message author */
  author: string;
  /** Formatted time string, e.g. "14:23" */
  time: string;
  /** Text content of the parent message */
  text: string;
  /** Raw Content field (alias — populated by FullPageChat) */
  Content?: string;
}

export interface DirectMessage {
  id: string;
  userId: string;
  name: string;
  avatar?: string;
  online: boolean;
  ai?: boolean;
  status?: 'online' | 'offline';
  unreadCount?: number;
}

export interface Notification {
  id: string;
  message: string;
  messageKey?: string;
  createdAt: string;
  isRead: boolean;
}
