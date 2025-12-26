import { ProviderConfig } from "../../types";
import { createAnthropic, AnthropicProviderSettings } from "@ai-sdk/anthropic";
import { ProviderClient } from "../providerClient";
import { LanguageModelChatRequestMessage, ProvideLanguageModelChatResponseOptions } from "vscode";
import { ModelMessage, SystemModelMessage } from "ai";
import {
	addAnthropicCacheControlToLastTool,
	addAnthropicCacheControlToRecentUserMessages,
} from "./anthropic";

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

	override convertMessages(messages: readonly LanguageModelChatRequestMessage[]): ModelMessage[] {
		// For CCv2, we need to prepend "You are Claude Code, Anthropic's official CLI for Claude."
		// to the system messages
		const converted = super.convertMessages(messages);

		// Find system messages and prepend the Claude Code message
		const systemMessages = converted.filter((m: ModelMessage) => m.role === 'system');
		const nonSystemMessages = converted.filter((m: ModelMessage) => m.role !== 'system');

		let result: ModelMessage[] = converted;

		if (systemMessages.length > 0) {
			// Prepend the Claude Code identification as the first system message
			const claudeCodeMessage: SystemModelMessage = {
				role: "system",
				content: "You are Claude Code, Anthropic's official CLI for Claude.",
			};

			result = [claudeCodeMessage, ...systemMessages, ...nonSystemMessages];
		}

		return result;
	}

	override convertTools(options: ProvideLanguageModelChatResponseOptions): Record<string, any> | undefined {
		const tools = super.convertTools(options);
		return addAnthropicCacheControlToLastTool(tools);
	}
}
