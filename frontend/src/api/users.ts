import apiClient from './client';

export interface Member {
  user_id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'member';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateMemberInput {
  email: string;
  name: string;
  role: Member['role'];
}

export interface UpdateMemberInput {
  name?: string;
  role?: Member['role'];
  is_active?: boolean;
}

export const usersApi = {
  list(): Promise<Member[]> {
    return apiClient.get('/users').then(r => (r.data as { items: Member[] }).items);
  },

  create(input: CreateMemberInput): Promise<Member> {
    return apiClient.post('/users', input).then(r => r.data);
  },

  update(userId: string, input: UpdateMemberInput): Promise<Member> {
    return apiClient.put(`/users/${userId}`, input).then(r => r.data);
  },

  disable(userId: string): Promise<void> {
    return apiClient.put(`/users/${userId}`, { is_active: false }).then(() => undefined);
  },

  enable(userId: string): Promise<void> {
    return apiClient.put(`/users/${userId}`, { is_active: true }).then(() => undefined);
  },
};
