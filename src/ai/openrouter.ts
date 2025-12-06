import {ProviderConfig } from "../types.js";
import { createOpenRouter, OpenRouterProviderSettings } from "@openrouter/ai-sdk-provider";
import { ProviderClient } from "./providerClient.js";

export class OpenRouterProviderClient extends ProviderClient {
	constructor(config: ProviderConfig) {
		super(
			"openrouter",
			config,
			createOpenRouter({
				apiKey: config.apiKey,
				...(config.baseUrl && { baseURL: config.baseUrl }),
				...(config.headers && { headers: config.headers }),
			} as OpenRouterProviderSettings)
		);
	}

}
