import { Request } from 'express';

export interface JwtUserPayload {
  id: number;
  email: string;
  fullName: string;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtUserPayload;
}
