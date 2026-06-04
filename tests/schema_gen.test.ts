import { SchemaGenerator } from '../src/schema_gen/index';
import { AIGatewayClient, GatewayRequest } from '../src/gateway/gateway';
import { AppIntent } from '../src/schemas/appIntent';

class MockSuccessGateway implements AIGatewayClient {
  async generateStructuredOutput<T>(request: GatewayRequest): Promise<T> {
    const response = {
      entities: [
        {
          name: 'Lead',
          tableName: 'leads',
          fields: [
            { name: 'id', type: 'uuid', nullable: false, isPrimary: true, isUnique: true, isRelation: false },
            { name: 'tenantId', type: 'uuid', nullable: false, isPrimary: false, isUnique: false, isRelation: false },
            { name: 'name', type: 'string', nullable: false, isPrimary: false, isUnique: false, isRelation: false }
          ],
          relations: [
            { type: 'hasMany', targetEntity: 'Deal' }
          ],
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
          relations: [
            { type: 'belongsTo', targetEntity: 'Lead' }
          ],
          foreignKeys: [
            { columnName: 'leadId', referencedTable: 'leads', referencedColumn: 'id', onDelete: 'CASCADE' }
          ]
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
      // Return invalid data (missing tenantId on Lead, missing belongsTo Lead, missing foreignKeys array completely)
      const response = {
        entities: [
          {
            name: 'Lead',
            tableName: 'leads',
            fields: [
              { name: 'id', type: 'uuid', nullable: false, isPrimary: true, isUnique: true, isRelation: false }
            ], // missing tenantId
            relations: [
              { type: 'hasMany', targetEntity: 'Deal' }
            ],
            foreignKeys: []
          },
          {
            name: 'Deal',
            tableName: 'DealTable', // invalid snake_case
            fields: [
              { name: 'id', type: 'uuid', nullable: false, isPrimary: true, isUnique: true, isRelation: false },
              { name: 'tenantId', type: 'uuid', nullable: false, isPrimary: false, isUnique: false, isRelation: false }
            ],
            relations: [] // missing belongsTo Lead
            // missing foreignKeys entirely (will fail zod structure parse)
          }
        ]
      };
      return response as unknown as T;
    } else {
      // Repaired output
      const response = {
        entities: [
          {
            name: 'Lead',
            tableName: 'leads',
            fields: [
              { name: 'id', type: 'uuid', nullable: false, isPrimary: true, isUnique: true, isRelation: false },
              { name: 'tenantId', type: 'uuid', nullable: false, isPrimary: false, isUnique: false, isRelation: false }
            ],
            relations: [
              { type: 'hasMany', targetEntity: 'Deal' }
            ],
            foreignKeys: []
          },
          {
            name: 'Deal',
            tableName: 'deals',
            fields: [
              { name: 'id', type: 'uuid', nullable: false, isPrimary: true, isUnique: true, isRelation: false },
              { name: 'tenantId', type: 'uuid', nullable: false, isPrimary: false, isUnique: false, isRelation: false },
              { name: 'leadId', type: 'uuid', nullable: false, isPrimary: false, isUnique: false, isRelation: true }
            ],
            relations: [
              { type: 'belongsTo', targetEntity: 'Lead' }
            ],
            foreignKeys: [
              { columnName: 'leadId', referencedTable: 'leads', referencedColumn: 'id', onDelete: 'CASCADE' }
            ]
          }
        ]
      };
      return response as unknown as T;
    }
  }
}

describe('SchemaGenerator', () => {
  const routing = { provider: 'test', model: 'test-model' };
  const mockIntent: AppIntent = {
    appName: 'Real Estate CRM',
    appType: 'crm',
    features: ['analytics'],
    entities: ['Lead', 'Deal'],
    integrations_requested: ['whatsapp'],
    assumptions: []
  };

  it('should successfully generate schema from valid intent', async () => {
    const gateway = new MockSuccessGateway();
    const generator = new SchemaGenerator(gateway);
    
    const result = await generator.generate(mockIntent, routing);
    
    expect(result.success).toBe(true);
    expect(result.schema?.entities.length).toBe(2);
    expect(result.schema?.entities[0].tableName).toBe('leads');
    expect(result.schema?.entities[1].foreignKeys[0].onDelete).toBe('CASCADE');
  });

  it('should attempt repair when schema has missing tenantId and broken relations', async () => {
    const gateway = new MockInvalidGatewayThenRepair();
    const generator = new SchemaGenerator(gateway);
    
    const result = await generator.generate(mockIntent, routing);
    
    expect(result.success).toBe(true);
    expect(result.schema?.entities[1].tableName).toBe('deals');
    expect(result.schema?.entities[1].relations[0].targetEntity).toBe('Lead');
    expect(result.schema?.entities[0].fields.find(f => f.name === 'tenantId')).toBeDefined();
    expect(result.schema?.entities[1].foreignKeys[0].onDelete).toBe('CASCADE');
  });
});
