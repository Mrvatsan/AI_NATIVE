import { AIGatewayClient, RoutingConfig } from '../gateway/gateway';
import { AppIntent } from '../schemas/appIntent';
import { validateIntent } from './validator';
import { IntentRepairer } from './repair';
import { logStageEvent } from '../logger/logger';

export interface ExtractionResult {
  success: boolean;
  intent?: AppIntent;
  errors?: any;
}

export class IntentExtractor {
  private repairer!: IntentRepairer;

  constructor(private gateway: AIGatewayClient) {
    // Repairer initialized lazily or injected
  }

  async extract(prompt: string, routing: RoutingConfig): Promise<ExtractionResult> {
    logStageEvent('IntentExtraction', 'START', { provider: routing.provider, prompt });
    this.repairer = new IntentRepairer(this.gateway, routing);

    const systemPrompt = `
You are Stage 1 of an AI Application Compiler Pipeline: Intent Extraction.
Extract the intent from the user's natural language application description into a JSON object matching this schema:

{
  "appName": "string",
  "appType": "crm" | "project_management" | "ecommerce" | "hr_tool" | "inventory" | "content_platform" | "analytics" | "custom",
  "features": ["string"],
  "entities": ["string"],
  "integrations_requested": ["string"],
  "assumptions": ["string"]
}

Instructions:
1. Detect application type.
2. Extract business entities.
3. Extract requested features.
4. Extract requested integrations.
5. Generate documented assumptions when requirements are incomplete.
6. Handle ambiguous prompts consistently by making reasonable assumptions and adding them to the 'assumptions' array.
7. Output JSON ONLY. NO markdown formatting. NO free-form text.
`;

    let extractedData: any;

    try {
      extractedData = await this.gateway.generateStructuredOutput<any>({
        prompt,
        routing,
        systemPrompt,
        responseFormat: 'json'
      });
    } catch (e: any) {
      logStageEvent('IntentExtraction', 'ERROR', { error: e.message });
      return { success: false, errors: [e.message] };
    }

    let validationResult = validateIntent(extractedData);
    logStageEvent('IntentExtraction', 'VALIDATION', { isValid: validationResult.isValid, errors: validationResult.errors });

    if (!validationResult.isValid) {
      // Attempt targeted repair
      extractedData = await this.repairer.attemptRepair(extractedData, validationResult, prompt);
      // Re-validate after repair
      validationResult = validateIntent(extractedData);
      logStageEvent('IntentExtraction', 'VALIDATION', { isValid: validationResult.isValid, isRepair: true, errors: validationResult.errors });
    }

    if (validationResult.isValid && validationResult.data) {
      logStageEvent('IntentExtraction', 'COMPLETE', { status: 'Success' });
      return {
        success: true,
        intent: validationResult.data
      };
    } else {
      logStageEvent('IntentExtraction', 'COMPLETE', { status: 'Failed', errors: validationResult.errors });
      return {
        success: false,
        errors: validationResult.errors
      };
    }
  }
}
