// User Table
export interface User {
  id: string;
  email: string;
  encrypted_password: string;
  reset_password_token?: string;
  reset_password_sent_at?: string;
  remember_created_at?: string;
  avatar?: string;
  planner_id?: number;
  planners_count?: number;
  created_at: string;
  updated_at: string;
}

// Planner Table
export interface Planner {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

// Page Table
export interface Page {
  id: string;
  user_id: string;
  planner_id: string;
  page_template_id: string;
  page_date?: string;
  page_type?: string;
  period_identifier?: string;
  updated_version: number;
  created_at: string;
  updated_at: string;
}

// PageTemplate Table
export interface PageTemplate {
  id: string;
  name?: string;
  content?: Record<string, any>;
  template_type: 'daily' | 'weekly' | 'monthly' | 'custom' | 'weekly_left';
  is_default: boolean;
  user_id: string;
  planner_id: string;
  created_at: string;
  updated_at: string;
  tldraw_snapshots?: Record<string, any>;
  schema?: Record<string, any>;
}

// PlannerEntry Table
export interface PlannerEntry {
  id: string;
  page_id: string;
  user_id: string;
  planner_id: string;
  content?: Record<string, any>;
  entry_time?: string;
  updated_version: number;
  created_at: string;
  updated_at: string;
}

// TldrawSnapshot Table
export interface TldrawSnapshot {
  id: string;
  page_id: string;
  user_id: string;
  planner_id: string;
  document_data?: Record<string, any>;
  created_at: string;
  updated_at: string;
}