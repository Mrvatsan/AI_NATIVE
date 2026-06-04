import { AIGatewayClient, RoutingConfig } from '../gateway/gateway';
import { DataSchema } from '../schemas/dataSchema';
import { AppSpec } from '../schemas/appSpec';
import { validateAppSpec } from './validator';
import { AppSpecRepairEngine } from './repair';
import { logStageEvent } from '../logger/logger';

export interface AppSpecGenerationResult {
  success: boolean;
  spec?: AppSpec;
  errors?: any;
}

export class AppSpecGenerator {
  private repairer!: AppSpecRepairEngine;

  constructor(private gateway: AIGatewayClient) {}

  async generate(
    dataSchema: DataSchema,
    requestedIntegrations: string[],
    requestedFeatures: string[],
    routing: RoutingConfig
  ): Promise<AppSpecGenerationResult> {
    const startTime = Date.now();
    logStageEvent('AppSpecGeneration', 'START', { provider: routing.provider });
    this.repairer = new AppSpecRepairEngine(this.gateway, routing);

    const systemPrompt = `
You are Stage 3 of an AI Application Compiler Pipeline: AppSpec Generation.
Generate a deterministic, machine-readable AppSpec JSON from the provided DataSchema, requested integrations, and requested features.
No markdown. No natural language explanations. Only structured JSON output.

Your output must contain:
1. roles: Explicit array of roles (e.g. ["admin", "manager", "user"]).
2. pages: Array of page configurations.
   - For every entity in the DataSchema, generate at least one page.
   - If requested features contain 'Analytics', 'Dashboard', or 'Reports' (case-insensitive), generate an Analytics Dashboard page:
     { "name": "Dashboard", "route": "/dashboard", "layout": "dashboard", "components": ["chart", "card"] }
   - Page layouts: list, detail, dashboard, settings.
   - Components: table, form, chart, card.
3. apiEndpoints: CRUD endpoints (GET, POST, PUT, DELETE) for every entity in the DataSchema.
   - GET /api/{tableName}
   - POST /api/{tableName}
   - PUT /api/{tableName}/:id
   - DELETE /api/{tableName}/:id
   - Page ↔ API consistency: Every page must have at least one GET endpoint for its bound entity.
4. authRules: Complete RBAC matrix. Generate an auth rule for EVERY role defined in "roles" × EVERY entity defined in the DataSchema.
   - Permissions: read, write, delete.
5. integrationHooks: triggers mapping to registered integrations (slack, whatsapp, etc.).
   - Actions must come from the allowed Integration Registry:
     - whatsapp: ['send_template_message', 'send_notification']
     - slack: ['post_message', 'notify']
     - (etc.)
6. workflowStubs: automation stubs.
   - Every requested integration must generate at least one workflowStub.
   - Triggers must use existing entities and valid events (created, updated, deleted, status_changed).
   - Payloads must be rich and implementation-ready, expanding using available schema fields (e.g. "dealId": "Deal.id", "amount": "Deal.amount").
`;

    const prompt = JSON.stringify({ dataSchema, requestedIntegrations, requestedFeatures });
    let generatedData: any;

    try {
      generatedData = await this.gateway.generateStructuredOutput<any>({
        prompt,
        routing,
        systemPrompt,
        responseFormat: 'json'
      });
    } catch (e: any) {
      const latency = Date.now() - startTime;
      logStageEvent('AppSpecGeneration', 'ERROR', { error: e.message, latency });
      return { success: false, errors: [e.message] };
    }

    let validationResult = validateAppSpec(generatedData, dataSchema, requestedIntegrations, requestedFeatures);
    logStageEvent('AppSpecGeneration', 'VALIDATION', { isValid: validationResult.isValid, errors: validationResult.errors });

    if (!validationResult.isValid) {
      generatedData = await this.repairer.attemptRepair(
        generatedData,
        validationResult,
        dataSchema,
        requestedIntegrations
      );
      validationResult = validateAppSpec(generatedData, dataSchema, requestedIntegrations, requestedFeatures);
      logStageEvent('AppSpecGeneration', 'VALIDATION', {
        isValid: validationResult.isValid,
        isRepair: true,
        errors: validationResult.errors
      });
    }

    const latency = Date.now() - startTime;
    if (validationResult.isValid && validationResult.data) {
      logStageEvent('AppSpecGeneration', 'COMPLETE', { status: 'Success', latency });
      return { success: true, spec: validationResult.data };
    } else {
      logStageEvent('AppSpecGeneration', 'COMPLETE', { status: 'Failed', errors: validationResult.errors, latency });
      return { success: false, errors: validationResult.errors };
    }
  }
}
