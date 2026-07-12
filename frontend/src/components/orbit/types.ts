export interface OrbitTask {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  source_type: 'CHAT' | 'WORKFLOW' | 'CRM' | 'HR' | 'PRIVATE';
  source_id?: string;
  source_link?: string;
  source_meta?: Record<string, any>;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'ARCHIVED';
  focus_priority: number; // 1, 2, or 3 if Top 3, 0 otherwise
  energy_tag: 'HIGH_ENERGY' | 'DEEP_FOCUS' | 'LIGHT';
  xp_reward: number;
  time_spent_seconds: number;
  created_at: string;
  completed_at?: string;
}

export interface OrbitProfile {
  user_id: string;
  xp: number;
  level: number;
  level_title: string;
  daily_energy_mode: 'HIGH_ENERGY' | 'DEEP_FOCUS' | 'LIGHT';
  theme_preference: 'CYBER_NEBULA' | 'DEEP_SPACE' | 'SERENE_HORIZON';
  earned_badges: string[];
  focus_timer_active: boolean;
  active_task_id?: string;
  pomodoro_seconds_remaining: number;
}
