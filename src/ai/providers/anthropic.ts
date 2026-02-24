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
			logger.debug(`[Cache Control] Adding to last tool: ${lastToolName} (${toolNames.length} tools total)`);
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

	logger.debug(`[Cache Control] Adding to last system message at index ${lastSystemMessageIndex}`);

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
 * Adds ephemeral cache control to the most recent user/tool/assistant messages for Anthropic-based providers.
 *
 * Anthropic's prompt caching allows a maximum of 4 cache control breakpoints per request.
 *
 * Cache breakpoint strategy:
 * - Anthropic-compatible docs describe marking the final block to enable incremental prompt caching.
 * - In tool turns, placing cache_control only on user tool_result can leave assistant tool_use/thinking
 *   outside the growing cache window on some providers.
 * - We therefore mark both:
 *   1) the last assistant message's last content block (if it contains tool calls), and
 *   2) the last user/tool message block.
 *
 * For longer conversations with many tool turns, we also mark the second-to-last assistant message
 * to ensure the cache window grows properly across multiple tool interactions.
 *
 * Empirical impact from field usage:
 * - MiniMax and Kimi providers: drastic improvement (cache hit rates often 80%+ instead of stalling
 *   near system-prompt-sized cache reads).
 * - Anthropic native models: small positive improvement.
 *
 * This dual-marking pattern aligns with other coding tools that have solved similar cache stalling issues.
 *
 * See: https://platform.claude.com/docs/en/build-with-claude/prompt-caching#prompt-caching-examples
 *
 * @param messages The array of model messages to process
 * @returns A new array with cache control added to the last content part of target messages
 */
export function addAnthropicCacheControlToRecentUserMessages(
	messages: ModelMessage[]
): ModelMessage[] {
	// Find the last two assistant message indices (for tool calls)
	const assistantIndices: number[] = [];
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "assistant") {
			assistantIndices.push(i);
			if (assistantIndices.length === 2) break;
		}
	}

	// Collect all user and tool message indices (excluding system and assistant)
	const userOrToolIndices = messages.reduce<number[]>((acc, m, i) => {
		// Include user messages and tool messages (tool results from the user)
		if (m.role === "user" || m.role === "tool") acc.push(i);
		return acc;
	}, []);

	if (userOrToolIndices.length === 0 && assistantIndices.length === 0) {
		return messages; // No relevant messages found
	}

	// Always mark the last user/tool message (to cache for next request)
	const lastUserIndex = userOrToolIndices.length > 0 ? userOrToolIndices[userOrToolIndices.length - 1] : null;

	// Build target indices based on conversation length
	// For longer conversations (>5 messages), prioritize recent assistant messages over system
	const targetIndices = new Set<number>();
	
	if (messages.length > 5 && assistantIndices.length >= 2) {
		// Long conversation: mark last 2 assistant messages and last user/tool
		targetIndices.add(assistantIndices[0]); // last assistant
		targetIndices.add(assistantIndices[1]); // second-to-last assistant
		if (lastUserIndex !== null) targetIndices.add(lastUserIndex);
	} else {
		// Short conversation: mark last assistant and last user/tool
		if (assistantIndices.length > 0) targetIndices.add(assistantIndices[0]);
		if (lastUserIndex !== null) targetIndices.add(lastUserIndex);
	}

	logger.debug(`[Cache Control] Message count: ${messages.length}, Assistant indices: [${assistantIndices.join(', ')}], Last user: ${lastUserIndex}, Targets: [${Array.from(targetIndices).join(', ')}]`);

	// Create a new array with cache control added to target messages
	return messages.map((m, index) => {
		// Process user, tool, or assistant messages at target indices
		if (targetIndices.has(index) && m.content !== null) {
			// Handle messages with array content (multiple content parts)
			if (Array.isArray(m.content)) {
				// For assistant messages, add cache control to the last content block (typically last tool call)
				// For user messages, add cache control to the last content block
				const lastPartIndex = (m.content as any[]).length - 1;
				logger.debug(`[Cache Control] Adding to message ${index} (${m.role}), last part index: ${lastPartIndex}, part type: ${(m.content as any[])[lastPartIndex]?.type}`);
				
				const newContent = m.content.map((part: any, partIndex: number) => {
					// Add cache control to the LAST part (regardless of type)
					if (partIndex === lastPartIndex) {
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
				logger.debug(`[Cache Control] Adding to message ${index} (${m.role}), string content`);
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
		
		// Log message structure before adding cache control
		logger.debug(`[Cache Control] Converting ${converted.length} messages:`);
		converted.forEach((m, i) => {
			const contentType = Array.isArray(m.content) 
				? `array[${(m.content as any[]).length}]: ${(m.content as any[]).map((p: any) => p.type).join(', ')}`
				: typeof m.content === 'string' ? 'string' : 'null';
			logger.debug(`  [${i}] ${m.role}: ${contentType}`);
		});
		
		// Add cache control strategically to stay within 4 breakpoint limit
		// For short conversations (<=5 messages), cache the system message
		// For longer conversations, skip system (already cached) and focus on recent messages
		let result = converted;
		if (converted.length <= 5) {
			result = addAnthropicCacheControlToLastSystemMessage(result);
		}
		result = addAnthropicCacheControlToRecentUserMessages(result);
		
		// Log final cache control placement
		logger.debug(`[Cache Control] Final cache control placement:`);
		result.forEach((m, i) => {
			const hasCacheControl = m.providerOptions?.anthropic?.cacheControl ? true : false;
			const contentCacheControl = Array.isArray(m.content) 
				? (m.content as any[]).map((p: any, pi: number) => 
					p.providerOptions?.anthropic?.cacheControl ? `part[${pi}]` : null
				).filter(Boolean).join(', ')
				: '';
			if (hasCacheControl || contentCacheControl) {
				logger.debug(`  [${i}] ${m.role}: message=${hasCacheControl}, content=${contentCacheControl || 'none'}`);
			}
		});
		
		return result;
	}

	override convertTools(options: ProvideLanguageModelChatResponseOptions): Record<string, any> | undefined {
		const tools = super.convertTools(options);
		const result = addAnthropicCacheControlToLastTool(tools);
		
		// Log which tool got cache control
		if (result) {
			const toolsWithCache = Object.entries(result)
				.filter(([_, tool]) => (tool as any).providerOptions?.anthropic?.cacheControl)
				.map(([name]) => name);
			if (toolsWithCache.length > 0) {
				logger.debug(`[Cache Control] Tools with cache control: ${toolsWithCache.join(', ')}`);
			}
		}
		
		return result;
	}
}
