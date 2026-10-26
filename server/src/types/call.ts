import { RowDataPacket } from 'mysql2/promise';

export type CallStatus = 'answered' | 'not_answered';

export type CallOutcome =
  | 'interested'
  | 'not_interested'
  | 'unanswered'
  | 'follow_up_required'
  | null;

export interface CallRow extends RowDataPacket {
  id: number;
  user_id: number;
  contact_number: string;
  duration_seconds: number;
  status: CallStatus;
  purpose: string | null;
  outcome: CallOutcome;
  called_at: Date;
  created_at: Date;
}

export interface SummaryRow extends RowDataPacket {
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
  called_at: string; // Formatted MySQL datetime string
}

export interface UpdateCallDTO {
  purpose?: string | null;
  outcome?: CallOutcome;
}

export interface CallFilters {
  search?: string;
  outcome?: string;
  status?: string;
}

export interface GetCallsResult {
  calls: CallRow[];
  filtered_total: number;
}

