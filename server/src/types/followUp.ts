export interface FollowUpRow {
  id: number;
  user_id: number;
  contact_id: number;
  contact_name: string;
  contact_mobile: string;
  contact_category: string;
  contact_city?: string | null;
  contact_state?: string | null;
  contact_pin_code?: string | null;
  call_id?: number | null;
  due_at: string;
  status: 'pending' | 'completed' | 'rescheduled' | 'cancelled';
  notes?: string | null;
  completed_at?: string | null;
  created_at: string;
  today_count?: number;
  overdue_count?: number;
  upcoming_count?: number;
  completed_count?: number;
  filtered_total?: number;
}

export interface FollowUpSummaryCounts {
  today: number;
  overdue: number;
  upcoming: number;
  completed: number;
  all?: number;
}

export interface CreateFollowUpDTO {
  contactId: number;
  callId?: number;
  dueAt: string;
  notes?: string;
}

export interface RescheduleFollowUpDTO {
  newDueAt: string;
  notes?: string;
}

export interface CompleteFollowUpDTO {
  notes?: string;
}

