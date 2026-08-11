import { apiGet } from "@/lib/apiClient";
import type { Project, Task } from "@/types";

export interface TaskListResponse {
  tasks: Task[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export async function getProjects(): Promise<Project[]> {
  const projects = await apiGet<Project[]>("/projects");
  return Array.isArray(projects) ? projects : [];
}

export async function getAllProjectTasks(projectId: string): Promise<Task[]> {
  const tasks: Task[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const response = await apiGet<TaskListResponse>(
      `/tasks?project_id=${encodeURIComponent(projectId)}&page=${page}&limit=200`,
    );
    tasks.push(...(response.tasks || []));
    totalPages = Math.max(1, response.total_pages || 1);
    page += 1;
  } while (page <= totalPages);
  return tasks;
}
