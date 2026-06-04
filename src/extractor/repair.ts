import { AIGatewayClient, RoutingConfig } from '../gateway/gateway';
import { ValidationResult } from './validator';
import { logStageEvent } from '../logger/logger';

export class IntentRepairer {
  constructor(private gateway: AIGatewayClient, private routing: RoutingConfig) {}

  async attemptRepair(
    invalidData: any,
    validationResult: ValidationResult,
    originalPrompt: string
  ): Promise<any> {
    logStageEvent('IntentExtraction', 'REPAIR', {
      strategy: 'Structural & Field Repair',
      errors: validationResult.errors,
      provider: this.routing.provider,
    });

    const repairPrompt = `
You are a repair assistant fixing a structured JSON object.
The original request was: "${originalPrompt}"

The generated JSON was invalid.
Here are the validation errors:
${JSON.stringify(validationResult.errors, null, 2)}

Here is the current invalid JSON:
${JSON.stringify(invalidData, null, 2)}

Please repair ONLY the missing or malformed fields according to the expected schema. Do not regenerate the entire stage unless necessary.
Return ONLY valid JSON.
`;

    try {
      const repairedData = await this.gateway.generateStructuredOutput<any>({
        prompt: repairPrompt,
        routing: this.routing,
        systemPrompt: "You fix JSON according to Zod errors. Return purely JSON with no markdown formatting.",
        responseFormat: 'json'
      });
      return repairedData;
    } catch (e: any) {
      logStageEvent('IntentExtraction', 'ERROR', {
        message: 'Repair attempt threw an error',
        error: e.message
      });
      // Return original invalid data if repair completely fails
      return invalidData;
    }
  }
}
