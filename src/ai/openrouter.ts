import {ProviderConfig } from "../types";
import { createOpenRouter, OpenRouterProviderSettings } from "@openrouter/ai-sdk-provider";
import { ProviderClient } from "./providerClient";

export class OpenRouterProviderClient extends ProviderClient {
	constructor(config: ProviderConfig, apiKey: string) {
		super(
			"openrouter",
			config,
			createOpenRouter({
				apiKey: apiKey,
				...(config.baseUrl && { baseURL: config.baseUrl }),
				...(config.headers && { headers: config.headers }),
			} as OpenRouterProviderSettings)
		);
	}

}
