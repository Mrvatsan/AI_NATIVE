import { z } from 'zod';

// Supported appType values
export const appTypeEnum = z.enum([
  'crm',
  'project_management',
  'ecommerce',
  'hr_tool',
  'inventory',
  'content_platform',
  'analytics',
  'custom'
]);

export const AppIntentSchema = z.object({
  appName: z.string(),
  appType: appTypeEnum,
  features: z.array(z.string()),
  entities: z.array(z.string()),
  integrations_requested: z.array(z.string()),
  assumptions: z.array(z.string())
});

export type AppIntent = z.infer<typeof AppIntentSchema>;
