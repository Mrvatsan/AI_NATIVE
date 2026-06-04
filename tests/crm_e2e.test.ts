import { IntentExtractor } from '../src/extractor/index';
import { SchemaGenerator } from '../src/schema_gen/index';
import { AppSpecGenerator } from '../src/app_spec/index';
import { AIGatewayClient, GatewayRequest } from '../src/gateway/gateway';

class RealEstateDemoGateway implements AIGatewayClient {
  async generateStructuredOutput<T>(request: GatewayRequest): Promise<T> {
    const prompt = request.prompt;
    
    if (prompt.includes('CRM for a real estate agency')) {
      const intentResponse = {
        appName: 'Real Estate CRM',
        appType: 'crm',
        features: ['Analytics', 'Lead Management', 'Property Management', 'Deal Management'],
        entities: ['Lead', 'Property', 'Deal'],
        integrations_requested: ['whatsapp'],
        assumptions: ['Assuming Agents and Admins correspond to Roles.']
      };
      return intentResponse as unknown as T;
    }

    if (prompt.includes('"appName":"Real Estate CRM"')) {
      const schemaResponse = {
        entities: [
          {
            name: 'Lead',
            tableName: 'leads',
            fields: [
              { name: 'id', type: 'uuid', nullable: false, isPrimary: true, isUnique: true, isRelation: false },
              { name: 'tenantId', type: 'uuid', nullable: false, isPrimary: false, isUnique: false, isRelation: false },
              { name: 'name', type: 'string', nullable: false, isPrimary: false, isUnique: false, isRelation: false }
            ],
            relations: [{ type: 'hasMany', targetEntity: 'Deal' }],
            foreignKeys: []
          },
          {
            name: 'Property',
            tableName: 'properties',
            fields: [
              { name: 'id', type: 'uuid', nullable: false, isPrimary: true, isUnique: true, isRelation: false },
              { name: 'tenantId', type: 'uuid', nullable: false, isPrimary: false, isUnique: false, isRelation: false },
              { name: 'title', type: 'string', nullable: false, isPrimary: false, isUnique: false, isRelation: false }
            ],
            relations: [],
            foreignKeys: []
          },
          {
            name: 'Deal',
            tableName: 'deals',
            fields: [
              { name: 'id', type: 'uuid', nullable: false, isPrimary: true, isUnique: true, isRelation: false },
              { name: 'tenantId', type: 'uuid', nullable: false, isPrimary: false, isUnique: false, isRelation: false },
              { name: 'amount', type: 'number', nullable: false, isPrimary: false, isUnique: false, isRelation: false },
              { name: 'leadId', type: 'uuid', nullable: false, isPrimary: false, isUnique: false, isRelation: true }
            ],
            relations: [{ type: 'belongsTo', targetEntity: 'Lead' }],
            foreignKeys: [{ columnName: 'leadId', referencedTable: 'leads', referencedColumn: 'id', onDelete: 'CASCADE' }]
          }
        ]
      };
      return schemaResponse as unknown as T;
    }

    if (prompt.includes('"entities":')) {
      const appSpecResponse = {
        roles: ['admin', 'manager', 'user'],
        pages: [
          { name: 'Leads', route: '/leads', layout: 'list', boundEntity: 'Lead', components: ['table', 'form'] },
          { name: 'Properties', route: '/properties', layout: 'list', boundEntity: 'Property', components: ['table', 'form'] },
          { name: 'Deals', route: '/deals', layout: 'list', boundEntity: 'Deal', components: ['table', 'form'] },
          { name: 'Dashboard', route: '/dashboard', layout: 'dashboard', components: ['chart', 'card'] }
        ],
        apiEndpoints: [
          { path: '/api/leads', method: 'GET', handlerDescription: 'Retrieve Leads', boundEntity: 'Lead', authRequired: true, rateLimited: false },
          { path: '/api/leads', method: 'POST', handlerDescription: 'Create Lead', boundEntity: 'Lead', authRequired: true, rateLimited: false },
          { path: '/api/leads/:id', method: 'PUT', handlerDescription: 'Update Lead', boundEntity: 'Lead', authRequired: true, rateLimited: false },
          { path: '/api/leads/:id', method: 'DELETE', handlerDescription: 'Delete Lead', boundEntity: 'Lead', authRequired: true, rateLimited: false },
          { path: '/api/properties', method: 'GET', handlerDescription: 'Retrieve Properties', boundEntity: 'Property', authRequired: true, rateLimited: false },
          { path: '/api/properties', method: 'POST', handlerDescription: 'Create Property', boundEntity: 'Property', authRequired: true, rateLimited: false },
          { path: '/api/properties/:id', method: 'PUT', handlerDescription: 'Update Property', boundEntity: 'Property', authRequired: true, rateLimited: false },
          { path: '/api/properties/:id', method: 'DELETE', handlerDescription: 'Delete Property', boundEntity: 'Property', authRequired: true, rateLimited: false },
          { path: '/api/deals', method: 'GET', handlerDescription: 'Retrieve Deals', boundEntity: 'Deal', authRequired: true, rateLimited: false },
          { path: '/api/deals', method: 'POST', handlerDescription: 'Create Deal', boundEntity: 'Deal', authRequired: true, rateLimited: false },
          { path: '/api/deals/:id', method: 'PUT', handlerDescription: 'Update Deal', boundEntity: 'Deal', authRequired: true, rateLimited: false },
          { path: '/api/deals/:id', method: 'DELETE', handlerDescription: 'Delete Deal', boundEntity: 'Deal', authRequired: true, rateLimited: false }
        ],
        authRules: [
          { role: 'admin', entity: 'Lead', permissions: { read: true, write: true, delete: true } },
          { role: 'admin', entity: 'Property', permissions: { read: true, write: true, delete: true } },
          { role: 'admin', entity: 'Deal', permissions: { read: true, write: true, delete: true } },
          { role: 'manager', entity: 'Lead', permissions: { read: true, write: true, delete: false } },
          { role: 'manager', entity: 'Property', permissions: { read: true, write: true, delete: false } },
          { role: 'manager', entity: 'Deal', permissions: { read: true, write: true, delete: false } },
          { role: 'user', entity: 'Lead', permissions: { read: true, write: false, delete: false } },
          { role: 'user', entity: 'Property', permissions: { read: true, write: false, delete: false } },
          { role: 'user', entity: 'Deal', permissions: { read: true, write: false, delete: false } }
        ],
        integrationHooks: [
          { integrationId: 'whatsapp', triggerEntity: 'Deal', triggerEvent: 'status_changed', action: 'send_template_message' }
        ],
        workflowStubs: [
          {
            name: 'WhatsApp Deal Closed Notification',
            trigger: { entity: 'Deal', event: 'status_changed', condition: 'status === \'closed\'' },
            integration: 'whatsapp',
            action: 'send_template_message',
            payload: { dealId: 'Deal.id', amount: 'Deal.amount', leadId: 'Lead.id', leadName: 'Lead.name' }
          }
        ]
      };
      return appSpecResponse as unknown as T;
    }

    throw new Error(`Demo Gateway: Unhandled request for prompt: ${prompt}`);
  }
}

