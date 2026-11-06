export interface UserRow {
  id: number;
  full_name: string;
  email: string;
  mobile_number: string;
  password_hash: string;
  role?: string;
  daily_target?: number;
  weekly_target?: number;
  is_active: boolean | number;
  created_at: Date;
}

export interface UserResponse {
  id: number;
  fullName: string;
  email: string;
  mobileNumber: string;
  role?: string;
  dailyTarget?: number;
  weeklyTarget?: number;
  createdAt?: Date;
}

export interface RegisterDTO {
  fullName: string;
  email: string;
  mobileNumber: string;
  passwordHash: string;
}

export interface UserStats {
  totalAssignedContacts: number;
  callsMadeToday: number;
  connectedCallsToday: number;
  totalTalkTimeTodaySeconds: number;
  pendingFollowUps: number;
  totalCallsAllTime: number;
}
