import {
	LanguageModelChatRequestMessage,
	LanguageModelChatMessageRole,
	LanguageModelTextPart,
	LanguageModelThinkingPart,
	LanguageModelToolCallPart,
	LanguageModelToolResultPart,
	ProvideLanguageModelChatResponseOptions,
} from "vscode";
import {
	AssistantModelMessage,
	ModelMessage,
	ReasoningOutput,
	TextPart,
	ToolCallPart,
	ToolModelMessage,
	ToolResultPart,
	UserModelMessage,
	tool,
	jsonSchema,
	SystemModelMessage,
	type JSONValue,
} from "ai";
import { CacheRegistry, ToolCallMetadata } from "./metadataCache";
import { logger } from "../../outputLogger";
//import { LanguageModelChatMessageRoleExtended, LanguageModelChatMessageRoleExtended as LanguageModelChatMessageRoleExtendedType } from "../../types";

/**
 * Tool call part with providerOptions for sending to AI SDK providers.
 * providerOptions is used for INPUT (what we send to providers),
 * while providerMetadata is used for OUTPUT (what we receive from providers).
 */
interface ToolCallPartWithProviderOptions extends ToolCallPart {
	providerOptions?: Record<string, Record<string, JSONValue>>;
}

// Converts VS Code tools to AI SDK tool format
// borrowed and adapted from https://github.com/jaykv/modelbridge/blob/main/src/provider.ts (MIT License)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function LM2VercelTool(options: ProvideLanguageModelChatResponseOptions): Record<string, any> | undefined {
	logger.debug(`Converting VS Code tools to AI SDK format`);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const tools: Record<string, any> = {};
	if (options.tools) {
		for (const vsTool of options.tools) {
			// Use AI SDK's tool() function to create properly validated tools
			tools[vsTool.name] = tool({
				description: vsTool.description,
				inputSchema: jsonSchema(vsTool.inputSchema ?? {}),
			});
		}
	}
	return Object.keys(tools).length > 0 ? tools : undefined;
}

/**
 * Normalize tool input before sending to VS Code APIs.
 * Workaround for AI SDK deep-parsing JSON content for some tools
 * (e.g. `create_file` expects `content` as a string).
 */
export function normalizeToolInputs(toolName: string, input: unknown): unknown {
	logger.debug(`Normalizing tool inputs for tool "${toolName}"`);
	if (!input || typeof input !== "object") {
		return input;
	}

	const obj = input as Record<string, unknown>;

	if (toolName === "create_file" && obj.content && typeof obj.content === "object") {
		return {
			...obj,
			content: JSON.stringify(obj.content, null, 2),
		};
	}

	return input;
}

/**
 * Converts tool result content to a string.
 * Handles various formats:
 * - string: returned as-is
 * - object with .value property: returns the value (which may be a string or object)
 * - object with .text property: returns the text
 * - other objects: stringified as JSON
 * - arrays: converted to array of stringified content elements
 */
export function convertToolResultToString(content: unknown): string {
	logger.debug(`Converting tool result content to string`);
	// Handle string case
	if (typeof content === "string") {
		return content;
	}

	// Handle object case
	if (typeof content === "object" && content !== null) {
		const obj = content as Record<string, unknown>;

		// Check for .value property (may itself be a string or object)
		if ("value" in obj) {
			const value = obj.value;
			if (typeof value === "string") {
				return value;
			}
			if (typeof value === "object") {
				return JSON.stringify(value, null, 2);
			}
			return String(value);
		}

		// Check for .text property
		if ("text" in obj) {
			const text = obj.text;
			if (typeof text === "string") {
				return text;
			}
			return JSON.stringify(text, null, 2);
		}

		// Fallback: stringify the object
		return JSON.stringify(obj, null, 2);
	}

	// Handle arrays
	if (Array.isArray(content)) {
		return content.map((item) => convertToolResultToString(item)).join("\n");
	}

	// Fallback for primitives
	return String(content);
}

// Converts VS Code LanguageModelChatRequestMessage array to AI SDK ModelMessage array
// borrowed and adapted from https://github.com/jaykv/modelbridge/blob/main/src/provider.ts (MIT License)
export function LM2VercelMessage(messages: readonly LanguageModelChatRequestMessage[]): ModelMessage[] {
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
			const contentParts: (TextPart | ReasoningOutput)[] = [];
			const toolCalls: Array<Record<string, unknown>> = [];

			for (const part of message.content) {
				if (part instanceof LanguageModelToolCallPart) {
					// Convert LanguageModelToolCallPart into a serializable `tool_calls` entry
					// We keep the original cache-related comments and behavior here so
					// downstream systems (and templates) can associate provider metadata.
					// Retrieve providerMetadata from cache (e.g., Google's thoughtSignature)
					// The metadata was stored by the provider's generateStreamingResponse
					// Note: We do NOT delete the cache entry here because the same assistant message
					// will be converted multiple times as part of conversation history in future turns
					//
					// IMPORTANT: We use providerOptions (not providerMetadata) when SENDING to providers
					// providerMetadata is what we RECEIVE from providers, providerOptions is what we SEND
					const cache = CacheRegistry.getCache("toolCallMetadata");
					const cachedMetadata = cache.get(part.callId) as ToolCallMetadata | undefined;
					const providerOptions = cachedMetadata?.providerMetadata;

					const toolCallFunc: Record<string, unknown> = {
						function: {
							name: part.name ?? "unknown",
							arguments: part.input ?? {},
						},
					};

					if (providerOptions) {
						toolCallFunc.function = { ...(toolCallFunc.function as object), providerOptions };
					}

					toolCalls.push(toolCallFunc);
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

			const assistantMsg: Record<string, unknown> = { role: "assistant", content: contentParts };
			if (toolCalls.length > 0) {
				assistantMsg["tool_calls"] = toolCalls;
			}

			messagesPayload.push(assistantMsg as AssistantModelMessage);
		}
	}

	// Post-process: merge consecutive `user` messages into a single message.
	// Some frontends (and certain model prompt templates) require that after an
	// optional `system` message, roles alternate `user` / `assistant` (tool calls
	// and results are allowed exceptions). VS Code may produce multiple
	// consecutive `user` messages; merge them here to avoid prompt template
	// rendering errors (e.g., Jinja complaining about non-alternating roles).
	const mergedPayload: ModelMessage[] = [];
	for (const msg of messagesPayload) {
		if (msg.role === "user" && mergedPayload.length > 0 && mergedPayload[mergedPayload.length - 1].role === "user") {
			// Safe to treat content as string for user messages
			const prev = mergedPayload[mergedPayload.length - 1] as UserModelMessage;
			const curr = msg as UserModelMessage;
			prev.content = `${String(prev.content)}\n${String(curr.content)}`;
		} else {
			mergedPayload.push(msg);
		}
	}

	return mergedPayload;
}