describe('Real Estate CRM Pipeline E2E', () => {
  it('should successfully run through Intent -> Schema -> AppSpec for the given prompt', async () => {
    const prompt = "Build a CRM for a real estate agency. Agents manage leads, properties, and deals. Admin sees analytics. WhatsApp notifications when a deal closes.";
    const routing = { provider: 'demo-provider', model: 'demo-model' };
    const gateway = new RealEstateDemoGateway();

    // Stage 1: Intent Extraction
    const extractor = new IntentExtractor(gateway);
    const extractionResult = await extractor.extract(prompt, routing);
    expect(extractionResult.success).toBe(true);
    expect(extractionResult.intent?.appName).toBe('Real Estate CRM');
    expect(extractionResult.intent?.integrations_requested).toContain('whatsapp');

    // Stage 2: Schema Generation
    const schemaGen = new SchemaGenerator(gateway);
    const schemaResult = await schemaGen.generate(extractionResult.intent!, routing);
    expect(schemaResult.success).toBe(true);
    expect(schemaResult.schema?.entities.length).toBe(3);
    const leadEntity = schemaResult.schema?.entities.find(e => e.name === 'Lead');
    expect(leadEntity).toBeDefined();

    // Stage 3: AppSpec Generation
    const appSpecGen = new AppSpecGenerator(gateway);
    const specResult = await appSpecGen.generate(
      schemaResult.schema!,
      extractionResult.intent!.integrations_requested,
      extractionResult.intent!.features,
      routing
    );
    expect(specResult.success).toBe(true);
    expect(specResult.spec?.pages.find(p => p.layout === 'dashboard')).toBeDefined();
    expect(specResult.spec?.workflowStubs.find(w => w.integration === 'whatsapp')).toBeDefined();
    
    // Assert all required parts are present
    expect(specResult.spec?.apiEndpoints.length).toBe(12); // 3 entities * 4 CRUD methods
    expect(specResult.spec?.authRules.length).toBe(9); // 3 roles * 3 entities
  });
});
