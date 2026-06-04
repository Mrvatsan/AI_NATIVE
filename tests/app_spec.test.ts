import { AppSpecGenerator } from '../src/app_spec/index';
import { AIGatewayClient, GatewayRequest } from '../src/gateway/gateway';
import { DataSchema } from '../src/schemas/dataSchema';
import { validateAppSpec } from '../src/app_spec/validator';

const mockDataSchema: DataSchema = {
  entities: [
    {
      name: 'Lead',
      tableName: 'leads',
      fields: [
        { name: 'id', type: 'uuid', nullable: false, isPrimary: true, isUnique: true, isRelation: false },
        { name: 'tenantId', type: 'uuid', nullable: false, isPrimary: false, isUnique: false, isRelation: false },
        { name: 'name', type: 'string', nullable: false, isPrimary: false, isUnique: false, isRelation: false }
      ],
      relations: [],
      foreignKeys: []
    }
  ]
};

class MockSuccessGateway implements AIGatewayClient {
  async generateStructuredOutput<T>(request: GatewayRequest): Promise<T> {
    const response = {
      roles: ['admin', 'manager', 'user'],
      pages: [
        { name: 'Leads', route: '/leads', layout: 'list', boundEntity: 'Lead', components: ['table', 'form'] },
        { name: 'Dashboard', route: '/dashboard', layout: 'dashboard', components: ['chart', 'card'] }
      ],
      apiEndpoints: [
        { path: '/api/leads', method: 'GET', handlerDescription: 'Retrieve Leads', boundEntity: 'Lead', authRequired: true, rateLimited: false },
        { path: '/api/leads', method: 'POST', handlerDescription: 'Create Lead', boundEntity: 'Lead', authRequired: true, rateLimited: false },
        { path: '/api/leads/:id', method: 'PUT', handlerDescription: 'Update Lead', boundEntity: 'Lead', authRequired: true, rateLimited: false },
        { path: '/api/leads/:id', method: 'DELETE', handlerDescription: 'Delete Lead', boundEntity: 'Lead', authRequired: true, rateLimited: false }
      ],
      authRules: [
        { role: 'admin', entity: 'Lead', permissions: { read: true, write: true, delete: true } },
        { role: 'manager', entity: 'Lead', permissions: { read: true, write: true, delete: false } },
        { role: 'user', entity: 'Lead', permissions: { read: true, write: false, delete: false } }
      ],
      integrationHooks: [
        { integrationId: 'whatsapp', triggerEntity: 'Lead', triggerEvent: 'created', action: 'send_template_message' }
      ],
      workflowStubs: [
        {
          name: 'Send WhatsApp notification',
          trigger: { entity: 'Lead', event: 'created', condition: 'true' },
          integration: 'whatsapp',
          action: 'send_template_message',
          payload: { leadId: 'Lead.id', tenantId: 'Lead.tenantId' }
        }
      ]
    };
    return response as unknown as T;
  }
}

class MockInvalidGatewayThenRepair implements AIGatewayClient {
  private callCount = 0;

