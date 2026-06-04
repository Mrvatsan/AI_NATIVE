import { AIGatewayClient, RoutingConfig } from '../gateway/gateway';
import { AppSpecValidationResult } from './validator';
import { DataSchema } from '../schemas/dataSchema';
import { logStageEvent } from '../logger/logger';
import { IntegrationRegistry } from '../integrations/registry';

export class AppSpecRepairEngine {
  constructor(private gateway: AIGatewayClient, private routing: RoutingConfig) {}

  async attemptRepair(
    invalidData: any,
    validationResult: AppSpecValidationResult,
    dataSchema: DataSchema,
    requestedIntegrations: string[]
  ): Promise<any> {
    const errorTypes = new Set(validationResult.errors.map(e => e.type));
    
    let strategy = 'Structural Repair';
    if (errorTypes.has('MISSING_CRUD_API') || errorTypes.has('MISSING_API_FOR_PAGE')) {
      strategy = 'CRUD Endpoint Repair';
    } else if (errorTypes.has('MISSING_DASHBOARD')) {
      strategy = 'Dashboard Repair';
    } else if (errorTypes.has('MISSING_AUTH_MATRIX_ENTRY') || errorTypes.has('UNDEFINED_ROLE_IN_RULE')) {
      strategy = 'Auth Matrix Repair';
    } else if (errorTypes.has('UNREGISTERED_INTEGRATION_ACTION')) {
      strategy = 'Integration Action Repair';
    }

    // Log the repair attempt with strategy, error, and timestamp
    logStageEvent('AppSpecGeneration', 'REPAIR', {
      strategy,
      errors: validationResult.errors,
      provider: this.routing.provider,
      timestamp: new Date().toISOString()
    });

    const repairPrompt = `
You are a repair assistant fixing an AppSpec JSON object for an AI application compiler pipeline.
The data schema was:
${JSON.stringify(dataSchema, null, 2)}

The requested integrations were:
${JSON.stringify(requestedIntegrations, null, 2)}

The Integration Registry containing allowed actions:
${JSON.stringify(IntegrationRegistry, null, 2)}

The generated AppSpec failed validation.
Here are the validation errors:
${JSON.stringify(validationResult.errors, null, 2)}

Here is the current invalid JSON:
${JSON.stringify(invalidData, null, 2)}

Please repair ONLY the errors listed above using these strategies:
1. Missing CRUD Endpoint: Generate GET, POST, PUT, DELETE endpoints for the missing entities.
2. Missing Dashboard: Append a page with route "/dashboard", layout "dashboard", components ["chart", "card"].
3. Missing Role or Auth Entry: Define the role in "roles" and create permission matrices (read, write, delete) for all entity/role combinations.
4. Invalid Integration Action: Replace with a valid action from the registry (e.g. for whatsapp use 'send_template_message', for slack use 'post_message').

Do not regenerate the entire AppSpec unless necessary.
Return ONLY valid JSON.
`;

    try {
      const repairedData = await this.gateway.generateStructuredOutput<any>({
        prompt: repairPrompt,
        routing: this.routing,
        systemPrompt: "You fix AppSpec schemas according to validation errors. Return purely JSON with no markdown formatting.",
        responseFormat: 'json'
      });
      
      logStageEvent('AppSpecGeneration', 'REPAIR_OUTCOME', {
        strategy,
        success: true,
        outcome: 'Repair Succeeded',
        timestamp: new Date().toISOString()
      });
      return repairedData;
    } catch (e: any) {
      logStageEvent('AppSpecGeneration', 'REPAIR_OUTCOME', {
        strategy,
        success: false,
        outcome: 'Repair Failed',
        error: e.message,
        timestamp: new Date().toISOString()
      });
      return invalidData;
    }
  }
}

