import { ProviderModelConfig, ProviderConfig, VercelType,  } from "../types";
import { ProviderClient } from "./providerClient";
import { OpenRouterProviderClient } from './openrouter';
import { OpenAIProviderClient } from "./openai";
import { OpenAICompatibleProviderClient } from "./openai-compatible";

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
	  default:
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
