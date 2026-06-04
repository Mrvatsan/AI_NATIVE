export const IntegrationRegistry: Record<string, string[]> = {
  slack: ['post_message', 'notify'],
  salesforce: ['create_lead', 'sync_contact'],
  hubspot: ['create_contact'],
  whatsapp: ['send_template_message', 'send_notification'],
  gmail: ['send_email'],
  notion: ['create_page'],
  airtable: ['append_record'],
  stripe: ['create_customer', 'create_charge'],
  twilio_sms: ['send_sms'],
  webhook: ['trigger_webhook'],
  google_sheets: ['append_row'],
  jira: ['create_issue'],
  github: ['create_issue', 'trigger_workflow'],
  zapier: ['trigger_zap']
};
