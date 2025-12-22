import { ProviderConfig } from "../../types";
import { createAnthropic, AnthropicProviderSettings } from "@ai-sdk/anthropic";
import { ProviderClient } from "../providerClient";
import { LanguageModelChatRequestMessage, ProvideLanguageModelChatResponseOptions } from "vscode";
import { ModelMessage } from "ai";

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

	override convertMessages(messages: readonly LanguageModelChatRequestMessage[]): ModelMessage[] {
		const converted = super.convertMessages(messages);
		return converted.map((m) => {
			if (m.role === "system") {
				return {
					...m,
					providerOptions: {
						anthropic: { cacheControl: { type: "ephemeral" } },
					},
				};
			}
			return m;
		});
	}

	override convertTools(options: ProvideLanguageModelChatResponseOptions): Record<string, any> | undefined {
		const tools = super.convertTools(options);
		if (tools) {
			for (const toolName of Object.keys(tools)) {
				tools[toolName].providerOptions = {
					anthropic: { cacheControl: { type: "ephemeral" } },
				};
			}
		}
		return tools;
	}
}
