import apiClient from './client';

export interface BedrockSettings {
  model_id: string;
  temperature: number;
  max_tokens: number;
  updated_at: string | null;
  updated_by: string | null;
}

export interface UpdateBedrockSettingsInput {
  model_id?: string;
  temperature?: number;
  max_tokens?: number;
}

export const ALLOWED_MODELS = [
  { id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', label: 'Claude 3.5 Sonnet（推奨）' },
  { id: 'anthropic.claude-3-sonnet-20240229-v1:0',   label: 'Claude 3 Sonnet' },
  { id: 'anthropic.claude-3-haiku-20240307-v1:0',    label: 'Claude 3 Haiku（低コスト）' },
] as const;

export const settingsApi = {
  getBedrock(): Promise<BedrockSettings> {
    return apiClient.get('/settings/bedrock').then(r => r.data);
  },

  updateBedrock(input: UpdateBedrockSettingsInput): Promise<BedrockSettings> {
    return apiClient.put('/settings/bedrock', input).then(r => r.data);
  },
};
