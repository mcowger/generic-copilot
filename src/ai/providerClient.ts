import {
	Progress,
	LanguageModelChatRequestMessage,
	LanguageModelTextPart,
	LanguageModelThinkingPart, //part of proposed api
	LanguageModelToolCallPart,
	ProvideLanguageModelChatResponseOptions,
	LanguageModelResponsePart2 as LanguageModelResponsePart, //part of proposed api
	CancellationToken,
} from "vscode";
import { updateContextStatusBar } from "../statusBar";
import { z } from "zod";
import * as vscode from "vscode";

import { generateText, JSONValue, streamText, LanguageModelUsage, StreamTextResult } from "ai";
import { ModelItem, ProviderConfig, VercelType } from "../types";
import { LM2VercelTool, normalizeToolInputs, convertToolResultToString } from "./utils/conversion";
import { CacheRegistry, ToolCallMetadata } from "./utils/metadataCache";
import { AssistantModelMessage, ToolModelMessage, ToolResultPart, UserModelMessage, TextPart, ReasoningOutput, SystemModelMessage, ModelMessage, LanguageModel, Provider, ProviderMetadata, ToolCallPart } from "ai";
import { LanguageModelChatMessageRole, LanguageModelToolResultPart } from "vscode";
import { MessageLogger, LoggedRequest, LoggedResponse, LoggedInteraction } from "./utils/messageLogger";
import { logger } from "../outputLogger";
import {
	generateCompletionPromptInstruction,
	completionSystemInstruction,
	completionDescription,
} from "../autocomplete/constants";

