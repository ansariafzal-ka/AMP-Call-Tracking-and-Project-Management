export interface ContactRow {
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
  created_at: string;
  total_calls?: number;
  last_called_at?: string | null;
  last_call_status?: string | null;
  last_call_outcome?: string | null;
  filtered_total?: number;
}

export interface ContactDetailResponse {
  contact: ContactRow;
  call_history: any[];
}

export interface ContactFilters {
  search?: string;
  category?: string;
  page?: number;
  limit?: number;
}

