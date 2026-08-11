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
	RecordVersion?: number;
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
	RecordVersion?: number;
}

export interface PMDashboardWorkload {
  user_id: string;
  email: string;
  task_count: number;
}

export interface PMDashboardSprint {
  id: string;
  name: string;
  total_tasks: number;
  done_tasks: number;
  time_elapsed_percent: number;
  work_complete_percent: number;
}

export interface PMDashboardData {
  project_count: number;
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  blocked_tasks: number;
  on_track_percent: number;
  status_counts: Record<string, number>;
  workload: PMDashboardWorkload[];
  my_tasks: Task[];
  active_sprint?: PMDashboardSprint;
}

export interface PMPlanningTask {
  id: string;
  title: string;
  status: string;
  assignee_id?: string;
  duration_days: number;
  earliest_start_day: number;
  earliest_finish_day: number;
  latest_start_day: number;
  latest_finish_day: number;
  slack_days: number;
  critical: boolean;
}

export interface PMTaskDependency {
  id: string;
  predecessor_id: string;
  successor_id: string;
  lag_days: number;
}

export interface PMPlanningData {
  project_id: string;
  project_name: string;
  duration_days: number;
  generated_at: string;
  tasks: PMPlanningTask[];
  dependencies: PMTaskDependency[];
}

export interface PMPortfolioProject {
  project_id: string;
  project_name: string;
  open_points: number;
  active_sprint_points: number;
  unassigned_points: number;
  completed_sprints: number;
  average_velocity: number;
  forecast_sprints: number | null;
  capacity_utilization_percent: number | null;
  forecast_confidence: "insufficient_history" | "medium" | "high";
}

export interface PMPortfolioData {
  projects: PMPortfolioProject[];
  generated_at: string;
  method: "completed_sprint_velocity";
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
  capacityPoints: number;
  historySprints: number;
}

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'blocked' | 'done';
export type SprintStatus = 'planning' | 'active' | 'completed';

export const KANBAN_COLUMNS: { id: TaskStatus; title: string }[] = [
  { id: 'todo', title: 'To Do' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'review', title: 'Review' },
  { id: 'blocked', title: 'Blocked' },
  { id: 'done', title: 'Done' },
];
