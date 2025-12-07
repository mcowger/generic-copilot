import {ProviderConfig } from "../types";
import { createOpenAI, OpenAIProviderSettings } from "@ai-sdk/openai";
import { ProviderClient } from "./providerClient";

export class OpenAIProviderClient extends ProviderClient {
	constructor(config: ProviderConfig, apiKey: string) {
		super(
			"openai",
			config,
			createOpenAI({
				apiKey: apiKey,
				...(config.baseUrl && { baseURL: config.baseUrl }),
				...(config.headers && { headers: config.headers }),
			} as OpenAIProviderSettings)
		);
	}

}
