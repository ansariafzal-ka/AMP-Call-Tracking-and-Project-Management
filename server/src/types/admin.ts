export interface AdminUserRow {
  id: number;
  full_name: string;
  email: string;
  mobile_number: string;
  role: 'admin' | 'caller';
  is_active: boolean;
  daily_target: number;
  weekly_target: number;
  total_assigned_contacts: number;
  calls_made_today: number;
  created_at: string;
  filtered_total?: number;
}

export interface AdminCreateUserDTO {
  fullName: string;
  email: string;
  mobileNumber: string;
  password: string;
  role?: 'admin' | 'caller';
  dailyTarget?: number;
  weeklyTarget?: number;
}

export interface AdminUpdateUserDTO {
  role?: 'admin' | 'caller';
  isActive?: boolean;
  dailyTarget?: number;
  weeklyTarget?: number;
  fullName?: string;
  mobileNumber?: string;
}

export interface AdminUserFilters {
  search?: string;
  role?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface AdminContactRow {
  id: number;
  name: string;
  mobile_number: string;
  alternate_number?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  pin_code?: string | null;
  category: string;
  notes?: string | null;
  created_at: string;
  assigned_user_id?: number | null;
  assigned_user_name?: string | null;
  assigned_user_email?: string | null;
  project_id?: number | null;
  project_name?: string | null;
  project_ids?: number[];
  project_names?: string | null;
  projects?: Array<{ id: number; name: string }>;
  total_calls?: number;
  last_called_at?: string | null;
  last_call_status?: string | null;
  last_call_outcome?: string | null;
  filtered_total?: number;
}

export interface AdminUpdateContactDTO {
  name: string;
  mobile_number: string;
  alternate_number?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  pin_code?: string | null;
  category?: string;
  notes?: string | null;
  project_id?: number | null;
  project_ids?: number[];
  assigned_user_id?: number | null;
}

export interface AdminContactFilters {
  search?: string;
  category?: string;
  city?: string;
  assignedUserId?: number;
  unassignedOnly?: boolean;
  projectId?: number;
  page?: number;
  limit?: number;
}

export interface AssignContactsDTO {
  contactIds: number[];
  targetUserId: number;
  reassignFollowUps?: boolean;
}


export interface AdminDashboardSummary {
  totalCalls: number;
  connectedCalls: number;
  connectedRate: number;
  interestedCalls: number;
  interestedRate: number;
  totalTalkTimeSeconds: number;
  pendingFollowUps: number;
  overdueFollowUps: number;
  todayFollowUps: number;
  activeCallersCount: number;
  totalCallersCount: number;
}

export interface AdminCallerLeaderboardItem {
  userId: number;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  dailyTarget: number;
  weeklyTarget: number;
  callsCount: number;
  connectedCount: number;
  interestedCount: number;
  totalTalkTimeSeconds: number;
  targetAchievementPercentage: number;
  pendingFollowUpsCount: number;
  totalAssignedContacts: number;
}

export interface AdminDashboardResponse {
  summary: AdminDashboardSummary;
  leaderboard: AdminCallerLeaderboardItem[];
  dateRange: {
    startDate?: string;
    endDate?: string;
  };
}

export interface AdminCallRow {
  id: number;
  user_id: number;
  caller_name: string;
  caller_email: string;
  contact_id?: number | null;
  contact_name: string;
  contact_number: string;
  project_id?: number | null;
  project_name?: string | null;
  project_ids?: number[];
  project_names?: string | null;
  projects?: Array<{ id: number; name: string }>;
  duration_seconds: number;
  status: 'answered' | 'not_answered';
  purpose?: string | null;
  outcome?: string | null;
  follow_up_date?: string | null;
  follow_up_status?: string | null;
  called_at: string;
  created_at: string;
  filtered_total?: number;
  total_duration_filtered?: number;
  connected_calls_filtered?: number;
}

export interface AdminCallFilters {
  search?: string;
  userId?: number;
  projectId?: number;
  status?: string;
  outcome?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}
