export interface IntegrationAction {
  id: string;
  name: string;
  description: string;
}

export interface IntegrationTrigger {
  id: string;
  name: string;
  description: string;
}

export interface IntegrationConfig {
  id: string;
  displayName: string;
  authType: 'oauth2' | 'api_key' | 'webhook';
  triggers: IntegrationTrigger[];
  actions: IntegrationAction[];
}

export const IntegrationRegistry: Record<string, IntegrationConfig> = {
  slack: {
    id: 'slack',
    displayName: 'Slack',
    authType: 'oauth2',
    triggers: [{ id: 'message_received', name: 'Message Received', description: 'Triggers when a new message is received' }],
    actions: [{ id: 'send_message', name: 'Send Message', description: 'Sends a message to a channel' }]
  },
  whatsapp: {
    id: 'whatsapp',
    displayName: 'WhatsApp',
    authType: 'api_key',
    triggers: [{ id: 'message_received', name: 'Message Received', description: 'Triggers when a new WhatsApp message is received' }],
    actions: [{ id: 'send_template_message', name: 'Send Template Message', description: 'Sends an approved template message' }]
  },
  gmail: {
    id: 'gmail',
    displayName: 'Gmail',
    authType: 'oauth2',
    triggers: [{ id: 'email_received', name: 'Email Received', description: 'Triggers when a new email matches criteria' }],
    actions: [{ id: 'send_email', name: 'Send Email', description: 'Sends an email from the connected account' }]
  },
  stripe: {
    id: 'stripe',
    displayName: 'Stripe',
    authType: 'api_key',
    triggers: [{ id: 'payment_succeeded', name: 'Payment Succeeded', description: 'Triggers when a payment is successful' }, { id: 'subscription_created', name: 'Subscription Created', description: 'Triggers when a subscription is created' }],
    actions: [{ id: 'create_invoice', name: 'Create Invoice', description: 'Creates a Stripe invoice' }]
  },
  webhook: {
    id: 'webhook',
    displayName: 'Webhook',
    authType: 'webhook',
    triggers: [{ id: 'webhook_received', name: 'Webhook Received', description: 'Triggers when HTTP POST is received' }],
    actions: [{ id: 'send_webhook', name: 'Send Webhook', description: 'Sends an HTTP POST to a URL' }]
  }
};

export function validateIntegrationHook(integrationId: string, actionId: string): boolean {
  const integration = IntegrationRegistry[integrationId];
  if (!integration) return false;
  return integration.actions.some(a => a.id === actionId);
}
