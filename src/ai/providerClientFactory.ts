import { ProviderModelConfig, ProviderConfig, VercelType,  } from "../types";
import { ProviderClient } from "./providerClient";
import { OpenRouterProviderClient } from './providers/openrouter';
import { OpenAIProviderClient } from "./providers/openai";
import { OpenAICompatibleProviderClient } from "./providers/openai-compatible";
import { GoogleProviderClient } from "./providers/google";
import { ClaudeCodeProviderClient } from "./providers/claude-code";
import { logger } from "../outputLogger";


export class ProviderClientFactory {
  private static instances: Map<string, ProviderClient> = new Map();

  static getClient(providerModelConfig: ProviderModelConfig): ProviderClient {
	const key = `${providerModelConfig.providerConfig.vercelType}-${providerModelConfig.providerConfig.id}`;

	if (this.instances.has(key)) {
	  return this.instances.get(key)!;
	}

	let client: ProviderClient;

	switch (providerModelConfig.providerConfig.vercelType as VercelType) {
	  case 'openrouter':
		if (!providerModelConfig.apiKey) {
		  throw new Error(`API key is required for openrouter provider`);
		}
		client = new OpenRouterProviderClient(providerModelConfig.providerConfig, providerModelConfig.apiKey);
		break;
	  case 'openai':
		if (!providerModelConfig.apiKey) {
		  throw new Error(`API key is required for openai provider`);
		}
		client = new OpenAIProviderClient(providerModelConfig.providerConfig, providerModelConfig.apiKey);
		break;
	  case 'openai-compatible':
		if (!providerModelConfig.apiKey) {
		  throw new Error(`API key is required for openai-compatible provider`);
		}
		client = new OpenAICompatibleProviderClient(providerModelConfig.providerConfig, providerModelConfig.apiKey);
		break;
	  case 'google':
		if (!providerModelConfig.apiKey) {
		  throw new Error(`API key is required for google provider`);
		}
		client = new GoogleProviderClient(providerModelConfig.providerConfig, providerModelConfig.apiKey);
		break;
	  case 'claude-code':
		client = new ClaudeCodeProviderClient(providerModelConfig.providerConfig);
		break;
	  default:
		logger.error(`Unsupported provider type: ${providerModelConfig.providerConfig.vercelType}`);
		throw new Error(`Unsupported provider type: ${providerModelConfig.providerConfig.vercelType}`);
	}

	this.instances.set(key, client);
	return client;
  }

  static clearCache(): void {
	this.instances.clear();
  }

  static getCachedClients(): ProviderClient[] {
	return Array.from(this.instances.values());
  }
}
