import { createOpenAI, OpenAIProviderSettings, OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import { ProviderClient } from "../providerClient";
import { ProviderConfig, ModelItem } from "../../types";
import {
	Progress,
	LanguageModelChatRequestMessage,
	ProvideLanguageModelChatResponseOptions,
	LanguageModelResponsePart2 as LanguageModelResponsePart,
} from "vscode";
import * as vscode from "vscode";
import { JSONValue } from "ai";

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

	async generateStreamingResponse(
		request: LanguageModelChatRequestMessage[],
		options: ProvideLanguageModelChatResponseOptions,
		config: ModelItem,
		progress: Progress<LanguageModelResponsePart>,
		statusBarItem: vscode.StatusBarItem,
		_providerOptions?: Record<string,Record<string,JSONValue>>
	): Promise<void> {
		//Provide OpenAI-specific provider options
		const providerOptions = {
			openai: {
				reasoningSummary: "detailed",
				parallelToolCalls: true,
				promptCacheKey: "generic-copilot-cache-v1",
				promptCacheRetention: "24h", // Extended caching for GPT-5.1
			} satisfies OpenAIResponsesProviderOptions,
		};

		return super.generateStreamingResponse(request, options, config, progress, statusBarItem, providerOptions);
	}
}
