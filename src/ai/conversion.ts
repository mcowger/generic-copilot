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
} from "ai";

// Converts VS Code tools to AI SDK tool format
// borrowed and adapted from https://github.com/jaykv/modelbridge/blob/main/src/provider.ts (MIT License)
export function LM2VercelTool(options: ProvideLanguageModelChatResponseOptions): Record<string, any>| undefined {
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

// Converts VS Code LanguageModelChatRequestMessage array to AI SDK ModelMessage array
// borrowed and adapted from https://github.com/jaykv/modelbridge/blob/main/src/provider.ts (MIT License)
export function LM2VercelMessage(messages: readonly LanguageModelChatRequestMessage[]): ModelMessage[] {
	const messagesPayload = messages.map((message) => {
		const toolResults: ToolResultPart[] = [];
		const assistantParts: Array<TextPart | ToolCallPart | ReasoningOutput> = [];
		const userParts: TextPart[] = [];

		for (const part of message.content) {
			if (part instanceof LanguageModelToolResultPart) {
				// VS Code tool results do not carry the tool name, so use a safe fallback.
				toolResults.push({
					type: "tool-result",
					toolCallId: part.callId,
					toolName: (part as { name?: string }).name ?? "unknown",
					output: {
            type: 'text',
            value: part.content[0] as string
          }
        });
				continue;
			}

			if (part instanceof LanguageModelToolCallPart) {
				assistantParts.push({
					type: "tool-call",
					toolCallId: part.callId,
					toolName: part.name,
					input: part.input,
				});
				continue;
			}

			if (part instanceof LanguageModelThinkingPart) {
				const text = Array.isArray(part.value) ? part.value.join("") : part.value;
				assistantParts.push({ type: "reasoning", text });
				continue;
			}

			if (part instanceof LanguageModelTextPart) {
				const textPart: TextPart = { type: "text", text: part.value };
				if (message.role === LanguageModelChatMessageRole.User) {
					userParts.push(textPart);
				} else {
					assistantParts.push(textPart);
				}
				continue;
			}

			// Unknown part: stringify into text to keep payload valid.
			const fallbackText: TextPart = { type: "text", text: JSON.stringify(part) };
			if (message.role === LanguageModelChatMessageRole.User) {
				userParts.push(fallbackText);
			} else {
				assistantParts.push(fallbackText);
			}
		}

		if (message.role === LanguageModelChatMessageRole.User) {
			const content = userParts.length === 1 ? userParts[0].text : userParts;
			return {
				role: "user",
				content,
			} as UserModelMessage;
		}

		const assistantContent = assistantParts.length === 1 && assistantParts[0].type === "text"
			? assistantParts[0].text
			: assistantParts;

		return {
			role: "assistant",
			content: assistantContent,
		} as AssistantModelMessage;
	});

	return messagesPayload;
}

/**
 * Converts VS Code LanguageModelChatRequestMessage array to AI SDK ModelMessage array
 *
 * Maps the following message types:
 * - User role -> UserModelMessage
 * - Assistant role -> AssistantModelMessage
 *
 * Note: System messages are not directly supported in LanguageModelChatRequestMessage,
 * so only user and assistant roles are converted.
 */
// export function LM2VercelMessage(
//   messages: readonly LanguageModelChatRequestMessage[]
// ): (UserModelMessage | AssistantModelMessage)[] {
//   return messages.map((message) => {
//     // User message
//     if (message.role === LanguageModelChatMessageRole.User) {
//       // Extract content from parts - can include text parts and tool result parts
//       const userContent: Array<any> = [];

//       for (const part of message.content) {
//         // Text part
//         if (part instanceof LanguageModelTextPart) {
//           userContent.push({
//             type: "text" as const,
//             text: part.value,
//           });
//         }
//         // Tool result part - link tool results back to tool calls
//         else if (part instanceof LanguageModelToolResultPart) {
//           userContent.push({
//             type: "tool-result" as const,
//             toolCallId: part.callId,
//             toolName: (part as any).name || "unknown",
//             result: part.content?.[0] ?? null,
//           });
//         }
//       }

//       // If only one text part, simplify to string content
//       if (userContent.length === 1 && userContent[0].type === "text") {
//         return {
//           role: "user" as const,
//           content: userContent[0].text,
//         } as UserModelMessage;
//       }

//       // Mixed content - return as array of parts
//       return {
//         role: "user" as const,
//         content: userContent,
//       } as UserModelMessage;
//     }

//     // Assistant message
//     if (message.role === LanguageModelChatMessageRole.Assistant) {
//       // Convert assistant message parts to AI SDK format
//       const assistantContent = message.content.map((part) => {
//         // Text part
//         if (part instanceof LanguageModelTextPart) {
//           return {
//             type: "text" as const,
//             text: part.value,
//           };
//         }

//         // Tool call part - convert from VSCode format to AI SDK format
//         if (part instanceof LanguageModelToolCallPart) {
//           return {
//             type: "tool-call" as const,
//             toolCallId: part.callId,
//             toolName: part.name,
//             args: part.input ?? {},
//           };
//         }

//         // Default fallback for unknown part types
//         return {
//           type: "text" as const,
//           text: JSON.stringify(part),
//         };
//       });

//       // If only one text part, simplify to string content
//       if (assistantContent.length === 1 && assistantContent[0].type === "text") {
//         return {
//           role: "assistant" as const,
//           content: assistantContent[0].text,
//         } as AssistantModelMessage;
//       }

//       return {
//         role: "assistant" as const,
//         content: assistantContent,
//       } as AssistantModelMessage;
//     }

//     // Fallback for unknown message types - treat as user message with text content
//     const textParts = message.content
//       .filter((p): p is LanguageModelTextPart => p instanceof LanguageModelTextPart)
//       .map(p => p.value)
//       .join("");

//     return {
//       role: "user" as const,
//       content: textParts || "",
//     } as UserModelMessage;
//   });
// }
