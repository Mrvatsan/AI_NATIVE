import { MultiProviderGateway } from '../src/gateway/providers';
import { IntentExtractor } from '../src/extractor';
import { SchemaGenerator } from '../src/schema_gen';
import { AppSpecGenerator } from '../src/app_spec';
import { CostTracker } from '../src/gateway/costTracker';
import * as fs from 'fs';
import * as crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const prompts = [
  "Build a CRM for a real estate agency.",
  "Task manager for a remote team.",
  "Inventory management system for a retail store.",
  "HR Tool for tracking employee leaves and performance.",
  "E-commerce platform for selling digital goods.",
  "Event Platform for selling tickets to local concerts.",
  "Project Tracker with client portals.",
  "An app.",
  "Build something like Notion for doctors.",
  "Task manager, but make it smart.",
  "CRM but also a project manager but also an invoicing tool.",
  "Overscoped marketplace prompt for buying and selling yachts with integrated crypto payments, AR viewing, and AI matchmaking."
];

describe('Evaluation Suite', () => {
  it('should evaluate all prompts and save log', async () => {
    const gateway = new MultiProviderGateway();
    const results = [];

    // Increase timeout since we are making multiple API calls
    jest.setTimeout(300000);

    for (const prompt of prompts) {
      console.log(`Evaluating prompt: "${prompt}"`);
      const jobId = crypto.randomUUID();
      const startTime = Date.now();
      let failedStage = null;
      let repairStrategy = null;

      let intentResult;
      try {
        const extractor = new IntentExtractor(gateway);
        intentResult = await extractor.extract(prompt, { provider: 'groq', model: 'llama-3.1-8b-instant', jobId, stageName: 'intentExtraction' });
        if (!intentResult.success) failedStage = 'IntentExtraction';
      } catch (e) {
        failedStage = 'IntentExtraction';
      }

      let schemaResult;
      if (!failedStage && intentResult?.intent) {
        try {
          const schemaGen = new SchemaGenerator(gateway);
          schemaResult = await schemaGen.generate(intentResult.intent, { provider: 'gemini', model: 'gemini-1.5-flash', jobId, stageName: 'schemaGeneration' });
          if (!schemaResult.success) failedStage = 'SchemaGeneration';
        } catch (e) {
          failedStage = 'SchemaGeneration';
        }
      }

      let specResult;
      if (!failedStage && schemaResult?.schema && intentResult?.intent) {
        try {
          const appSpecGen = new AppSpecGenerator(gateway);
          specResult = await appSpecGen.generate(
            schemaResult.schema,
            intentResult.intent.integrations_requested || [],
            intentResult.intent.features || [],
            { provider: 'openai', model: 'gpt-4o-mini', jobId, stageName: 'appSpecGeneration' }
          );
          if (!specResult.success) failedStage = 'AppSpecGeneration';
        } catch (e) {
          failedStage = 'AppSpecGeneration';
        }
      }

      const latencyMs = Date.now() - startTime;
      const costs = CostTracker.getJobCost(jobId) || {};
      let estimatedCost = 0;
      Object.values(costs).forEach((c: any) => estimatedCost += c.estimatedCost);

      const logEntry = {
        prompt,
        success: !failedStage,
        failedStage,
        repairStrategy,
        retryCount: 0,
        latencyMs,
        estimatedCost
      };

      results.push(logEntry);
      console.log(JSON.stringify(logEntry));
    }

    fs.writeFileSync('evaluation-log.json', JSON.stringify(results, null, 2));
    console.log('Saved to evaluation-log.json');
    expect(results.length).toBeGreaterThan(0);
  });
});
