// ═══════════════════════════════════════════════════════════════
// Septimus OS — Admin & Organization Types
// ═══════════════════════════════════════════════════════════════

export interface User {
  id: string;
  ID?: string;
  email: string;
  Email?: string;
  name?: string;
  role?: string;
  Role?: string;
  RoleID?: string;
  DepartmentID?: string;
  JobTitle?: string;
  EmployeeID?: string;
  avatarUrl?: string;
  CreatedAt?: string;
}

export interface Role {
  ID: string;
  Name: string;
  Description?: string;
  Permissions?: Permission[];
  CreatedAt?: string;
}

export interface Department {
  ID: string;
  Name: string;
  Description?: string;
  ParentID?: string;
  ManagerID?: string;
  CreatedAt?: string;
}

export interface Permission {
  ID: string;
  Name: string;
  Description?: string;
  CreatedAt?: string;
}

export interface AttendanceLog {
  ID: string;
  UserID: string;
  Type: 'check_in' | 'check_out';
  OfficeID?: string;
  Latitude?: number;
  Longitude?: number;
  CreatedAt?: string;
}

export interface OfficeLocation {
  ID: string;
  Name: string;
  Latitude: number;
  Longitude: number;
  Radius: number;
  CreatedAt?: string;
}

export interface Workspace {
  ID: string;
  Name: string;
  Industry?: string;
  CreatedAt?: string;
}

export interface WorkflowNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
}

export interface Workflow {
  ID: string;
  Name: string;
  Description?: string;
  IsActive: boolean;
  Nodes: WorkflowNode[] | string;
  Edges: WorkflowEdge[] | string;
  CreatedAt?: string;
  UpdatedAt?: string;
}
