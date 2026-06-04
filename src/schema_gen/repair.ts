import { AIGatewayClient, RoutingConfig } from '../gateway/gateway';
import { SchemaValidationResult } from './validator';
import { logStageEvent } from '../logger/logger';

export class SchemaRepairEngine {
  constructor(private gateway: AIGatewayClient, private routing: RoutingConfig) {}

  async attemptRepair(
    invalidData: any,
    validationResult: SchemaValidationResult,
    originalIntent: any
  ): Promise<any> {
    const errorTypes = new Set(validationResult.errors.map(e => e.type));
    
    let strategy = 'Structural Repair';
    if (errorTypes.has('MISSING_FIELD') || errorTypes.has('INVALID_FIELD')) {
      strategy = 'Field Repair';
    }
    if (errorTypes.has('BROKEN_RELATION') || errorTypes.has('BROKEN_RELATION_SYMMETRY') || errorTypes.has('INVALID_TABLE_NAME')) {
      strategy = 'Consistency Repair';
    }
    
    logStageEvent('SchemaGeneration', 'REPAIR', {
      strategy,
      errors: validationResult.errors,
      provider: this.routing.provider,
    });

    const repairPrompt = `
You are a repair assistant fixing a generated DataSchema JSON object.
The original intent was:
${JSON.stringify(originalIntent, null, 2)}

The generated JSON failed validation.
Here are the validation errors:
${JSON.stringify(validationResult.errors, null, 2)}

Here is the current invalid JSON:
${JSON.stringify(invalidData, null, 2)}

Please repair ONLY the errors listed above. 
- If missing 'tenantId', add it.
- If missing 'id' or it has wrong properties, fix it (must be uuid, primary=true, nullable=false).
- If broken relations, fix target names or add the missing bidirectional relation.
- If invalid table name, make it snake_case plural.
- If missing foreign key or invalid onDelete, fix the foreignKeys block. Make sure to define onDelete as 'CASCADE', 'SET_NULL', 'RESTRICT', or 'NO_ACTION'.
Do not regenerate the entire schema unless necessary.
Return ONLY valid JSON.
`;

    try {
      const repairedData = await this.gateway.generateStructuredOutput<any>({
        prompt: repairPrompt,
        routing: this.routing,
        systemPrompt: "You fix JSON schemas according to errors. Return purely JSON with no markdown formatting.",
        responseFormat: 'json'
      });
      logStageEvent('SchemaGeneration', 'REPAIR_OUTCOME', { strategy, success: true });
      return repairedData;
    } catch (e: any) {
      logStageEvent('SchemaGeneration', 'REPAIR_OUTCOME', { strategy, success: false, error: e.message });
      return invalidData;
    }
  }
}
