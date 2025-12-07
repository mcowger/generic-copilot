import {
	Progress,
	LanguageModelChatRequestMessage,
	LanguageModelTextPart,
	LanguageModelThinkingPart, //part of proposed api
	LanguageModelToolCallPart,
	ProvideLanguageModelChatResponseOptions,
	LanguageModelResponsePart2 as LanguageModelResponsePart, //part of proposed api
} from "vscode";

import { streamText } from "ai";
import { ModelItem, ProviderConfig, VercelType } from "../types";
import { LM2VercelMessage, LM2VercelTool, normalizeToolInputs } from "./conversion";
import { ModelMessage, LanguageModel, Provider } from "ai";

/**
 * Abstract base class for provider clients that interact with language model providers.
 * Handles configuration, provider instance management, and message conversion.
 */
export abstract class ProviderClient {
	//The type of the provider (e.g., OpenAI, Vercel, etc.).
	public type: VercelType;

	// Configuration for the provider client.

	protected config: ProviderConfig;

	// The underlying provider instance used for API calls.
	protected providerInstance: Provider;


	/**
	 * Constructs a new ProviderClient.
	 * @param type The type of provider.
	 * @param config The provider configuration.
	 * @param providerInstance The provider instance.
	 */
	protected constructor(type: VercelType, config: ProviderConfig, providerInstance: Provider) {
		this.type = type;
		this.config = config;
		this.providerInstance = providerInstance;

	}

	/**
	 * Generates a streaming response from the language model.
	 * @param request The chat request messages.
	 * @param options Options for providing the chat response.
	 * @param config The model item configuration.
	 * @param progress Progress callback for streaming response parts.
	 */
	async generateStreamingResponse(
		request: LanguageModelChatRequestMessage[],
		options: ProvideLanguageModelChatResponseOptions,
		config: ModelItem,
		progress: Progress<LanguageModelResponsePart>
	): Promise<void> {
		const languageModel = this.getLanguageModel(config.slug);
		const messages = this.convertMessages(request);
		const tools = this.convertTools(options);
		try {
			const result = await streamText({
				model: languageModel,
				messages: messages,
				tools: tools,
			});

			// We need to handle fullStream to get tool calls
			for await (const part of result.fullStream) {
				if (part.type === "reasoning-delta") {
					console.log("Reasoning delta part:", part);
					progress.report(new LanguageModelThinkingPart(part.text));
				} else if (part.type === "text-delta") {
					console.log("Text delta part:", part);
					progress.report(new LanguageModelTextPart(part.text));
				} else if (part.type === "tool-call") {
					const normalizedInput = normalizeToolInputs(part.toolName, part.input);
					const toolCall = new LanguageModelToolCallPart(part.toolCallId, part.toolName, normalizedInput as object);
					console.log("Tool call part:", toolCall);
					progress.report(toolCall);
				}
				else {
					console.debug("Unknown part type received from stream:", part);
				}
			}
		} catch (error) {
			console.error("Chat request failed:", error);
			throw error;
		}
	}
	/**
	 * Retrieves a language model by its slug identifier from the provider instance.
	 * @param slug The model slug identifier.
	 * @returns The language model instance.
	 */
	getLanguageModel(slug: string): LanguageModel {
		return this.providerInstance.languageModel(slug);
	}
	/**
	 * Converts VS Code chat request messages to the provider's model message format.
	 * @param messages Array of VS Code chat request messages.
	 * @returns Array of converted model messages.
	 */
	convertMessages(messages: readonly LanguageModelChatRequestMessage[]): ModelMessage[] {
		return LM2VercelMessage(messages);
	}
	/**
	 * Converts VS Code chat request messages to the provider's model message format.
	 * @param messages Array of VS Code chat request messages.
	 * @returns Array of converted model messages.
	 */
	convertTools(options: ProvideLanguageModelChatResponseOptions): Record<string, any> | undefined {
		return LM2VercelTool(options);
	}
}
