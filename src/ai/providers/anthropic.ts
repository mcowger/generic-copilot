import { ProviderConfig } from "../../types";
import { createAnthropic, AnthropicProviderSettings } from "@ai-sdk/anthropic";
import { ProviderClient } from "../providerClient";
import { LanguageModelChatRequestMessage, ProvideLanguageModelChatResponseOptions } from "vscode";
import { ModelMessage } from "ai";

/**
 * Adds ephemeral cache control to the last tool for Anthropic-based providers.
 *
 * Anthropic's prompt caching allows a maximum of 4 cache control breakpoints per request.
 * This function strategically places a breakpoint on only the last tool definition to
 * maximize cache hits for repeated tool definitions while staying within the limit.
 *
 * See: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 *
 * @param tools The tools object containing tool definitions
 * @returns The tools object with cache control added to the last tool only
 */
export function addAnthropicCacheControlToLastTool(
	tools: Record<string, any> | undefined
): Record<string, any> | undefined {
	if (tools) {
		const toolNames = Object.keys(tools);
		if (toolNames.length > 0) {
			// Add cache control only to the last tool
			const lastToolName = toolNames[toolNames.length - 1];
			tools[lastToolName].providerOptions = {
				anthropic: { cacheControl: { type: "ephemeral" } },
			};
		}
	}
	return tools;
}

/**
 * Adds ephemeral cache control to the last system message for Anthropic-based providers.
 *
 * Anthropic's prompt caching allows a maximum of 4 cache control breakpoints per request.
 * This function places a breakpoint on the last system message (often the most stable
 * and reusable part of the prompt) to enable efficient caching of system instructions
 * while staying within the limit.
 *
 * System messages typically contain stable instructions and context that remain consistent
 * across multiple requests, making them ideal candidates for caching.
 *
 * See: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 *
 * @param messages The array of model messages to process
 * @returns A new array with cache control added to the last system message only
 */
export function addAnthropicCacheControlToLastSystemMessage(
	messages: ModelMessage[]
): ModelMessage[] {
	// Find the index of the last system message
	let lastSystemMessageIndex = -1;
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "system") {
			lastSystemMessageIndex = i;
			break;
		}
	}

	if (lastSystemMessageIndex === -1) {
		return messages; // No system messages found
	}

	// Create a new array with cache control added to the last system message
	return messages.map((m, index) => {
		if (index === lastSystemMessageIndex) {
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

/**
 * Adds ephemeral cache control to the second-to-last user message for Anthropic-based providers.
 *
 * Anthropic's prompt caching allows a maximum of 4 cache control breakpoints per request.
 * This function places a breakpoint on the second-to-last user message (penultimate user input)
 * which represents the user context immediately preceding the latest user query. Targeting the
 * penultimate user message marks a natural boundary between previous user-provided context and
 * the most recent user query, improving cache reuse for repeated conversational patterns.
 *
 * If there is only one user message in the conversation, this function falls back to adding
 * cache control to that single user message.
 *
 * See: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 *
 * @param messages The array of model messages to process
 * @returns A new array with cache control added to the second-to-last user message only
 */
export function addAnthropicCacheControlToSecondToLastUserMessage(
	messages: ModelMessage[]
): ModelMessage[] {
	// Collect all user message indices
	const userIndices = messages.reduce<number[]>((acc, m, i) => {
		if (m.role === "user") acc.push(i);
		return acc;
	}, []);

	if (userIndices.length === 0) {
		return messages; // No user messages found
	}

	// Choose the second-to-last user index if available, otherwise fall back to the first (only) user message
	const targetIndex = userIndices.length >= 2 ? userIndices[userIndices.length - 2] : userIndices[0];

	// Create a new array with cache control added to the target user message
	return messages.map((m, index) => {
		if (index === targetIndex) {
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
		// Add cache control to the last system message and second-to-last user message
		let result = addAnthropicCacheControlToLastSystemMessage(converted);
		result = addAnthropicCacheControlToSecondToLastUserMessage(result);
		return result;
	}

	override convertTools(options: ProvideLanguageModelChatResponseOptions): Record<string, any> | undefined {
		const tools = super.convertTools(options);
		return addAnthropicCacheControlToLastTool(tools);
	}
}
