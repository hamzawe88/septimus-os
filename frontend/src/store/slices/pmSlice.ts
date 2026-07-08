import { StateCreator } from 'zustand';
import { Task, Workflow } from '@/types';
import type { AppState } from '../useAppStore';

export interface PmSlice {
  // Kanban PM Data
  projectId: string;
  setProjectId: (id: string) => void;
  tasks: Task[];
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
  // Task Pagination
  taskPage: number;
  setTaskPage: (page: number) => void;
  taskTotal: number;
  setTaskTotal: (total: number) => void;
  taskLimit: number;

  // Workflows
  workflows: Workflow[];
  setWorkflows: (workflows: Workflow[] | ((prev: Workflow[]) => Workflow[])) => void;
}

export const createPmSlice: StateCreator<AppState, [], [], PmSlice> = (set) => ({
  // Kanban PM Data
  projectId: "",
  setProjectId: (id) => set({ projectId: id }),
  tasks: [],
  setTasks: (tasks) => set((state) => ({
    tasks: typeof tasks === 'function' ? tasks(state.tasks) : tasks
  })),
  // Task Pagination
  taskPage: 1,
  setTaskPage: (page) => set({ taskPage: page }),
  taskTotal: 0,
  setTaskTotal: (total) => set({ taskTotal: total }),
  taskLimit: 50,

  // Workflows
  workflows: [],
  setWorkflows: (workflows) => set((state) => ({
    workflows: typeof workflows === 'function' ? workflows(state.workflows) : workflows
  })),
});
