// ═══════════════════════════════════════════════════════════════
// Septimus OS — Chat & Messaging Types
// ═══════════════════════════════════════════════════════════════

export interface Channel {
  ID: string;
  id?: string;
  Name: string;
  name?: string;
  Description?: string;
  Type: 'PUBLIC' | 'PRIVATE' | 'DM';
  WorkspaceID?: string;
  ProjectID?: string;
  unread?: number;
  IsSystem?: boolean;
  CreatedAt?: string;
  UpdatedAt?: string;
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

export interface Thread {
  ID: string;
  ParentMessage: Message;
  Replies: Message[];
  ReplyCount: number;
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
