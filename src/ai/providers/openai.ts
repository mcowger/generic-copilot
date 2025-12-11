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
import { CacheRegistry } from "../utils/metadataCache";
import { logger } from "../../outputLogger";

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
		_providerOptions?: Record<string, Record<string, JSONValue>>
	): Promise<void> {
		// Check for cached previousResponseId from the last response
		const cache = CacheRegistry.getCache("openaiResponseId");
		const previousResponseId = cache.get("lastResponseId") as string | undefined;

		// Delete the cached value after retrieval (single use)
		if (previousResponseId) {
			logger.debug(`Using cached previousResponseId: ${previousResponseId}`);
			cache.delete("lastResponseId");
		}

		// Provide OpenAI-specific provider options
		const providerOptions = {
			openai: {
				reasoningSummary: "detailed",
				parallelToolCalls: true,
				promptCacheKey: "generic-copilot-cache-v1",
				promptCacheRetention: "24h", // Extended caching for GPT-5.1
				...(previousResponseId && { previousResponseId }),
			} satisfies OpenAIResponsesProviderOptions,
		};

		return super.generateStreamingResponse(request, options, config, progress, statusBarItem, providerOptions);
	}

	/**
	 * Processes response-level metadata from OpenAI, specifically capturing the responseId
	 * for use in subsequent requests to enable conversation continuity.
	 * @param result The streaming result object from streamText
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected override processResponseMetadata(result: any): void {
		// OpenAI returns responseId in providerMetadata
		const providerMetadata = result.providerMetadata;
		if (providerMetadata) {
			// providerMetadata is a Promise, so we handle it asynchronously
			Promise.resolve(providerMetadata).then((metadata) => {
				const responseId = metadata?.openai?.responseId;
				if (responseId) {
					logger.debug(`Caching OpenAI responseId: ${responseId}`);
					const cache = CacheRegistry.getCache("openaiResponseId");
					cache.set("lastResponseId", responseId);
				}
			}).catch((err) => {
				logger.warn(`Failed to retrieve OpenAI responseId: ${err instanceof Error ? err.message : String(err)}`);
			});
		}
	}
}
