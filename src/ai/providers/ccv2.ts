import { ProviderConfig } from "../../types";
import { createAnthropic, AnthropicProviderSettings } from "@ai-sdk/anthropic";
import { ProviderClient } from "../providerClient";
import { LanguageModelChatRequestMessage } from "vscode";
import { ModelMessage } from "ai";

export class CCv2ProviderClient extends ProviderClient {
	constructor(config: ProviderConfig, apiKey: string) {
		const headers: Record<string, string> = {
			...(config.headers || {}),
			"anthropic-beta": "oauth-2025-04-20",
			"anthropic-version": "2023-06-01",
			"Authorization": `Bearer ${apiKey}`,
		};

		super(
			"ccv2",
			config,
			createAnthropic({
				apiKey: apiKey,
				...(config.baseUrl && { baseURL: config.baseUrl }),
				headers: headers,
				fetch: async (url, options) => {
					const headers = new Headers(options?.headers);
					headers.delete("x-api-key");
					return fetch(url, { ...options, headers });
				},
			} as AnthropicProviderSettings)
		);
	}

    convertMessages(messages: readonly LanguageModelChatRequestMessage[]): ModelMessage[] {
        // Override to filter out system messages for claude code
        return super.convertMessages(messages).filter(m => m.role !== 'system');

    }
}
