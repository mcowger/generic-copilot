import { ModelItem, ProviderConfig } from "../../types";
import { createAnthropic, AnthropicProviderSettings } from "@ai-sdk/anthropic";
import { ProviderClient } from "../providerClient";
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
import { MessageLogger, LoggedRequest, LoggedResponse, LoggedInteraction } from "../utils/messageLogger";
import { logger } from "../../outputLogger";
import { updateContextStatusBar } from "../../statusBar";
import { LM2VercelMessage, LM2VercelTool, normalizeToolInputs } from "../utils/conversion";
import { streamText, JSONValue, ModelMessage } from "ai";
import * as vscode from "vscode";

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
	async generateStreamingResponse(
		request: LanguageModelChatRequestMessage[],
		options: ProvideLanguageModelChatResponseOptions,
		config: ModelItem,
		progress: Progress<LanguageModelResponsePart>,
		statusBarItem: vscode.StatusBarItem,
		providerOptions?: Record<string, Record<string, JSONValue>>
	): Promise<void> {
		const languageModel = this.getLanguageModel(config.slug);
		// Filter out system messages from the request, as we are providing a specific system message in streamText
		const messages = this.convertMessages(request).filter(m => m.role !== 'system');
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
					system: "You are Claude Code, Anthropic's official CLI for Claude.",
					providerOptions: providerOptions || {},
					onError: ({ error }) => {
						logger.error(`Error during streaming response: ${error instanceof Error ? error.message : String(error)}`);
						streamError = error;
					},
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
				responseLog.usage = await result.usage;

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
}