  async generateStructuredOutput<T>(request: GatewayRequest): Promise<T> {
    this.callCount++;
    if (this.callCount === 1) {
      // 1. Missing POST, PUT, DELETE for Lead (CRUD API validation fails)
      // 2. Missing Dashboard page even though analytics feature is requested
      // 3. Auth matrix is incomplete (missing manager and user rules)
      // 4. Invalid integration action (whatsapp using send_close_notification which is not in IntegrationRegistry)
      const response = {
        roles: ['admin', 'manager', 'user'],
        pages: [
          { name: 'Leads', route: '/leads', layout: 'list', boundEntity: 'Lead', components: ['table'] }
        ],
        apiEndpoints: [
          { path: '/api/leads', method: 'GET', handlerDescription: 'Retrieve Leads', boundEntity: 'Lead', authRequired: true, rateLimited: false }
        ],
        authRules: [
          { role: 'admin', entity: 'Lead', permissions: { read: true, write: true, delete: true } }
        ],
        integrationHooks: [],
        workflowStubs: [
          {
            name: 'WhatsApp Deal Closed Notification',
            trigger: { entity: 'Lead', event: 'status_changed', condition: 'true' },
            integration: 'whatsapp',
            action: 'send_close_notification', // Unregistered action!
            payload: { leadId: 'Lead.id' }
          }
        ]
      };
      return response as unknown as T;
    } else {
      // Repaired output
      const response = {
        roles: ['admin', 'manager', 'user'],
        pages: [
          { name: 'Leads', route: '/leads', layout: 'list', boundEntity: 'Lead', components: ['table'] },
          { name: 'Dashboard', route: '/dashboard', layout: 'dashboard', components: ['chart', 'card'] }
        ],
        apiEndpoints: [
          { path: '/api/leads', method: 'GET', handlerDescription: 'Retrieve Leads', boundEntity: 'Lead', authRequired: true, rateLimited: false },
          { path: '/api/leads', method: 'POST', handlerDescription: 'Create Lead', boundEntity: 'Lead', authRequired: true, rateLimited: false },
          { path: '/api/leads/:id', method: 'PUT', handlerDescription: 'Update Lead', boundEntity: 'Lead', authRequired: true, rateLimited: false },
          { path: '/api/leads/:id', method: 'DELETE', handlerDescription: 'Delete Lead', boundEntity: 'Lead', authRequired: true, rateLimited: false }
        ],
        authRules: [
          { role: 'admin', entity: 'Lead', permissions: { read: true, write: true, delete: true } },
          { role: 'manager', entity: 'Lead', permissions: { read: true, write: true, delete: false } },
          { role: 'user', entity: 'Lead', permissions: { read: true, write: false, delete: false } }
        ],
        integrationHooks: [],
        workflowStubs: [
          {
            name: 'WhatsApp Deal Closed Notification',
            trigger: { entity: 'Lead', event: 'status_changed', condition: 'true' },
            integration: 'whatsapp',
            action: 'send_template_message', // Repaired to valid action!
            payload: { leadId: 'Lead.id' }
          }
        ]
      };
      return response as unknown as T;
    }
  }
}

