import apiClient from './client';

export interface Project {
  project_id: string;
  name: string;
  client_name: string;
  description?: string;
  status: 'planning' | 'active' | 'review' | 'hold' | 'delayed';
  start_date: string;
  end_date: string;
  budget?: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectAssignee {
  user_id: string;
  name: string;
  email: string;
  role: string;
  assigned_at: string;
}

export interface CreateProjectInput {
  name: string;
  client_name: string;
  description?: string;
  status: Project['status'];
  start_date: string;
  end_date: string;
  budget?: number;
  assignee_ids?: string[];
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: Project['status'];
  start_date?: string;
  end_date?: string;
  budget?: number;
  assignee_ids?: string[];
}

export interface ListProjectsQuery {
  status?: Project['status'];
  limit?: number;
  last_key?: string;
}

export interface PaginatedProjects {
  items: Project[];
  last_key?: string;
  count: number;
}

export const projectsApi = {
  list(query?: ListProjectsQuery): Promise<PaginatedProjects> {
    return apiClient.get('/projects', { params: query }).then(r => r.data);
  },

  get(projectId: string): Promise<Project> {
    return apiClient.get(`/projects/${projectId}`).then(r => r.data);
  },

  getAssignees(projectId: string): Promise<ProjectAssignee[]> {
    return apiClient.get(`/projects/${projectId}/assignees`).then(r => r.data);
  },

  create(input: CreateProjectInput): Promise<Project> {
    return apiClient.post('/projects', input).then(r => r.data);
  },

  update(projectId: string, input: UpdateProjectInput): Promise<Project> {
    return apiClient.put(`/projects/${projectId}`, input).then(r => r.data);
  },

  delete(projectId: string): Promise<void> {
    return apiClient.delete(`/projects/${projectId}`).then(r => r.data);
  },
};
