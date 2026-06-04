import { IntentExtractor } from '../src/extractor/index';
import { AIGatewayClient, GatewayRequest } from '../src/gateway/gateway';

class MockSuccessGateway implements AIGatewayClient {
  async generateStructuredOutput<T>(request: GatewayRequest): Promise<T> {
    const response = {
      appName: 'Real Estate CRM',
      appType: 'crm',
      features: ['Analytics', 'Role Based Access'],
      entities: ['Lead', 'Property', 'Deal'],
      integrations_requested: ['WhatsApp'],
      assumptions: ['Assuming users need authentication.']
    };
    return response as unknown as T;
  }
}

class MockInvalidGatewayThenRepair implements AIGatewayClient {
  private callCount = 0;

  async generateStructuredOutput<T>(request: GatewayRequest): Promise<T> {
    this.callCount++;
    if (this.callCount === 1) {
      // Return invalid data (missing required arrays, appType is wrong)
      const response = {
        appName: 'Bad App',
        appType: 'invalid_type', // Invalid enum
        // missing features, entities, etc.
      };
      return response as unknown as T;
    } else {
      // Repair call returns valid data
      const response = {
        appName: 'Bad App Repaired',
        appType: 'custom',
        features: [],
        entities: [],
        integrations_requested: [],
        assumptions: []
      };
      return response as unknown as T;
    }
  }
}

describe('IntentExtractor', () => {
  const routing = { provider: 'test', model: 'test-model' };

  it('should successfully extract intent on valid prompt', async () => {
    const gateway = new MockSuccessGateway();
    const extractor = new IntentExtractor(gateway);
    
    const result = await extractor.extract('Build a CRM for real estate.', routing);
    
    expect(result.success).toBe(true);
    expect(result.intent?.appType).toBe('crm');
    expect(result.intent?.entities).toContain('Lead');
  });

  it('should attempt repair when initial output is invalid', async () => {
    const gateway = new MockInvalidGatewayThenRepair();
    const extractor = new IntentExtractor(gateway);
    
    const result = await extractor.extract('Build an invalid app.', routing);
    
    // It should have failed validation first, then repaired and succeeded
    expect(result.success).toBe(true);
    expect(result.intent?.appType).toBe('custom');
    expect(result.intent?.appName).toBe('Bad App Repaired');
  });
});
