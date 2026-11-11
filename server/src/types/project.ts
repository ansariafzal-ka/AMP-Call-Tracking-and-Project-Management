export interface ProjectRow {
  id: number;
  name: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
  total_contacts?: number;
  total_callers?: number;
  total_calls_made?: number;
  connected_calls?: number;
  contacts_reached?: number;
  filtered_total?: number;
}

export interface ProjectDetailResponse {
  project: ProjectRow;
  callers: { id: number; fullName: string; email: string; role: string }[];
  contacts: { id: number; name: string; mobileNumber: string; category: string }[];
}

export interface CreateProjectDTO {
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  status?: 'active' | 'paused' | 'completed';
}

export interface UpdateProjectDTO {
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  status?: 'active' | 'paused' | 'completed';
}

export interface AssignProjectMembersDTO {
  userIds?: number[];
  contactIds?: number[];
  action?: 'add' | 'remove';
}

export interface ProjectFilters {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

