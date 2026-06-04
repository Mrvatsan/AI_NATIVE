import express from 'express';
import cors from 'cors';
import * as crypto from 'crypto';
import { MultiProviderGateway } from '../gateway/providers';
import { IntentExtractor } from '../extractor';
import { SchemaGenerator } from '../schema_gen';
import { AppSpecGenerator } from '../app_spec';
import { CostTracker } from '../gateway/costTracker';
import { IntegrationRegistry } from '../integrations/registry';
import { ServerEventStreamer } from './sse';

export const app = express();
app.use(cors());
app.use(express.json());

const streamer = new ServerEventStreamer();

// Healthcheck
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Get integration registry
app.get('/api/integrations', (req, res) => {
  res.json(Object.values(IntegrationRegistry));
});

// SSE endpoint
app.get('/api/generate/:jobId/stream', (req, res) => {
  streamer.addClient(req.params.jobId, req, res);
});

// Cost and Status endpoint
app.get('/api/generate/:jobId', (req, res) => {
  const jobId = req.params.jobId;
  const costBreakdown = CostTracker.getJobCost(jobId) || {};
  res.json({ jobId, costBreakdown });
});

// Start generation pipeline
app.post('/api/generate', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  const jobId = crypto.randomUUID();
  
  // Respond immediately with jobId
  res.json({ jobId });

  // Run pipeline asynchronously
  runPipeline(jobId, prompt).catch(err => {
    console.error(`Job ${jobId} failed completely:`, err);
    streamer.emit(jobId, { event: 'generation_failed', error: err.message, timestamp: Date.now() });
  });
});

async function runPipeline(jobId: string, prompt: string) {
  const gateway = new MultiProviderGateway();
  const startTime = Date.now();
  
  streamer.emit(jobId, { event: 'stage_start', stage: 'IntentExtraction', timestamp: Date.now() });
  const extractor = new IntentExtractor(gateway);
  const extractionResult = await extractor.extract(prompt, { provider: 'groq', model: 'llama-3.1-8b-instant', jobId, stageName: 'intentExtraction' });
  
  if (!extractionResult.success || !extractionResult.intent) {
    streamer.emit(jobId, { event: 'stage_failed', stage: 'IntentExtraction', timestamp: Date.now(), repairLog: extractionResult.errors });
    return;
  }
  streamer.emit(jobId, { event: 'stage_complete', stage: 'IntentExtraction', latency: Date.now() - startTime, timestamp: Date.now(), data: extractionResult.intent });

  const schemaStartTime = Date.now();
  streamer.emit(jobId, { event: 'stage_start', stage: 'SchemaGeneration', timestamp: Date.now() });
  const schemaGen = new SchemaGenerator(gateway);
  const schemaResult = await schemaGen.generate(extractionResult.intent, { provider: 'gemini', model: 'gemini-2.5-flash', jobId, stageName: 'schemaGeneration' });
  
  if (!schemaResult.success || !schemaResult.schema) {
    streamer.emit(jobId, { event: 'stage_failed', stage: 'SchemaGeneration', timestamp: Date.now(), repairLog: schemaResult.errors });
    return;
  }
  streamer.emit(jobId, { event: 'stage_complete', stage: 'SchemaGeneration', latency: Date.now() - schemaStartTime, timestamp: Date.now(), data: schemaResult.schema });

  const specStartTime = Date.now();
  streamer.emit(jobId, { event: 'stage_start', stage: 'AppSpecGeneration', timestamp: Date.now() });
  const appSpecGen = new AppSpecGenerator(gateway);
  const specResult = await appSpecGen.generate(
    schemaResult.schema,
    extractionResult.intent.integrations_requested,
    extractionResult.intent.features,
    { provider: 'openai', model: 'gpt-4o-mini', jobId, stageName: 'appSpecGeneration' }
  );

  if (!specResult.success || !specResult.spec) {
    streamer.emit(jobId, { event: 'stage_failed', stage: 'AppSpecGeneration', timestamp: Date.now(), repairLog: specResult.errors });
    return;
  }
  streamer.emit(jobId, { event: 'stage_complete', stage: 'AppSpecGeneration', latency: Date.now() - specStartTime, timestamp: Date.now(), data: specResult.spec });

  streamer.emit(jobId, { event: 'generation_complete', latency: Date.now() - startTime, timestamp: Date.now(), finalSpec: specResult.spec });
}
