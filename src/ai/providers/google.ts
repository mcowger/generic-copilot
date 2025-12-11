import { ProviderConfig, ModelItem } from "../../types";
import {
	createGoogleGenerativeAI,
	GoogleGenerativeAIProviderSettings,
	GoogleGenerativeAIProviderOptions,
} from "@ai-sdk/google";
import { ProviderClient } from "../providerClient";
import {
	Progress,
	LanguageModelChatRequestMessage,
	ProvideLanguageModelChatResponseOptions,
	LanguageModelResponsePart2 as LanguageModelResponsePart,
} from "vscode";
import * as vscode from "vscode";
import { JSONValue, ProviderMetadata } from "ai";
import { CacheRegistry, ToolCallMetadata } from "../utils/metadataCache";

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

	/**
	 * Provides Google-specific provider options for streaming responses.
	 * The base class handles providerMetadata caching for tool calls (e.g., thoughtSignature).
	 */
	async generateStreamingResponse(
		request: LanguageModelChatRequestMessage[],
		options: ProvideLanguageModelChatResponseOptions,
		config: ModelItem,
		progress: Progress<LanguageModelResponsePart>,
		statusBarItem: vscode.StatusBarItem,
		_providerOptions?: Record<string, Record<string, JSONValue>>
	): Promise<void> {
		// Provide Google-specific provider options
		const providerOptions = {
			google: {
				thinkingConfig: {
					includeThoughts: true,
				},
			} satisfies GoogleGenerativeAIProviderOptions,
		};

		return super.generateStreamingResponse(request, options, config, progress, statusBarItem, providerOptions);
	}

	/**
	 * Caches provider metadata for tool calls (e.g., thoughtSignature).
	 * This metadata is required by Google Gemini models for function call continuations.
	 */
	protected override processToolCallMetadata(toolCallId: string, providerMetadata: ProviderMetadata | undefined): void {
		if (providerMetadata) {
			const cache = CacheRegistry.getCache("toolCallMetadata");
			cache.set(toolCallId, { providerMetadata } as ToolCallMetadata);
		}
	}
}
