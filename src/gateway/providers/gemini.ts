import { GoogleGenAI } from '@google/genai';
import { GatewayRequest } from '../gateway';
import { CostTracker } from '../costTracker';

export async function generateGemini<T>(request: GatewayRequest): Promise<T> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
  
  const contents: string[] = [];
  if (request.systemPrompt) {
    contents.push(`System Instructions:\n${request.systemPrompt}`);
  }
  contents.push(request.prompt);

  const response = await ai.models.generateContent({
    model: request.routing.model,
    contents,
    config: {
      temperature: request.routing.temperature ?? 0,
      responseMimeType: request.responseFormat === 'json' ? 'application/json' : 'text/plain'
    }
  });

  const content = response.text;

  // Track tokens
  if (request.routing.jobId && request.routing.stageName && response.usageMetadata) {
    const meta = response.usageMetadata as any;
    const input = meta.promptTokenCount || meta.prompt_tokens || 0;
    const output = meta.candidatesTokenCount || meta.completion_tokens || 0;
    const total = meta.totalTokenCount || meta.total_tokens || 0;
    const cost = (input * 0.075 + output * 0.30) / 1000000; // Approx gemini-2.5-flash
    CostTracker.addUsage(request.routing.jobId, request.routing.stageName, {
      provider: request.routing.provider,
      model: request.routing.model,
      promptTokens: input,
      completionTokens: output,
      totalTokens: total,
      estimatedCost: cost
    });
  }

  if (request.responseFormat === 'json') {
    return JSON.parse(content || '{}') as T;
  }
  return content as unknown as T;
}
