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
 * Adds ephemeral cache control to the most recent user messages for Anthropic-based providers.
 *
 * Anthropic's prompt caching allows a maximum of 4 cache control breakpoints per request.
 *
 * This function uses a rolling cache strategy for conversational contexts:
 * - The last user message is marked for caching, which will be available for the next request
 * - The second-to-last user message is marked to signal the cache boundary for the current request
 *
 * This creates a rolling window where each request:
 * 1. Informs the server of the last cached message (second-to-last)
 * 2. Pre-caches the new message (last) for the next turn
 *
 * If there's only one user message, only that message is marked.
 * If there are two user messages, both are marked (one for next turn, one as boundary).
 * If there are three or more, only the last two are marked to stay within the 4-breakpoint limit
 * (1 for system, up to 1 for tools, 2 for messages).
 *
 * See: https://platform.claude.com/docs/en/build-with-claude/prompt-caching#prompt-caching-examples
 *
 * @param messages The array of model messages to process
 * @returns A new array with cache control added to the last and second-to-last user messages
 */
export function addAnthropicCacheControlToRecentUserMessages(
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

	// Always mark the last user message (to cache for next request)
	const lastUserIndex = userIndices[userIndices.length - 1];

	// Mark the second-to-last user message if it exists (to signal cache boundary for current request)
	const secondLastUserIndex = userIndices.length >= 2 ? userIndices[userIndices.length - 2] : null;

	// Create a new array with cache control added to the targets
	return messages.map((m, index) => {
		if (index === lastUserIndex || index === secondLastUserIndex) {
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
		// Add cache control to the last system message and recent user messages
		let result = addAnthropicCacheControlToLastSystemMessage(converted);
		result = addAnthropicCacheControlToRecentUserMessages(result);
		return result;
	}

	override convertTools(options: ProvideLanguageModelChatResponseOptions): Record<string, any> | undefined {
		const tools = super.convertTools(options);
		return addAnthropicCacheControlToLastTool(tools);
	}
}
