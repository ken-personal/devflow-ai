import apiClient from './client';

export interface Report {
  report_id: string;
  title: string;
  report_type: 'weekly' | 'monthly' | 'project' | 'custom';
  content: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ListReportsQuery {
  report_type?: Report['report_type'];
  limit?: number;
  last_key?: string;
}

export interface PaginatedReports {
  items: Report[];
  last_key?: string;
  count: number;
}

export const reportsApi = {
  list(query?: ListReportsQuery): Promise<PaginatedReports> {
    return apiClient.get('/reports', { params: query }).then(r => r.data);
  },

  get(reportId: string): Promise<Report> {
    return apiClient.get(`/reports/${reportId}`).then(r => r.data);
  },
};
