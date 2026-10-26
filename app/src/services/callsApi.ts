import axios from 'axios';
import { API_BASE_URL } from '../config';

const cleanBaseUrl = API_BASE_URL.replace(/\/$/, '');

export interface CallSummary {
  total_calls: number;
  total_duration_seconds: number;
}

export type CallOutcome = 'interested' | 'not_interested' | 'unanswered' | 'follow_up_required' | null;

export interface CallItem {
  id: number;
  user_id: number;
  contact_number: string;
  duration_seconds: number;
  status: 'answered' | 'not_answered';
  purpose: string | null;
  outcome: CallOutcome;
  called_at: string;
  created_at: string;
}

export interface CallsResponse {
  summary: CallSummary;
  filtered_total: number;
  calls: CallItem[];
}

export interface FetchCallsParams {
  limit?: number;
  offset?: number;
  search?: string;
  outcome?: string;
  status?: string;
}

export interface CreateCallPayload {
  contact_number: string;
  duration_seconds: number;
  status?: 'answered' | 'not_answered';
  purpose?: string | null;
  outcome?: CallOutcome;
  called_at: string; // ISO string
}

export async function createCallRecord(payload: CreateCallPayload, token: string): Promise<CallItem> {
  const response = await axios.post<{ status: string; call: CallItem }>(
    `${cleanBaseUrl}/calls`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  );
  return response.data.call;
}

export async function fetchCalls(
  { limit = 50, offset = 0, search, outcome, status }: FetchCallsParams,
  token: string
): Promise<CallsResponse> {
  const params: Record<string, any> = { limit, offset };
  if (search && search.trim()) params.search = search.trim();
  if (outcome && outcome !== 'all') params.outcome = outcome;
  if (status && status !== 'all') params.status = status;

  const response = await axios.get<CallsResponse>(`${cleanBaseUrl}/calls`, {
    params,
    headers: {
      Authorization: `Bearer ${token}`,
    },
    timeout: 10000,
  });
  return response.data;
}

export interface UpdateCallPayload {
  purpose?: string | null;
  outcome?: CallOutcome;
}

export async function updateCallRecord(
  id: number,
  payload: UpdateCallPayload,
  token: string
): Promise<CallItem> {
  const response = await axios.patch<{ status: string; call: CallItem }>(
    `${cleanBaseUrl}/calls/${id}`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  );
  return response.data.call;
}

