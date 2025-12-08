import {ProviderConfig } from "../../types";
import { createGoogleGenerativeAI, GoogleGenerativeAIProviderSettings } from "@ai-sdk/google";
import { ProviderClient } from "../providerClient";

export class GoogleProviderClient extends ProviderClient {
	constructor(config: ProviderConfig, apiKey: string) {
		super(
			"google",
			config,
			createGoogleGenerativeAI({
				apiKey: apiKey,
				...(config.baseUrl && { baseURL: config.baseUrl }),
				...(config.headers && { headers: config.headers }),
			} as GoogleGenerativeAIProviderSettings)
		);
	}
}