import axios from 'axios';
import { API_BASE_URL } from '../config';

const cleanBaseUrl = API_BASE_URL.replace(/\/$/, '');

export interface User {
  id: number;
  fullName: string;
  name?: string;
  email: string;
  mobileNumber: string;
  role?: string;
}

export interface AuthResponse {
  status: string;
  message?: string;
  token: string;
  user: User;
}

export interface RegisterPayload {
  fullName: string;
  email: string;
  mobileNumber: string;
  password: string;
  confirmPassword: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export async function registerApi(payload: RegisterPayload): Promise<AuthResponse> {
  const response = await axios.post<AuthResponse>(`${cleanBaseUrl}/api/auth/register`, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  });
  return response.data;
}

export async function loginApi(payload: LoginPayload): Promise<AuthResponse> {
  const response = await axios.post<AuthResponse>(`${cleanBaseUrl}/api/auth/login`, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  });
  return response.data;
}

export async function getMeApi(token: string): Promise<{ status: string; user: User }> {
  const response = await axios.get<{ status: string; user: User }>(`${cleanBaseUrl}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    timeout: 10000,
  });
  return response.data;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export async function changePasswordApi(
  payload: ChangePasswordPayload,
  token: string
): Promise<{ success: boolean }> {
  const response = await axios.patch<{ success: boolean }>(
    `${cleanBaseUrl}/auth/change-password`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      timeout: 10000,
    }
  );
  return response.data;
}