describe('AppSpec Validator Gaps Tests', () => {
  it('A. Page references missing entity should fail validation', () => {
    const invalidSpec = {
      roles: ['admin'],
      pages: [
        { name: 'Leads', route: '/leads', layout: 'list', boundEntity: 'NonExistentEntity', components: ['table'] }
      ],
      apiEndpoints: [],
      authRules: [],
      integrationHooks: [],
      workflowStubs: []
    };
    const res = validateAppSpec(invalidSpec, mockDataSchema, [], []);
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.type === 'INVALID_PAGE_ENTITY')).toBe(true);
  });

  it('B. Page exists but API endpoint missing should fail validation', () => {
    const invalidSpec = {
      roles: ['admin'],
      pages: [
        { name: 'Leads', route: '/leads', layout: 'list', boundEntity: 'Lead', components: ['table'] }
      ],
      apiEndpoints: [], // missingGET endpoint
      authRules: [
        { role: 'admin', entity: 'Lead', permissions: { read: true, write: true, delete: true } }
      ],
      integrationHooks: [],
      workflowStubs: []
    };
    const res = validateAppSpec(invalidSpec, mockDataSchema, [], []);
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.type === 'MISSING_API_FOR_PAGE')).toBe(true);
  });

  it('C. Workflow references invalid entity should fail validation', () => {
    const invalidSpec = {
      roles: ['admin'],
      pages: [],
      apiEndpoints: [],
      authRules: [],
      integrationHooks: [],
      workflowStubs: [
        {
          name: 'Invalid Workflow',
          trigger: { entity: 'NonExistentEntity', event: 'created', condition: 'true' },
          integration: 'slack',
          action: 'notify',
          payload: {}
        }
      ]
    };
    const res = validateAppSpec(invalidSpec, mockDataSchema, ['slack'], []);
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.type === 'INVALID_WORKFLOW_ENTITY')).toBe(true);
  });

  it('D. Workflow references invalid integration should fail validation', () => {
    const invalidSpec = {
      roles: ['admin'],
      pages: [],
      apiEndpoints: [],
      authRules: [],
      integrationHooks: [],
      workflowStubs: [
        {
          name: 'Invalid Workflow',
          trigger: { entity: 'Lead', event: 'created', condition: 'true' },
          integration: 'invalid_integration' as any, // force invalid type
          action: 'notify',
          payload: {}
        }
      ]
    };
    const res = validateAppSpec(invalidSpec, mockDataSchema, ['invalid_integration'], []);
    // Zod parsing will fail because 'invalid_integration' is not in supportedIntegrationEnum
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.type === 'STRUCTURE')).toBe(true);
  });

  it('E. Auth rule references undefined role should fail validation', () => {
    const invalidSpec = {
      roles: ['admin'], // 'manager' is undefined
      pages: [],
      apiEndpoints: [],
      authRules: [
        { role: 'manager' as any, entity: 'Lead', permissions: { read: true, write: true, delete: false } }
      ],
      integrationHooks: [],
      workflowStubs: []
    };
    const res = validateAppSpec(invalidSpec, mockDataSchema, [], []);
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.type === 'UNDEFINED_ROLE_IN_RULE')).toBe(true);
  });

  it('F. Missing dashboard when analytics feature exists should fail validation', () => {
    const invalidSpec = {
      roles: ['admin'],
      pages: [
        { name: 'Leads', route: '/leads', layout: 'list', boundEntity: 'Lead', components: ['table'] }
      ],
      apiEndpoints: [
        { path: '/api/leads', method: 'GET', boundEntity: 'Lead', handlerDescription: 'Retrieve', authRequired: true, rateLimited: false },
        { path: '/api/leads', method: 'POST', boundEntity: 'Lead', handlerDescription: 'Create', authRequired: true, rateLimited: false },
        { path: '/api/leads/:id', method: 'PUT', boundEntity: 'Lead', handlerDescription: 'Update', authRequired: true, rateLimited: false },
        { path: '/api/leads/:id', method: 'DELETE', boundEntity: 'Lead', handlerDescription: 'Delete', authRequired: true, rateLimited: false }
      ],
      authRules: [
        { role: 'admin', entity: 'Lead', permissions: { read: true, write: true, delete: true } }
      ],
      integrationHooks: [],
      workflowStubs: []
    };
    const res = validateAppSpec(invalidSpec, mockDataSchema, [], ['Analytics']);
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.type === 'MISSING_DASHBOARD')).toBe(true);
  });
});

describe('AppSpec Generator Refined Flow Tests', () => {
  const routing = { provider: 'test', model: 'test-model' };

  it('should generate valid AppSpec with dashboard and roles', async () => {
    const gateway = new MockSuccessGateway();
    const generator = new AppSpecGenerator(gateway);
    const result = await generator.generate(mockDataSchema, ['whatsapp'], ['Analytics'], routing);
    expect(result.success).toBe(true);
    expect(result.spec?.roles).toContain('admin');
    expect(result.spec?.pages.some(p => p.layout === 'dashboard')).toBe(true);
  });

  it('should successfully repair malformed CRUD, missing dashboard, and unregistered action', async () => {
    const gateway = new MockInvalidGatewayThenRepair();
    const generator = new AppSpecGenerator(gateway);
    const result = await generator.generate(mockDataSchema, ['whatsapp'], ['Analytics'], routing);
    expect(result.success).toBe(true);
    expect(result.spec?.pages.some(p => p.layout === 'dashboard')).toBe(true);
    expect(result.spec?.apiEndpoints.length).toBe(4); // full CRUD
    expect(result.spec?.workflowStubs[0].action).toBe('send_template_message'); // repaired action
  });
});
