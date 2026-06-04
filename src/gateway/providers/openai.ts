import OpenAI from 'openai';
import { GatewayRequest } from '../gateway';
import { CostTracker, TokenUsage } from '../costTracker';

export async function generateOpenAI<T>(request: GatewayRequest, useOpenRouter = false): Promise<T> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const openrouter = new OpenAI({ 
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY || 'dummy'
  });
  
  const client = useOpenRouter ? openrouter : openai;
  
  // Format messages
  const messages: any[] = [];
  if (request.systemPrompt) {
    messages.push({ role: 'system', content: request.systemPrompt });
  }
  messages.push({ role: 'user', content: request.prompt });

  const response = await client.chat.completions.create({
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
    const cost = (input * 0.15 + output * 0.60) / 1000000; // Approx gpt-4o-mini
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
