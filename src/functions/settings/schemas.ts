import { z } from 'zod';

export const updateBedrockSettingsSchema = z.object({
  model_id: z.string()
    .refine(
      v => [
        'anthropic.claude-3-5-sonnet-20241022-v2:0',
        'anthropic.claude-3-haiku-20240307-v1:0',
        'anthropic.claude-3-sonnet-20240229-v1:0',
      ].includes(v),
      { message: '許可されていないモデルIDです' },
    ).optional(),
  temperature: z.number().min(0).max(1).optional(),
  max_tokens:  z.number().int().min(100).max(4096).optional(),
});

export type UpdateBedrockSettingsInput = z.infer<typeof updateBedrockSettingsSchema>;
