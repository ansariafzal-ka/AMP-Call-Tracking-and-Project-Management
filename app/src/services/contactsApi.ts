import axios from 'axios';
import { API_BASE_URL } from '../config';

const cleanBaseUrl = API_BASE_URL.replace(/\/$/, '');

export interface CallerContactItem {
  id: number;
  assigned_user_id?: number;
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
  total_calls: number | string;
  last_called_at?: string | null;
  last_call_status?: 'answered' | 'not_answered' | null;
  last_call_outcome?: string | null;
}

export interface FetchContactsParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
}

export interface FetchContactsResponse {
  success: boolean;
  data: {
    contacts: CallerContactItem[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface ContactCallHistoryRecord {
  id: number;
  duration_seconds: number;
  status: 'answered' | 'not_answered';
  purpose?: string | null;
  outcome?: string | null;
  called_at: string;
  caller_name?: string;
  notes?: string | null;
  follow_up_date?: string | null;
}

export interface ContactDetailsResponse {
  success: boolean;
  data: {
    contact: CallerContactItem;
    callHistory: ContactCallHistoryRecord[];
  };
}

export async function fetchAssignedContacts(
  params: FetchContactsParams,
  token: string
): Promise<{ contacts: CallerContactItem[]; total: number; totalPages: number }> {
  const queryParams: Record<string, any> = {
    page: params.page || 1,
    limit: params.limit || 20,
  };

  if (params.search?.trim()) {
    queryParams.search = params.search.trim();
  }

  if (params.category && params.category !== 'All') {
    queryParams.category = params.category;
  }

  const res = await axios.get<FetchContactsResponse>(`${cleanBaseUrl}/api/contacts`, {
    params: queryParams,
    headers: {
      Authorization: `Bearer ${token}`,
    },
    timeout: 10000,
  });

  if (res.data?.success && res.data.data) {
    return {
      contacts: res.data.data.contacts || [],
      total: res.data.data.pagination?.total || 0,
      totalPages: res.data.data.pagination?.totalPages || 1,
    };
  }

  return { contacts: [], total: 0, totalPages: 1 };
}

export async function fetchContactDetails(
  contactId: number,
  token: string
): Promise<{ contact: CallerContactItem; callHistory: ContactCallHistoryRecord[] }> {
  const res = await axios.get<ContactDetailsResponse>(
    `${cleanBaseUrl}/api/contacts/${contactId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeout: 10000,
    }
  );

  if (res.data?.success && res.data.data) {
    return {
      contact: res.data.data.contact,
      callHistory: res.data.data.callHistory || [],
    };
  }

  throw new Error('Failed to fetch contact details');
}

export interface RecognizedContact {
  contact_id: number;
  name: string;
  mobile_number: string;
  category: string;
  city?: string | null;
  state?: string | null;
  pin_code?: string | null;
  is_assigned_to_caller: boolean;
  assigned_user_id?: number;
  assigned_user_name?: string;
  project_id?: number;
  project_name?: string;
  total_calls: number | string;
  last_called_at?: string | null;
  last_call_status?: string | null;
  last_call_outcome?: string | null;
  pending_follow_up_due_at?: string | null;
}

export async function lookupContactNumber(
  number: string,
  token: string
): Promise<RecognizedContact | null> {
  try {
    const res = await axios.get<{ success: boolean; data: { contact: RecognizedContact | null } }>(
      `${cleanBaseUrl}/api/contacts/lookup`,
      {
        params: { number },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000,
      }
    );
    return res.data?.data?.contact || null;
  } catch (err) {
    return null;
  }
}

