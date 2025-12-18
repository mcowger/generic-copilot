import { ProviderModelConfig, ProviderConfig, VercelType,  } from "../types";
import { ProviderClient } from "./providerClient";
import { OpenRouterProviderClient } from './providers/openrouter';
import { OpenAIProviderClient } from "./providers/openai";
import { OpenAICompatibleProviderClient } from "./providers/openai-compatible";
import { GoogleProviderClient } from "./providers/google";
import { ClaudeCodeProviderClient } from "./providers/claude-code";
import { logger } from "../outputLogger";
import { DeepSeekProviderClient } from "./providers/deepseek";
import { AnthropicProviderClient } from "./providers/anthropic";


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
		client = new OpenRouterProviderClient(providerModelConfig.providerConfig, providerModelConfig.apiKey);
		break;
	  case 'openai':
		client = new OpenAIProviderClient(providerModelConfig.providerConfig, providerModelConfig.apiKey);
		break;
	  case 'openai-compatible':
		client = new OpenAICompatibleProviderClient(providerModelConfig.providerConfig, providerModelConfig.apiKey);
		break;
	  case 'google':
		client = new GoogleProviderClient(providerModelConfig.providerConfig, providerModelConfig.apiKey);
		break;
	  case 'claude-code':
		client = new ClaudeCodeProviderClient(providerModelConfig.providerConfig);
		break;
	  case 'deepseek':
		client = new DeepSeekProviderClient(providerModelConfig.providerConfig, providerModelConfig.apiKey);
		break;
	  case 'anthropic':
		client = new AnthropicProviderClient(providerModelConfig.providerConfig, providerModelConfig.apiKey);
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
