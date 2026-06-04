import Groq from 'groq-sdk';
import { GatewayRequest } from '../gateway';
import { CostTracker } from '../costTracker';

export async function generateGroq<T>(request: GatewayRequest): Promise<T> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const messages: any[] = [];
  if (request.systemPrompt) {
    messages.push({ role: 'system', content: request.systemPrompt });
  }
  messages.push({ role: 'user', content: request.prompt });

  const response = await groq.chat.completions.create({
    model: request.routing.model,
    messages,
    ...(request.responseFormat === 'json' ? { response_format: { type: 'json_object' as const } } : {}),
    temperature: request.routing.temperature ?? 0,
  });

  const content = response.choices[0]?.message?.content ?? '';

  // Track tokens
  if (request.routing.jobId && request.routing.stageName && response.usage) {
    const input = response.usage.prompt_tokens;
    const output = response.usage.completion_tokens;
    const cost = (input * 0.05 + output * 0.08) / 1000000; // Approx Llama 3 8b
    CostTracker.addUsage(request.routing.jobId, request.routing.stageName, {
      provider: request.routing.provider,
      model: request.routing.model,
      promptTokens: input,
      completionTokens: output,
      totalTokens: response.usage.total_tokens,
      estimatedCost: cost
    });
  }

  if (request.responseFormat === 'json') {
    return JSON.parse(content || '{}') as T;
  }
  return content as unknown as T;
}
