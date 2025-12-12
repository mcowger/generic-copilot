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
				inputSchema: jsonSchema(vsTool.inputSchema ?? { type: "object", properties: {} }),
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

