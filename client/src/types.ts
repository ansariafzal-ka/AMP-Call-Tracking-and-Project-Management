export type CallStatus = 'answered' | 'not_answered';

export type CallOutcome =
  | 'interested'
  | 'not_interested'
  | 'unanswered'
  | 'follow_up_required'
  | null;

export interface User {
  id: number;
  fullName: string;
  name?: string;
  email: string;
  mobileNumber: string;
  role?: 'admin' | 'caller';
  createdAt?: string;
}

export interface Call {
  id: number;
  user_id: number;
  contact_id?: number | null;
  contact_name?: string | null;
  contact_category?: string | null;
  contact_city?: string | null;
  contact_state?: string | null;
  contact_pin_code?: string | null;
  contact_number: string;
  project_id?: number | null;
  project_name?: string | null;
  duration_seconds: number;
  status: CallStatus;
  purpose: string | null;
  outcome: CallOutcome;
  follow_up_date?: string | null;
  follow_up_status?: 'pending' | 'completed' | 'cancelled' | null;
  called_at: string;
  created_at: string;
}

export interface UserStats {
  totalAssignedContacts: number;
  callsMadeToday: number;
  connectedCallsToday: number;
  totalTalkTimeTodaySeconds: number;
  pendingFollowUps: number;
  totalCallsAllTime: number;
}

export interface CallSummary {
  total_calls: number;
  total_duration_seconds: number;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  fullName: string;
  email: string;
  mobileNumber: string;
  password: string;
  confirmPassword: string;
}

export interface AuthResponse {
  status: 'ok' | 'error';
  message: string;
  token?: string;
  user?: User;
}

export interface MeResponse {
  status: 'ok' | 'error';
  user: User;
  message?: string;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export interface ChangePasswordResponse {
  success?: boolean;
  error?: string;
}

export interface GetCallsParams {
  limit: number;
  offset: number;
  search?: string;
  outcome?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export interface GetCallsResponse {
  summary: CallSummary;
  filtered_total: number;
  calls: Call[];
}

export interface UpdateCallPayload {
  purpose?: string | null;
  outcome?: CallOutcome;
  follow_up_date?: string | null;
}

export interface UpdateCallResponse {
  status: 'ok' | 'error';
  call: Call;
  message?: string;
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

export interface AdminDashboardData {
  summary: AdminDashboardSummary;
  leaderboard: AdminCallerLeaderboardItem[];
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  start_date?: string | null;
  end_date?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status: 'active' | 'completed' | 'archived';
  total_contacts?: number | string;
  total_callers?: number | string;
  total_calls_made?: number | string;
  connected_calls?: number | string;
  contacts_reached?: number | string;
  created_at: string;
  updated_at?: string;
}

export interface GetAdminProjectsResponse {
  success: boolean;
  data: {
    projects: Project[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface CreateProjectPayload {
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  status?: 'active' | 'completed' | 'archived';
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  status?: 'active' | 'completed' | 'archived';
}

export interface AdminUser {
  id: number;
  full_name: string;
  email: string;
  mobile_number: string;
  role: 'admin' | 'caller';
  is_active: boolean;
  daily_target: number;
  weekly_target: number;
  total_assigned_contacts: number | string;
  calls_made_today: number | string;
  created_at: string;
}

export interface GetAdminUsersResponse {
  success: boolean;
  data: {
    users: AdminUser[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface CreateAdminUserPayload {
  fullName: string;
  email: string;
  mobileNumber: string;
  password: string;
  role: 'admin' | 'caller';
  dailyTarget: number;
  weeklyTarget: number;
}

export interface UpdateAdminUserPayload {
  fullName?: string;
  mobileNumber?: string;
  role?: 'admin' | 'caller';
  isActive?: boolean;
  dailyTarget?: number;
  weeklyTarget?: number;
}

export interface AdminContact {
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
  assigned_user_id?: number | null;
  assigned_user_name?: string | null;
  assigned_user_email?: string | null;
  project_id?: number | null;
  project_name?: string | null;
  project_ids?: number[];
  project_names?: string | null;
  projects?: Array<{ id: number; name: string }>;
  total_calls?: number | string;
  last_called_at?: string | null;
  last_call_status?: CallStatus | null;
  last_call_outcome?: CallOutcome | null;
  created_at: string;
}

export interface UpdateAdminContactPayload {
  name: string;
  mobile_number: string;
  alternate_number?: string | null;
  email?: string | null;
  city?: string | null;
  category?: string;
  notes?: string | null;
  project_id?: number | null;
  assigned_user_id?: number | null;
}

export interface GetAdminContactsResponse {
  success: boolean;
  data: {
    contacts: AdminContact[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface AssignContactsPayload {
  contactIds: number[];
  targetUserId: number;
  reassignFollowUps?: boolean;
}

export interface FollowUpItem {
  id: number;
  user_id: number;
  contact_id: number;
  contact_name: string;
  contact_mobile: string;
  contact_category: string;
  contact_city?: string | null;
  contact_state?: string | null;
  contact_pin_code?: string | null;
  project_id?: number | null;
  project_name?: string | null;
  call_id?: number | null;
  due_at: string;
  status: 'pending' | 'completed' | 'rescheduled' | 'cancelled';
  notes?: string | null;
  completed_at?: string | null;
  created_at: string;
}

export interface FollowUpSummaryCounts {
  today: number;
  overdue: number;
  upcoming: number;
  completed: number;
  all?: number;
}

export interface GetFollowUpsResponse {
  success: boolean;
  data: {
    summary: FollowUpSummaryCounts;
    followUps: FollowUpItem[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface CallerContact {
  id: number;
  assigned_user_id: number;
  name: string;
  mobile_number: string;
  alternate_number?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  pin_code?: string | null;
  category: string;
  notes?: string | null;
  project_id?: number | null;
  project_name?: string | null;
  created_at: string;
  total_calls?: number | string;
  last_called_at?: string | null;
  last_call_status?: CallStatus | null;
}

export interface GetCallerContactsResponse {
  success: boolean;
  data: {
    contacts: CallerContact[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface ContactCallHistoryItem {
  id: number;
  contact_id: number;
  user_id: number;
  caller_name?: string;
  duration_seconds: number;
  status: CallStatus;
  purpose: string | null;
  outcome: CallOutcome;
  notes?: string | null;
  follow_up_date?: string | null;
  called_at: string;
}

export interface GetContactDetailsResponse {
  success: boolean;
  data: {
    contact: CallerContact;
    callHistory?: ContactCallHistoryItem[];
    call_history?: ContactCallHistoryItem[];
  };
}

export interface AdminCallItem {
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
  status: CallStatus;
  purpose?: string | null;
  outcome?: CallOutcome;
  follow_up_date?: string | null;
  follow_up_status?: 'pending' | 'completed' | 'cancelled' | null;
  called_at: string;
  created_at: string;
}

export interface GetAdminCallsResponse {
  success: boolean;
  data: {
    summary: {
      totalCalls: number;
      connectedCalls: number;
      connectedRate: number;
      totalDurationSeconds: number;
    };
    calls: AdminCallItem[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}




