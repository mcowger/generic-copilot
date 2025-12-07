import {ProviderConfig } from "../types";
import { createOpenAICompatible, OpenAICompatibleProviderSettings } from "@ai-sdk/openai-compatible";
import { ProviderClient } from "./providerClient";

export class OpenAICompatibleProviderClient extends ProviderClient {
	constructor(config: ProviderConfig, apiKey: string) {
		super(
			"openai-compatible",
			config,
			createOpenAICompatible({
				apiKey: apiKey,
				...(config.baseUrl && { baseURL: config.baseUrl }),
				...(config.headers && { headers: config.headers }),
			} as OpenAICompatibleProviderSettings)
		);
	}

}
