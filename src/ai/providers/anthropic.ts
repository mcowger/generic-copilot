import { ProviderConfig } from "../../types";
import { createAnthropic, AnthropicProviderSettings } from "@ai-sdk/anthropic";
import { ProviderClient, RequestContext } from "../providerClient";
import { LanguageModelChatRequestMessage, ProvideLanguageModelChatResponseOptions } from "vscode";
import { ModelMessage, JSONValue } from "ai";
import { logger } from "../../outputLogger";

/**
 * Known Anthropic-specific provider options that can be passed through providerOptions.anthropic
 * See: https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
 */
const KNOWN_ANTHROPIC_OPTIONS = [
	'thinking',
	'effort',
	'disableParallelToolUse',
	'sendReasoning',
	'structuredOutputMode',
	'container'
] as const;

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
 * Adds ephemeral cache control to the most recent user/tool messages for Anthropic-based providers.
 *
 * Anthropic's prompt caching allows a maximum of 4 cache control breakpoints per request.
 *
 * This function uses a rolling cache strategy for conversational contexts:
 * - The last user/tool message is marked for caching, which will be available for the next request
 * - The second-to-last user/tool message is marked to signal the cache boundary for the current request
 *
 * This creates a rolling window where each request:
 * 1. Informs the server of the last cached message (second-to-last)
 * 2. Pre-caches the new message (last) for the next turn
 *
 * IMPORTANT: Cache control is ONLY added to the LAST content part of each target message.
 * For messages with mixed content (e.g., text + tool-results), the cache control is added to
 * the last part regardless of type (text, tool-result, etc.).
 *
 * If there's only one relevant message, only that message is marked.
 * If there are two, both are marked (one for next turn, one as boundary).
 * If there are three or more, only the last two are marked to stay within the 4-breakpoint limit
 * (1 for system, up to 1 for tools, 2 for messages).
 *
 * See: https://platform.claude.com/docs/en/build-with-claude/prompt-caching#prompt-caching-examples
 *
 * @param messages The array of model messages to process
 * @returns A new array with cache control added to the last content part of target messages
 */
export function addAnthropicCacheControlToRecentUserMessages(
	messages: ModelMessage[]
): ModelMessage[] {
	// Collect all user and tool message indices (excluding system and assistant)
	const userOrToolIndices = messages.reduce<number[]>((acc, m, i) => {
		// Include user messages and tool messages (tool results from the user)
		if (m.role === "user" || m.role === "tool") acc.push(i);
		return acc;
	}, []);

	if (userOrToolIndices.length === 0) {
		return messages; // No user/tool messages found
	}

	// Always mark the last user/tool message (to cache for next request)
	const lastIndex = userOrToolIndices[userOrToolIndices.length - 1];

	// Mark the second-to-last user/tool message if it exists (to signal cache boundary for current request)
	const secondLastIndex = userOrToolIndices.length >= 2 ? userOrToolIndices[userOrToolIndices.length - 2] : null;

	const targetIndices = new Set([lastIndex, secondLastIndex].filter((idx) => idx !== null));

	// Create a new array with cache control added to target messages
	return messages.map((m, index) => {
		// Process user, tool, or assistant messages at target indices
		if (targetIndices.has(index) && m.content !== null) {
			// Handle messages with array content (multiple content parts)
			if (Array.isArray(m.content)) {
				// Find the last TEXT part index (Anthropic only supports cache control on text)
				let lastTextPartIndex = -1;
				for (let i = (m.content as any[]).length - 1; i >= 0; i--) {
					if ((m.content as any[])[i].type === "text") {
						lastTextPartIndex = i;
						break;
					}
				}

				const newContent = m.content.map((part: any, partIndex: number) => {
					// Add cache control to the LAST TEXT part (for actual caching)
					if (partIndex === lastTextPartIndex) {
						return {
							...part,
							providerOptions: {
								...part.providerOptions,
								anthropic: { cacheControl: { type: "ephemeral" } },
							},
						};
					}
					// Also add cache control to the LAST part overall (for cache boundary)
					if (partIndex === (m.content as any[]).length - 1) {
						return {
							...part,
							providerOptions: {
								...part.providerOptions,
								anthropic: { cacheControl: { type: "ephemeral" } },
							},
						};
					}
					return part;
				});

				return {
					...m,
					content: newContent,
				} as ModelMessage;
			}
			// Handle messages with string content (single content part)
			else if (typeof m.content === "string") {
				return {
					...m,
					content: [
						{
							type: "text",
							text: m.content,
							providerOptions: {
								anthropic: { cacheControl: { type: "ephemeral" } },
							},
						},
					],
				} as ModelMessage;
			}
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

	/**
	 * Provides Anthropic-specific provider options for streaming responses.
	 * Handles extra parameters from model configuration that are specific to Anthropic.
	 */
	protected override getProviderOptions(ctx: RequestContext): Record<string, Record<string, JSONValue>> | undefined {
		const { extra } = ctx.modelConfig.model_parameters ?? {};
		if (!extra) {
			return undefined;
		}

		// Build Anthropic-specific options from extra parameters
		// Note: max_tokens is handled separately in executeStreamText as maxOutputTokens
		const anthropicOptions: Record<string, JSONValue> = {};

		// Pass through any known Anthropic-specific options
		for (const key of KNOWN_ANTHROPIC_OPTIONS) {
			if (key in extra) {
				anthropicOptions[key] = extra[key] as JSONValue;
			}
		}

		return Object.keys(anthropicOptions).length > 0
			? { anthropic: anthropicOptions }
			: undefined;
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
