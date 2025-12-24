import { ProviderConfig, ModelItem } from "../../types";
import { createGoogleGenerativeAI, GoogleGenerativeAIProviderSettings } from "@ai-sdk/google";
import { createOpenAI, OpenAIProviderSettings } from "@ai-sdk/openai";
import { createAnthropic, AnthropicProviderSettings } from "@ai-sdk/anthropic";
import { createOpenAICompatible, OpenAICompatibleProviderSettings } from "@ai-sdk/openai-compatible";
import { ProviderClient } from "../providerClient";
import {
	Progress,
	LanguageModelChatRequestMessage,
	ProvideLanguageModelChatResponseOptions,
	LanguageModelResponsePart2 as LanguageModelResponsePart,
} from "vscode";
import * as vscode from "vscode";
import { JSONValue } from "ai";
import { OpenAIProviderClient } from "./openai";
import { GoogleProviderClient } from "./google";
import { AnthropicProviderClient } from "./anthropic";
import { OpenAICompatibleProviderClient } from "./openai-compatible";
import { logger } from "../../outputLogger";

/**
 * Supported LiteLLM API types.
 * Each type corresponds to a different underlying provider SDK.
 */
export type LiteLLMApiType = "google" | "openai" | "anthropic" | "openai-compatible";

/**
 * LiteLLM provider client that supports multiple underlying API types.
 *
 * This provider uses a single base URL and API key, but can route requests
 * to four different underlying provider implementations (Google, OpenAI, Anthropic,
 * or OpenAI-Compatible) based on the model's `litellm_api_type` property.
 *
 * The `litellm_api_type` must be specified in the model's `model_properties`
 * for this provider to function correctly.
 */
export class LiteLLMProviderClient extends ProviderClient {
	// Internal provider clients for each supported API type
	private readonly googleClient: GoogleProviderClient;
	private readonly openaiClient: OpenAIProviderClient;
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
		this.googleClient = new GoogleProviderClient(config, apiKey);
		this.openaiClient = new OpenAIProviderClient(config, apiKey);
		this.anthropicClient = new AnthropicProviderClient(config, apiKey);
		this.openaiCompatibleClient = new OpenAICompatibleProviderClient(config, apiKey);
	}

	/**
	 * Generates a streaming response using the appropriate underlying provider.
	 *
	 * This method reads the `litellm_api_type` from the model's `model_properties`
	 * and delegates to the corresponding internal provider client.
	 *
	 * @param request The chat request messages.
	 * @param options Options for providing the chat response.
	 * @param config The model item configuration - must include `litellm_api_type` in `model_properties`.
	 * @param progress Progress callback for streaming response parts.
	 * @param statusBarItem The status bar item for updating context.
	 */
	async generateStreamingResponse(
		request: LanguageModelChatRequestMessage[],
		options: ProvideLanguageModelChatResponseOptions,
		config: ModelItem,
		progress: Progress<LanguageModelResponsePart>,
		statusBarItem: vscode.StatusBarItem,
		_providerOptions?: Record<string, Record<string, JSONValue>>
	): Promise<void> {
		// Validate litellm_api_type exists before making any API calls
		const litellmApiType = config.model_properties.litellm_api_type as LiteLLMApiType | undefined;

		if (!litellmApiType) {
			const error = new Error(
				"LiteLLM provider requires 'litellm_api_type' to be specified in model_properties. " +
				`Valid values are: "google", "openai", "anthropic", "openai-compatible". ` +
				`Model: ${config.id}`
			);
			logger.error(error.message);
			vscode.window.showErrorMessage(error.message);
			throw error;
		}

		// Validate that litellmApiType is one of the allowed values
		const validTypes: LiteLLMApiType[] = ["google", "openai", "anthropic", "openai-compatible"];
		if (!validTypes.includes(litellmApiType)) {
			const error = new Error(
				`Invalid litellm_api_type: "${litellmApiType}". ` +
				`Valid values are: "google", "openai", "anthropic", "openai-compatible". ` +
				`Model: ${config.id}`
			);
			logger.error(error.message);
			vscode.window.showErrorMessage(error.message);
			throw error;
		}

		logger.debug(`LiteLLM: routing to ${litellmApiType} provider for model "${config.id}"`);

		// Delegate to the appropriate internal provider client
		switch (litellmApiType) {
			case "google":
				await this.googleClient.generateStreamingResponse(request, options, config, progress, statusBarItem, _providerOptions);
				break;
			case "openai":
				await this.openaiClient.generateStreamingResponse(request, options, config, progress, statusBarItem, _providerOptions);
				break;
			case "anthropic":
				await this.anthropicClient.generateStreamingResponse(request, options, config, progress, statusBarItem, _providerOptions);
				break;
			case "openai-compatible":
				await this.openaiCompatibleClient.generateStreamingResponse(request, options, config, progress, statusBarItem, _providerOptions);
				break;
			default:
				// This should never happen due to the validation above, but TypeScript requires exhaustive handling
				const error = new Error(`Unsupported litellm_api_type: ${litellmApiType}`);
				logger.error(error.message);
				vscode.window.showErrorMessage(error.message);
				throw error;
		}
	}
}