// Local helper: ToolCallPartWithProviderOptions (originally defined in conversion.ts)
interface ToolCallPartWithProviderOptions extends ToolCallPart {
	providerOptions?: Record<string, Record<string, JSONValue>>;
}

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
		logger.debug(`ProviderClient created for type "${type}" with config ID "${config.id}"`);
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
		progress: Progress<LanguageModelResponsePart>,
		statusBarItem: vscode.StatusBarItem,
		providerOptions?: Record<string, Record<string, JSONValue>>
	): Promise<void> {
		const languageModel = this.getLanguageModel(config.slug);
		const messages = this.convertMessages(request);
		const tools = this.convertTools(options);
		const messageLogger = MessageLogger.getInstance();
		logger.debug(`Generating streaming response for model "${config.id}" with provider "${this.config.id}"`);

		//Log the incoming request as soon as possible.
		const interactionId = messageLogger.addRequestResponse({
			type: "request",
			vscodeMessages: request,
			vscodeOptions: options,
			vercelMessages: messages,
			vercelTools: tools,
			modelConfig: config,
		} as LoggedRequest);

		let lastError: any;
		const maxRetries = config.retries ?? 3;
		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				logger.debug(`Streaming response started for model "${config.id}" with provider "${this.config.id}"`);
				let streamError: any;

				// Record start time for performance measurement
				const startTime = Date.now();

				const responseLog: LoggedResponse = {
					type: "response",
					textParts: [],
					thinkingParts: [],
					toolCallParts: [],
				};
				logger.debug(`Processing streaming response parts for model "${config.id}" with provider "${this.config.id}"`);
				const result = streamText({
					model: languageModel,
					messages: messages,
					tools: tools,
					maxRetries: 3,
					providerOptions: providerOptions || {},
					onError: ({ error }) => {
						logger.error(`Error during streaming response: ${error instanceof Error ? error.message : String(error)}`);
						streamError = error;
					}
				});

				// We need to handle fullStream to get tool calls
				for await (const part of result.fullStream) {
					if (part.type === "reasoning-delta") {
						this.processReasoningDelta(part.id, part.text);
						const thinkingPart = new LanguageModelThinkingPart(part.text, part.id);
						responseLog.thinkingParts?.push(thinkingPart);
						progress.report(thinkingPart);
					} else if (part.type === "text-delta") {
						const textPart = new LanguageModelTextPart(part.text);
						responseLog.textParts?.push(textPart);
						progress.report(textPart);
					} else if (part.type === "tool-call") {
						const normalizedInput = normalizeToolInputs(part.toolName, part.input);
						const toolCall = new LanguageModelToolCallPart(part.toolCallId, part.toolName, normalizedInput as object);

						// Allow subclasses to process tool call metadata.
						// Only called by subclasses that implement it (e.g., GoogleProviderClient).
						this.processToolCallMetadata(part.toolCallId, part.providerMetadata);

						responseLog.toolCallParts?.push(toolCall);
						progress.report(toolCall);
					}
				}
				if (streamError) {
					throw streamError;
				}

				// Allow subclasses to process response-level metadata (e.g., OpenAI's responseId)
				this.processResponseMetadata(result);

				// Add usage information after streaming completes
				responseLog.usage = await this.processResultData(result);

				// Calculate duration
				const endTime = Date.now();
				responseLog.durationMs = endTime - startTime;

				// Calculate tokens per second (whole number)
				if (responseLog.usage?.outputTokens) {
					const durationSeconds = responseLog.durationMs / 1000;
					responseLog.tokensPerSecond = Math.round(responseLog.usage.outputTokens / durationSeconds);
				}
				updateContextStatusBar(
					responseLog.usage.totalTokens || 0,
					config.model_properties.context_length || 0,
					statusBarItem
				);
				messageLogger.addRequestResponse(responseLog, interactionId);
				return;
			} catch (error) {
				progress.report(
					new LanguageModelThinkingPart("\n\n[Error occurred during streaming response.  Retrying...]\n", "error")
				);
				lastError = error;
				logger.warn(
					`Chat request failed (attempt ${attempt + 1}): ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}
		logger.error("Chat request failed after retries:", (lastError as Error).message);
		vscode.window.showErrorMessage(
			`Chat request failed after multiple attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`
		);
	}

	async getInlineCompleteResponse(
		config: ModelItem,
		prefix: string,
		suffix: string,
		fileName: string,
		languageId: string,
		token: CancellationToken
	): Promise<string> {
		const languageModel = this.getLanguageModel(config.slug);

		const result = await generateText({
			model: languageModel,
			system: completionSystemInstruction,
			// Construct the prompt using the inputs
			prompt: generateCompletionPromptInstruction(fileName, languageId, prefix, suffix),
		});
		return result.text;
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
	 * Converts VS Code LanguageModelChatRequestMessage array to AI SDK ModelMessage array
   * borrowed and adapted from https://github.com/jaykv/modelbridge/blob/main/src/provider.ts (MIT License)
	 * @param messages Array of VS Code chat request messages.
	 * @returns Array of converted model messages.
	 */
	convertMessages(messages: readonly LanguageModelChatRequestMessage[]): ModelMessage[] {
		logger.debug(`Converting VS Code chat messages to AI SDK format`);
		const messagesPayload: ModelMessage[] = [];

		for (const message of messages) {
			if (message.role === LanguageModelChatMessageRole.System) {
				logger.debug(`Processing system message`);
				messagesPayload.push({
					role: "system",
					content: (message.content[0] as LanguageModelTextPart).value,
				} as SystemModelMessage);
			}
			if (message.role === LanguageModelChatMessageRole.User) {
				logger.debug(`Processing user message`);
				const textParts: string[] = [];
				const toolResults: ToolResultPart[] = [];

				for (const part of message.content) {
					if (part instanceof LanguageModelToolResultPart) {
						logger.debug(`Processing tool result part with callId "${part.callId}"`);
						toolResults.push({
							type: "tool-result",
							toolCallId: part.callId,
							toolName: (part as { name?: string }).name ?? "unknown",
							output: { type: "text", value: convertToolResultToString(part.content[0]) },
						});
					} else if (part instanceof LanguageModelTextPart) {
						textParts.push(part.value);
					}
				}

				if (toolResults.length > 0) {
					messagesPayload.push({ role: "tool", content: toolResults } as ToolModelMessage);
				} else {
					messagesPayload.push({ role: "user", content: textParts.join("\n") } as UserModelMessage);
				}
			}

			if (message.role === LanguageModelChatMessageRole.Assistant) {
				logger.debug(`Processing assistant message`);
				const contentParts: (TextPart | ToolCallPart | ReasoningOutput)[] = [];

				for (const part of message.content) {
					if (part instanceof LanguageModelToolCallPart) {
						const toolCallPart: ToolCallPartWithProviderOptions = {
							type: "tool-call",
							toolCallId: part.callId,
							toolName: part.name,
							input: part.input,
						};

						// Retrieve providerMetadata from cache (e.g., Google's thoughtSignature)
						// The metadata was stored by the provider's generateStreamingResponse
						// Note: We do NOT delete the cache entry here because the same assistant message
						// will be converted multiple times as part of conversation history in future turns
						//
						// IMPORTANT: We use providerOptions (not providerMetadata) when SENDING to providers
						// providerMetadata is what we RECEIVE from providers, providerOptions is what we SEND
						const cache = CacheRegistry.getCache("toolCallMetadata");
						const cachedMetadata = cache.get(part.callId) as ToolCallMetadata | undefined;
						if (cachedMetadata?.providerMetadata) {
							logger.debug(`Using cached provider metadata for toolCallId "${part.callId}"`);
							toolCallPart.providerOptions = cachedMetadata.providerMetadata;
						}

						contentParts.push(toolCallPart);
					} else if (part instanceof LanguageModelThinkingPart) {
						if (part.id && part.id.startsWith("error")) {
							continue;
							// Specialized thinking part for error messages; skip and dont include in context.
							// VScode doesn't allow a reasonable way to inject errors into the chat history.
							// So in generateStreamingResponse() we use a thinking part with id "error" to indicate an error.
							// And specifically exclude it here.
						}
						const text = Array.isArray(part.value) ? part.value.join("") : part.value;
						contentParts.push({ type: "reasoning", text });
					} else if (part instanceof LanguageModelTextPart) {
						contentParts.push({ type: "text", text: part.value });
					}
				}

				messagesPayload.push({ role: "assistant", content: contentParts } as AssistantModelMessage);
			}
		}
		return messagesPayload;
	}
	/**
	 * Converts VS Code chat request messages to the provider's model message format.
	 * @param messages Array of VS Code chat request messages.
	 * @returns Array of converted model messages.
	 */
	convertTools(options: ProvideLanguageModelChatResponseOptions): Record<string, any> | undefined {
		return LM2VercelTool(options);
	}

	/**
	 * Hook for subclasses to process tool call metadata from the provider.
	 * Override this method to handle provider-specific metadata (e.g., Google's thoughtSignature).
	 * @param toolCallId The ID of the tool call.
	 * @param providerMetadata The metadata from the provider, if any.
	 */
	protected processToolCallMetadata(toolCallId: string, providerMetadata: ProviderMetadata | undefined): void {
		// Default implementation does nothing.
		// Subclasses like GoogleProviderClient can override to cache metadata.
	}

	/**
	 * Hook for subclasses to observe/accumulate reasoning deltas from the provider stream.
	 * Useful for providers that require sending back reasoning content for tool-call continuation.
	 */
	protected processReasoningDelta(_id: string, _deltaText: string): void {
		// Default implementation does nothing.
	}

	/**
	 * Hook for subclasses to process response-level metadata from the provider.
	 * Override this method to handle provider-specific response metadata (e.g., OpenAI's responseId).
	 * @param result The streaming result object from streamText.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected processResponseMetadata(result: any): void {
		// Default implementation does nothing.
		// Subclasses like OpenAIProviderClient can override to cache response metadata.
	}

	protected processResultData(result: StreamTextResult<Record<string, any>, never>): Promise<LanguageModelUsage> {
		// Default implementation does nothing.
		// Subclasses can override to process result data from the provider.
		return result.usage
	}
}
