import { ProviderConfig } from "../../types";
import { createAnthropic, AnthropicProviderSettings } from "@ai-sdk/anthropic";
import { ProviderClient } from "../providerClient";

export class AnthropicProviderClient extends ProviderClient {
	constructor(config: ProviderConfig, apiKey: string) {
		super(
			"anthropic",
			config,
			createAnthropic({
				apiKey: apiKey,
				...(config.baseUrl && { baseURL: config.baseUrl }),
				...(config.headers && { headers: config.headers }),
			} as AnthropicProviderSettings)
		);
	}
}
