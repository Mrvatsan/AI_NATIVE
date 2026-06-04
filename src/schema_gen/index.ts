import { AIGatewayClient, RoutingConfig } from '../gateway/gateway';
import { DataSchema } from '../schemas/dataSchema';
import { validateDataSchema } from './validator';
import { SchemaRepairEngine } from './repair';
import { logStageEvent } from '../logger/logger';
import { AppIntent } from '../schemas/appIntent';

export interface SchemaGenerationResult {
  success: boolean;
  schema?: DataSchema;
  errors?: any;
}

export class SchemaGenerator {
  private repairer!: SchemaRepairEngine;

  constructor(private gateway: AIGatewayClient) {}

  async generate(intent: AppIntent, routing: RoutingConfig): Promise<SchemaGenerationResult> {
    const startTime = Date.now();
    logStageEvent('SchemaGeneration', 'START', { provider: routing.provider, intent: intent.appName });
    this.repairer = new SchemaRepairEngine(this.gateway, routing);

    const systemPrompt = `
You are Stage 2 of an AI Application Compiler Pipeline: Schema Generation.
Generate a deterministic and machine-readable DataSchema from the provided AppIntent object.
No markdown. No natural language explanations. Only structured JSON output.

Your output must be an object with an 'entities' array.
For each entity, provide 'name', 'tableName', 'fields', 'relations', and 'foreignKeys'.
Table names MUST be snake_case and plural (e.g. Lead -> leads).
Every entity MUST contain a 'tenantId' field (type: uuid, nullable: false).
Every entity MUST contain an 'id' field (type: uuid, isPrimary: true, nullable: false).
Relations must be bidirectional. If A hasMany B, B must belongsTo A.
If there is a belongsTo relation, the entity MUST have a foreignKey in 'foreignKeys' targeting the referenced table with an 'onDelete' action.

Supported field types: string, number, boolean, date, datetime, uuid, text.
Supported relation types: hasOne, hasMany, belongsTo, belongsToMany.
Supported onDelete actions: CASCADE, SET_NULL, RESTRICT, NO_ACTION.
`;

    let generatedData: any;

    try {
      generatedData = await this.gateway.generateStructuredOutput<any>({
        prompt: JSON.stringify(intent),
        routing,
        systemPrompt,
        responseFormat: 'json'
      });
    } catch (e: any) {
      const latency = Date.now() - startTime;
      logStageEvent('SchemaGeneration', 'ERROR', { error: e.message, latency });
      return { success: false, errors: [e.message] };
    }

    let validationResult = validateDataSchema(generatedData);
    logStageEvent('SchemaGeneration', 'VALIDATION', { isValid: validationResult.isValid, errors: validationResult.errors });

    if (!validationResult.isValid) {
      generatedData = await this.repairer.attemptRepair(generatedData, validationResult, intent);
      validationResult = validateDataSchema(generatedData);
      logStageEvent('SchemaGeneration', 'VALIDATION', { isValid: validationResult.isValid, isRepair: true, errors: validationResult.errors });
    }

    const latency = Date.now() - startTime;
    if (validationResult.isValid && validationResult.data) {
      logStageEvent('SchemaGeneration', 'COMPLETE', { status: 'Success', latency });
      return { success: true, schema: validationResult.data };
    } else {
      logStageEvent('SchemaGeneration', 'COMPLETE', { status: 'Failed', errors: validationResult.errors, latency });
      return { success: false, errors: validationResult.errors };
    }
  }
}
