export interface RoutingConfig {
  provider: string;
  model: string;
  temperature?: number;
  jobId?: string;
  stageName?: string;
}

export interface GatewayRequest {
  prompt: string;
  routing: RoutingConfig;
  systemPrompt?: string;
  responseFormat?: 'json' | 'text';
}

export interface AIGatewayClient {
  generateStructuredOutput<T>(request: GatewayRequest): Promise<T>;
}

// A mock implementation of the AI Gateway for demonstration purposes
export class MockAIGateway implements AIGatewayClient {
  async generateStructuredOutput<T>(request: GatewayRequest): Promise<T> {
    // In a real scenario, this would route to LiteLLM, Portkey, OpenAI, Anthropic, etc.
    // For our tests, we will mock the responses using Jest.
    throw new Error('Mock gateway should be mocked in tests or run with actual implementation.');
  }
}
