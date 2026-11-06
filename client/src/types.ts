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
  createdAt?: string;
}

export interface Call {
  id: number;
  user_id: number;
  contact_id?: number | null;
  contact_name?: string | null;
  contact_number: string;
  duration_seconds: number;
  status: CallStatus;
  purpose: string | null;
  outcome: CallOutcome;
  follow_up_date?: string | null;
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
