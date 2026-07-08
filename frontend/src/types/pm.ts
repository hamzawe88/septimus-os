// ═══════════════════════════════════════════════════════════════
// Septimus OS — Project Management Types
// ═══════════════════════════════════════════════════════════════

export interface Project {
  ID: string;
  Name: string;
  Description?: string;
  WorkspaceID?: string;
  CreatedBy?: string;
  Settings?: Record<string, unknown>;
  DriveFolderLink?: string;
  CreatedAt?: string;
  UpdatedAt?: string;
}

export interface Task {
  ID: string;
  Title: string;
  Description?: string;
  Status: string;
  Priority: number;
  StoryPoints: number;
  ProjectID: string;
  SprintID?: string;
  AssigneeID?: string;
  ParentID?: string;
  Path?: string;
  DueDate?: string;
  Metadata?: Record<string, unknown>;
  CreatedAt?: string;
  UpdatedAt?: string;
}

export interface Sprint {
  ID: string;
  Name: string;
  Goal?: string;
  Status: string; // 'planning' | 'active' | 'completed'
  ProjectID?: string;
  StartDate?: string;
  EndDate?: string;
  CreatedAt?: string;
  UpdatedAt?: string;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface AIProposal {
  targetSprint: Sprint;
  selectedTasks: Task[];
  rationale: string;
}

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type SprintStatus = 'planning' | 'active' | 'completed';

export const KANBAN_COLUMNS: { id: TaskStatus; title: string }[] = [
  { id: 'todo', title: 'To Do' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'review', title: 'Review' },
  { id: 'done', title: 'Done' },
];
