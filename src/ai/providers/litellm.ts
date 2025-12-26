import * as vscode from "vscode";
import {
	Progress,
	LanguageModelChatRequestMessage,
	ProvideLanguageModelChatResponseOptions,
	LanguageModelTextPart,
	LanguageModelToolCallPart,
	LanguageModelThinkingPart,
	LanguageModelResponsePart2 as LanguageModelResponsePart,
} from "vscode";
import { ProviderConfig, ModelItem } from "../../types";
import { createOpenAI, OpenAIProviderSettings } from "@ai-sdk/openai";
import { ProviderClient, RequestContext } from "../providerClient";
import { MessageLogger } from "../utils/messageLogger";
import { normalizeToolInputs, convertToolResultToString } from "../utils/conversion";
import { LanguageModel } from "ai";
import { AnthropicProviderClient } from "./anthropic";
import { OpenAICompatibleProviderClient } from "./openai-compatible";
import { logger } from "../../outputLogger";
import { JSONValue, LanguageModelUsage, StreamTextResult } from "ai";

/**
 * LiteLLM-specific usage structure.
 * LiteLLM returns usage in a format that may differ from the underlying provider.
 */
interface LiteLLMUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
	cache_read_input_tokens?: number;
	cache_creation_input_tokens?: number;
	prompt_tokens_details?: {
		cached_tokens?: number;
		cache_creation_tokens?: number;
	};
}

/**
 * Supported LiteLLM API types.
 * Each type corresponds to a different underlying provider SDK.
 */
export type LiteLLMApiType = "anthropic" | "openai-compatible";

/**
 * LiteLLM provider client that supports multiple underlying API types.
 *
 * This provider uses a single base URL and API key, but can route requests
 * to different underlying provider implementations (Anthropic, OpenAI-compatible)
 * based on the model's `litellm_api_type` property.
 *
 * The `litellm_api_type` must be specified in the model's `model_properties`
 * for this provider to function correctly.
 */
export class LiteLLMProviderClient extends ProviderClient {
	// Internal provider clients for each supported API type
	private readonly anthropicClient: AnthropicProviderClient;
	private readonly openaiCompatibleClient: OpenAICompatibleProviderClient;

	constructor(config: ProviderConfig, apiKey: string) {
		// Call parent constructor with a dummy provider instance
		// The actual work is delegated to the internal clients
		super(
			"litellm",
			config,
			createOpenAI({
				apiKey: apiKey,
				...(config.baseUrl && { baseURL: config.baseUrl }),
				...(config.headers && { headers: config.headers }),
			} as OpenAIProviderSettings)
		);

		logger.info(`Initializing LiteLLMProviderClient with base URL: ${config.baseUrl || "default"}`);

		// Create internal provider clients, all sharing the same base URL and API key
		this.anthropicClient = new AnthropicProviderClient(config, apiKey);
		this.openaiCompatibleClient = new OpenAICompatibleProviderClient(config, apiKey);
	}

	/**
	 * Processes result data from the provider to extract usage metrics.
	 * LiteLLM normalizes usage to OpenAI-style format (prompt_tokens, completion_tokens).
	 *
	 * @param result The streaming result object from streamText.
	 * @returns Promise resolving to the language model usage metrics.
	 */
	public async processResultData(result: StreamTextResult<Record<string, any>, never>): Promise<LanguageModelUsage> {
		interface LiteLLMResultData {
			input_tokens?: number;
			output_tokens?: number;
		}

		try {
			// Get the raw provider metadata to look for cached tokens
			// LiteLLM puts cache_read_input_tokens in various locations
			const raw = await result.providerMetadata;

			// if (raw && raw.anthropic?.usage) {
			const usage = raw!.anthropic.usage as unknown as LiteLLMResultData;
			return {
				inputTokens: (usage.input_tokens as unknown as number) || undefined,
				outputTokens: (usage.output_tokens as unknown as number) || undefined,
				totalTokens:
					(usage.input_tokens as unknown as number) + (usage.output_tokens as unknown as number) || undefined,
			} as LanguageModelUsage;
			// }
		} catch (error) {
			logger.error("LiteLLM: Error processing result data", error instanceof Error ? error : new Error(String(error)));
			// Fall back to the base implementation
			return result.usage;
		}
	}

	/**
	 * LiteLLM-specific override to set up the request context.
	 * Uses the internal provider's language model, messages, and tools.
	 */
	public async setupRequestContext(
		request: LanguageModelChatRequestMessage[],
		options: ProvideLanguageModelChatResponseOptions,
		config: ModelItem,
		providerOptions?: Record<string, Record<string, JSONValue>>
	): Promise<RequestContext> {
		// Validate litellm_api_type exists before making any API calls
		const litellmApiType = config.model_properties.litellm_api_type as LiteLLMApiType | undefined;

		if (!litellmApiType) {
			const error = new Error(
				"LiteLLM provider requires 'litellm_api_type' to be specified in model_properties. " +
					`Valid values are: "anthropic", "openai-compatible". ` +
					`Model: ${config.id}`
			);
			logger.error(error.message);
			vscode.window.showErrorMessage(error.message);
			throw error;
		}

		// Validate that litellmApiType is one of the allowed values
		const validTypes: LiteLLMApiType[] = ["anthropic", "openai-compatible"];
		if (!validTypes.includes(litellmApiType)) {
			const error = new Error(
				`Invalid litellm_api_type: "${litellmApiType}". ` +
					`Valid values are: "anthropic", "openai-compatible". ` +
					`Model: ${config.id}`
			);
			logger.error(error.message);
			vscode.window.showErrorMessage(error.message);
			throw error;
		}

		logger.debug(`LiteLLM: routing to ${litellmApiType} provider for model "${config.id}"`);

		// Get the appropriate internal provider client
		const internalProvider = litellmApiType === "anthropic" ? this.anthropicClient : this.openaiCompatibleClient;

		// Use the internal provider's language model, messages, and tools
		const languageModel = internalProvider.getLanguageModel(config.slug);
		const messages = internalProvider.convertMessages(request);
		const tools = internalProvider.convertTools(options);

		// MessageLogger is now imported at the top of the file

		const messageLogger = MessageLogger.getInstance();
		logger.debug(`Generating streaming response for model "${config.id}" with LiteLLM provider`);

		// Log the incoming request as soon as possible.
		const interactionId = messageLogger.addRequestResponse({
			type: "request",
			vscodeMessages: request,
			vscodeOptions: options,
			vercelMessages: messages,
			vercelTools: tools,
			modelConfig: config,
		}) as string;

		// Record start time for performance measurement
		const startTime = Date.now();

		const responseLog = {
			type: "response",
			textParts: [] as LanguageModelTextPart[],
			thinkingParts: [] as LanguageModelThinkingPart[],
			toolCallParts: [] as LanguageModelToolCallPart[],
		};

		return {
			languageModel,
			messages,
			tools,
			interactionId,
			responseLog,
			startTime,
		} as RequestContext;
	}
}
