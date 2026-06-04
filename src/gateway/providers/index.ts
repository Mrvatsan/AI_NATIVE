import dotenv from 'dotenv';
dotenv.config();
import { AIGatewayClient, GatewayRequest, RoutingConfig } from '../gateway';
import { generateOpenAI } from './openai';
import { generateGemini } from './gemini';
import { generateGroq } from './groq';
import * as fs from 'fs';
import * as path from 'path';

let routingConfig: any = null;

try {
  routingConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../routing.json'), 'utf-8'));
} catch (e) {
  console.warn('Could not load routing.json, using fallback routing');
  routingConfig = {
    intentExtraction: { primary: "groq", fallback: "gemini" },
    schemaGeneration: { primary: "gemini", fallback: "openai" },
    appSpecGeneration: { primary: "openai", fallback: "gemini" }
  };
}

export class MultiProviderGateway implements AIGatewayClient {
  async generateStructuredOutput<T>(request: GatewayRequest): Promise<T> {
    const stage = request.routing.stageName;
    let providerName = request.routing.provider;
    
    // Auto-resolve provider based on routing.json if stageName is given
    if (stage && routingConfig[stage]) {
      providerName = routingConfig[stage].primary;
      // Also pick up model from routing.json if specified
      if (routingConfig[stage].model) {
        request.routing.model = routingConfig[stage].model;
      }
    }

    try {
      return await this.executeProvider<T>(providerName, request);
    } catch (e: any) {
      console.warn(`[Gateway] Primary provider ${providerName} failed for stage ${stage}: ${e.message}`);
      
      let fallbackProvider = 'openrouter'; // Universal fallback
      if (stage && routingConfig[stage] && routingConfig[stage].fallback) {
        fallbackProvider = routingConfig[stage].fallback;
      }
      
      console.info(`[Gateway] Attempting fallback to ${fallbackProvider}`);
      
      request.routing.provider = fallbackProvider;
      if (fallbackProvider === 'openai' || fallbackProvider === 'openrouter') {
        request.routing.model = 'gpt-4o-mini';
      } else if (fallbackProvider === 'gemini') {
        request.routing.model = 'gemini-2.5-flash';
      } else if (fallbackProvider === 'groq') {
        request.routing.model = 'llama-3.1-8b-instant';
      }

      try {
        return await this.executeProvider<T>(fallbackProvider, request);
      } catch (fallbackError: any) {
        console.warn(`[Gateway] Fallback provider ${fallbackProvider} failed: ${fallbackError.message}`);
        console.info(`[Gateway] Attempting universal fallback to openrouter`);
        request.routing.provider = 'openrouter';
        request.routing.model = 'gpt-4o-mini';
        return await this.executeProvider<T>('openrouter', request);
      }
    }
  }

  private async executeProvider<T>(providerName: string, request: GatewayRequest): Promise<T> {
    switch (providerName) {
      case 'openai':
        return await generateOpenAI<T>(request, false);
      case 'openrouter':
        return await generateOpenAI<T>(request, true);
      case 'gemini':
        return await generateGemini<T>(request);
      case 'groq':
        return await generateGroq<T>(request);
      default:
        // Default to OpenAI
        return await generateOpenAI<T>(request, false);
    }
  }
}
