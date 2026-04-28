import apiClient from './client';

export interface Task {
  task_id: string;
  project_id: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignee_id: string;
  assignee_name?: string;
  due_date: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  comment_id: string;
  task_id: string;
  user_id: string;
  user_name: string;
  body: string;
  created_at: string;
}

export interface CreateTaskInput {
  project_id: string;
  title: string;
  description: string;
  priority: Task['priority'];
  assignee_id: string;
  due_date: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: Task['status'];
  priority?: Task['priority'];
  assignee_id?: string;
  due_date?: string;
}

export interface ListTasksQuery {
  project_id?: string;
  assignee_id?: string | 'me';
  status?: Task['status'];
  overdue?: boolean;
  limit?: number;
  last_key?: string;
}

export interface PaginatedTasks {
  items: Task[];
  last_key?: string;
  count: number;
}

export const tasksApi = {
  list(query?: ListTasksQuery): Promise<PaginatedTasks> {
    return apiClient.get('/tasks', { params: query }).then(r => r.data);
  },

  get(taskId: string): Promise<Task> {
    return apiClient.get(`/tasks/${taskId}`).then(r => r.data);
  },

  listComments(taskId: string): Promise<Comment[]> {
    return apiClient.get(`/tasks/${taskId}/comments`).then(r => r.data);
  },

  create(input: CreateTaskInput): Promise<Task> {
    return apiClient.post('/tasks', input).then(r => r.data);
  },

  update(taskId: string, input: UpdateTaskInput): Promise<Task> {
    return apiClient.put(`/tasks/${taskId}`, input).then(r => r.data);
  },

  delete(taskId: string): Promise<void> {
    return apiClient.delete(`/tasks/${taskId}`).then(r => r.data);
  },

  addComment(taskId: string, body: string): Promise<Comment> {
    return apiClient.post(`/tasks/${taskId}/comments`, { body }).then(r => r.data);
  },
};
