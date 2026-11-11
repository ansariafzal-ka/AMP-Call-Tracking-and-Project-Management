import axios from 'axios';
import { API_BASE_URL } from '../config';

const cleanBaseUrl = API_BASE_URL.replace(/\/$/, '');

export type FollowUpFilterTab = 'all' | 'overdue' | 'today' | 'upcoming' | 'completed';

export interface FollowUpItem {
  id: number;
  user_id: number;
  contact_id: number;
  contact_name: string;
  contact_mobile: string;
  contact_category?: string | null;
  contact_city?: string | null;
  contact_state?: string | null;
  contact_pin_code?: string | null;
  project_id?: number | null;
  project_name?: string | null;
  call_id?: number | null;
  due_at: string;
  status: 'pending' | 'completed' | 'cancelled';
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

export interface FetchFollowUpsParams {
  status?: FollowUpFilterTab;
  page?: number;
  limit?: number;
}

export interface FetchFollowUpsResponse {
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

export async function fetchFollowUps(
  token: string,
  params: FetchFollowUpsParams = {}
): Promise<FetchFollowUpsResponse> {
  const queryParams = new URLSearchParams();
  if (params.status) queryParams.append('status', params.status);
  if (params.page) queryParams.append('page', String(params.page));
  if (params.limit) queryParams.append('limit', String(params.limit));

  const url = `${cleanBaseUrl}/api/follow-ups?${queryParams.toString()}`;

  const response = await axios.get<FetchFollowUpsResponse>(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    timeout: 10000,
  });

  return response.data;
}

export async function completeFollowUp(
  token: string,
  id: number,
  notes?: string
): Promise<{ success: boolean; message: string }> {
  const url = `${cleanBaseUrl}/api/follow-ups/${id}/complete`;
  const response = await axios.patch(
    url,
    { notes },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  );
  return response.data;
}

export async function rescheduleFollowUp(
  token: string,
  id: number,
  newDueAt: string,
  notes?: string
): Promise<{ success: boolean; message: string }> {
  const url = `${cleanBaseUrl}/api/follow-ups/${id}/reschedule`;
  const response = await axios.patch(
    url,
    { newDueAt, notes },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  );
  return response.data;
}

