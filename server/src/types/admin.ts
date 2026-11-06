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
  category: string;
  notes?: string | null;
  created_at: string;
  assigned_user_id?: number | null;
  assigned_user_name?: string | null;
  assigned_user_email?: string | null;
  total_calls?: number;
  last_called_at?: string | null;
  last_call_status?: string | null;
  last_call_outcome?: string | null;
  filtered_total?: number;
}

export interface AdminContactFilters {
  search?: string;
  category?: string;
  city?: string;
  assignedUserId?: number;
  unassignedOnly?: boolean;
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
