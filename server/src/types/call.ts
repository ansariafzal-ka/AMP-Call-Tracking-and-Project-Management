export type CallStatus = 'answered' | 'not_answered';

export type CallOutcome =
  | 'interested'
  | 'not_interested'
  | 'unanswered'
  | 'follow_up_required'
  | null;

export interface CallRow {
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
  follow_up_date: string | null;
  follow_up_status?: 'pending' | 'completed' | 'cancelled' | null;
  called_at: Date;
  created_at: Date;
}

export interface SummaryRow {
  total_calls: number | string;
  total_duration_seconds: number | string;
}

export interface CallSummary {
  total_calls: number;
  total_duration_seconds: number;
}

export interface CreateCallDTO {
  contact_number: string;
  duration_seconds: number;
  status: CallStatus;
  purpose: string | null;
  outcome: CallOutcome;
  called_at: string;
  follow_up_date?: string | null;
}

export interface UpdateCallDTO {
  purpose?: string | null;
  outcome?: CallOutcome;
  follow_up_date?: string | null;
}

export interface CallFilters {
  search?: string;
  outcome?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export interface GetCallsResult {
  calls: CallRow[];
  filtered_total: number;
}
