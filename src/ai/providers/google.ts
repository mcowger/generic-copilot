import {ProviderConfig, ModelItem } from "../../types";
import { createGoogleGenerativeAI, GoogleGenerativeAIProviderSettings } from "@ai-sdk/google";
import { ProviderClient } from "../providerClient";
import {
	Progress,
	LanguageModelChatRequestMessage,
	LanguageModelTextPart,
	LanguageModelThinkingPart,
	LanguageModelToolCallPart,
	ProvideLanguageModelChatResponseOptions,
	LanguageModelResponsePart2 as LanguageModelResponsePart,
} from "vscode";
import { streamText } from "ai";
import { normalizeToolInputs } from "../utils/conversion";
import { MessageLogger, LoggedRequest, LoggedResponse } from "../utils/messageLogger";
import { MetadataCache } from "../utils/metadataCache";

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
	 * Custom implementation of generateStreamingResponse for Google provider.
	 * This is needed to properly handle and preserve thoughtSignature metadata
	 * that Google Gemini-3 models require for function calls.
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
		const messageLogger = MessageLogger.getInstance();
		const metadataCache = MetadataCache.getInstance();

		// Log the incoming request as soon as possible.
		const interactionId = messageLogger.addRequestResponse({
			type: "request",
			vscodeMessages: request,
			vscodeOptions: options,
			vercelMessages: messages,
			vercelTools: tools,
			modelConfig: config
		} as LoggedRequest);

		try {
			const result = await streamText({
				model: languageModel,
				messages: messages,
				tools: tools,
			});

			const responseLog: LoggedResponse = {
				type: "response",
				textParts: [],
				thinkingParts: [],
				toolCallParts: [],
			};

			// We need to handle fullStream to get tool calls with their providerMetadata
			for await (const part of result.fullStream) {
				if (part.type === "reasoning-delta") {
					const thinkingPart = new LanguageModelThinkingPart(part.text);
					responseLog.thinkingParts?.push(thinkingPart);
					progress.report(thinkingPart);
				} else if (part.type === "text-delta") {
					const textPart = new LanguageModelTextPart(part.text);
					responseLog.textParts?.push(textPart);
					progress.report(new LanguageModelTextPart(part.text));
				} else if (part.type === "tool-call") {
					const normalizedInput = normalizeToolInputs(part.toolName, part.input);
					// Type assertion is necessary because normalizeToolInputs returns unknown
					const toolCall = new LanguageModelToolCallPart(
						part.toolCallId,
						part.toolName,
						normalizedInput as object
					);

					// Store providerMetadata (including thoughtSignature) in cache
					// This metadata will be retrieved later when converting messages back to the AI SDK format
					if (part.providerMetadata) {
						metadataCache.set(part.toolCallId, {
							providerMetadata: part.providerMetadata
						});
					}

					responseLog.toolCallParts?.push(toolCall);
					progress.report(toolCall);
				}
			}
			messageLogger.addRequestResponse(responseLog, interactionId);
		} catch (error) {
			console.error("Chat request failed:", error);
			throw error;
		}
	}
}