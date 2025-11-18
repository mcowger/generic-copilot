import * as vscode from "vscode";
import { randomUUID } from "crypto";
import type {
	ProviderConfig,
	ModelItem,
	ModelDetails
} from "./types";


import OpenAI from 'openai';
import {
	LanguageModelChatInformation,
	LanguageModelChatProvider,
	LanguageModelChatRequestMessage,
	LanguageModelChatTool,
	ProvideLanguageModelChatResponseOptions,
	LanguageModelToolCallPart,
	LanguageModelTextPart,
	LanguageModelChatMessageRole,
	LanguageModelResponsePart,
	LanguageModelToolResultPart,
	Progress,
} from "vscode";
import { resolveModelWithProvider } from "./provideModel"

// Model ID parsing helper
export interface ParsedModelId {
	baseId: string;
	configId?: string;
}

/**
 * Parse a model ID that may contain a configuration ID separator.
 * Format: "baseId::configId" or just "baseId"
 */
export function parseModelId(modelId: string): ParsedModelId {
	const parts = modelId.split("::");
	if (parts.length >= 2) {
		return {
			baseId: parts[0],
			configId: parts.slice(1).join("::"), // In case configId itself contains '::'
		};
	}
	return {
		baseId: modelId,
	};
}


/**
 * Convert VS Code tool definitions to OpenAI function tool definitions.
 * @param tools Array of VS Code LanguageModelChatTool objects
 */
export function convertTools(tools: LanguageModelChatTool[]): OpenAI.ChatCompletionCustomTool[] {
	if (!tools || tools.length === 0) {
		return [];
	}

	return [];
	// const toolDefs = tools
	// 	.filter((t) => t && typeof t === "object")
	// 	.map((t) => {
	// 		const name = t.name;
	// 		const description = typeof t.description === "string" ? t.description : "";
	// 		const params = t.inputSchema ?? {
	// 			type: "object",
	// 			properties: {}
	// 		};

	// 		// Special case: if there are no properties, don't include additionalProperties
	// 		const paramsWithSchema = params as any;
	// 		if (Object.keys(paramsWithSchema.properties || {}).length === 0 && paramsWithSchema.additionalProperties === undefined) {
	// 			delete paramsWithSchema.additionalProperties;
	// 		}

	// 		return {
	// 			type: "function" as const,
	// 			function: {
	// 				name,
	// 				description,
	// 				parameters: params,
	// 			},
	// 		};
	// 	});

	// const tool_choice: "auto" | { type: "function"; function: { name: string } } = "auto";

	// return { tools: toolDefs, tool_choice };
}


/**
 * Process headers and replace "RANDOM" values with UUIDv4.
 * @param headers The headers object from provider configuration
 * @returns Processed headers with RANDOM values replaced by UUIDs
 */
function processHeaders(headers?: Record<string, string>): Record<string, string> {
	if (!headers) {
		return {};
	}

	const processed: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		if (value === "RANDOM") {
			processed[key] = randomUUID();
		} else {
			processed[key] = value;
		}
	}
	return processed;
}


export function convertRequestToOpenAI(messages: LanguageModelChatRequestMessage[], tools?: LanguageModelChatTool[]): OpenAI.ChatCompletionCreateParamsStreaming {
	const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [];

	for (const message of messages) {
		// Convert role
		let openaiRole: 'system' | 'user' | 'assistant' | 'tool';
		switch (message.role) {
			case LanguageModelChatMessageRole.User:
				openaiRole = 'user';
				break;
			case LanguageModelChatMessageRole.Assistant:
				openaiRole = 'assistant';
				break;
			default:
				openaiRole = 'user'; // Default to user for unknown roles
		}

		// Convert content
		const contentParts: string[] = [];
		const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = [];
		let toolCallId: string | undefined;
		let toolResult: string | undefined;

		for (const part of message.content) {
			if (part instanceof LanguageModelTextPart) {
				contentParts.push(part.value);
			} else if (part instanceof LanguageModelToolCallPart) {
				// Convert tool call parts
				toolCalls.push({
					id: part.callId,
					type: 'function',
					function: {
						name: part.name,
						arguments: JSON.stringify(part.input)
					}
				} as OpenAI.ChatCompletionMessageToolCall);
			} else if (part instanceof LanguageModelToolResultPart) {
				// Tool result parts become tool messages
				const toolResultContent: string[] = [];
				for (const resultPart of part.content) {
					if (resultPart instanceof LanguageModelTextPart) {
						toolResultContent.push(resultPart.value);
					}
				}
				toolCallId = part.callId;
				toolResult = toolResultContent.join('');
			}
		}

		// Create the OpenAI message based on content type
		if (contentParts.length > 0) {
			const messageContent = contentParts.join('');

			if (openaiRole === 'assistant' && toolCalls.length > 0) {
				// Assistant message with tool calls
				openaiMessages.push({
					role: openaiRole,
					content: messageContent,
					name: message.name || undefined,
					tool_calls: toolCalls
				} as OpenAI.ChatCompletionAssistantMessageParam);
			} else if (toolCallId && toolResult) {
				// Tool result message
				openaiMessages.push({
					role: 'tool',
					content: toolResult,
					tool_call_id: toolCallId
				} as OpenAI.ChatCompletionToolMessageParam);
			} else {
				// Standard message (user, assistant, or system)
				openaiMessages.push({
					role: openaiRole,
					content: messageContent,
					name: message.name || undefined
				});
			}
		} else if (toolCallId && toolResult) {
			// Tool result message without text content
			openaiMessages.push({
				role: 'tool',
				content: toolResult,
				tool_call_id: toolCallId
			} as OpenAI.ChatCompletionToolMessageParam);
		}
	}

	const result: any = {
		stream: true,
		messages: openaiMessages
	};

	// Include tool definitions if provided
	if (tools && tools.length > 0) {
		const toolDefs = convertTools(tools);
		// if (toolDefs.tools) {
		// 	result.tools = toolDefs.tools;
		// }
		// if (toolDefs.tool_choice) {
		// 	result.tool_choice = toolDefs.tool_choice;
		// }
	}

	return result;
}


