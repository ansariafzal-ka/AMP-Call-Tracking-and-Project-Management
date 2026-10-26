import { RowDataPacket } from 'mysql2/promise';

export interface UserRow extends RowDataPacket {
  id: number;
  full_name: string;
  email: string;
  mobile_number: string;
  password_hash: string;
  is_active: number;
  created_at: Date;
}

export interface UserResponse {
  id: number;
  fullName: string;
  email: string;
  mobileNumber: string;
  createdAt?: Date;
}

export interface RegisterDTO {
  fullName: string;
  email: string;
  mobileNumber: string;
  passwordHash: string;
}