export function convertLmModeltoModelItem(model: LanguageModelChatInformation): ModelItem | undefined {
	const config = vscode.workspace.getConfiguration();
	const userModels = config.get<ModelItem[]>("generic-copilot.models", []);
	// Parse the model ID to handle a potential provider prefix and config ID suffix
	const parsedModelId = parseModelId(model.id);
	let providerHint: string | undefined;
	let baseIdForMatch = parsedModelId.baseId;
	const slashIdx = baseIdForMatch.indexOf("/");
	if (slashIdx !== -1) {
		providerHint = baseIdForMatch.slice(0, slashIdx).toLowerCase();
		baseIdForMatch = baseIdForMatch.slice(slashIdx + 1);
	}

	const getDeclaredProviderKey = (m: ModelItem): string | undefined => {
		const props = m.model_properties;
		return (m.provider ?? props.owned_by)?.toLowerCase();
	};
	let um: ModelItem | undefined = userModels.find((m) => {
		if (m.id !== baseIdForMatch) {
			return false;
		}
		const configMatch =
			(parsedModelId.configId && m.configId === parsedModelId.configId) || (!parsedModelId.configId && !m.configId);
		if (!configMatch) {
			return false;
		}
		if (!providerHint) {
			return true;
		}
		const decl = getDeclaredProviderKey(m);
		return decl ? decl === providerHint : false;
	});

	const resolvedModel = um ? resolveModelWithProvider(um) : um;
	return resolvedModel

}

async function ensureApiKey(provider: string, secrets: vscode.SecretStorage): Promise<string | undefined> {
	// Provider-level keys only; no generic key fallback
	const normalizedProvider = provider.toLowerCase();
	const providerKey = `generic-copilot.apiKey.${normalizedProvider}`;
	let apiKey = await secrets.get(providerKey);
	if (!apiKey) {
		const entered = await vscode.window.showInputBox({
			title: `API key for ${normalizedProvider}`,
			prompt: `Enter API key for ${normalizedProvider}`,
			ignoreFocusOut: true,
			password: true,
		});
		if (entered && entered.trim()) {
			apiKey = entered.trim();
			await secrets.store(providerKey, apiKey);
		}
	}
	return apiKey || undefined;
}

export async function getCoreDataForModel(modelInfo: LanguageModelChatInformation, secrets: vscode.SecretStorage): Promise<ModelDetails> {
	// Convert LanguageModelChatInformation to ModelItem
	const modelItem = convertLmModeltoModelItem(modelInfo);
	if (!modelItem) {
		throw new Error(`Model "${modelInfo.id}" not found in configuration`);
	}

	// Get model properties
	const modelProps = modelItem.model_properties;

	// Get API key for the model's provider (provider-level keys only)
	const providerKey = modelProps.owned_by;
	const modelApiKey = await ensureApiKey(providerKey, secrets);
	if (!modelApiKey) {
		throw new Error(
			providerKey && providerKey.trim()
				? `API key for provider "${providerKey}" not found`
				: "No provider specified for model; please set 'owned_by' and configure its API key"
		);
	}

	// Look up the provider configuration to get baseUrl
	const config = vscode.workspace.getConfiguration();
	const providers = config.get<ProviderConfig[]>("generic-copilot.providers", []);
	const provider = providers.find((p) => p.key === providerKey);

	if (!provider) {
		throw new Error(`Provider "${providerKey}" not found in configuration`);
	}
	const baseUrl = provider.baseUrl;
	const headers = processHeaders(provider.headers)
	return {
		modelApiKey,
		modelItem,
		baseUrl,
		headers
	};
}

export function stripDoubleNewlines(input:string): string {
	return input.replace(/\n\n+/g, '\n');
}