import * as vscode from "vscode";
import { CancellationToken, LanguageModelChatInformation, LanguageModelChatRequestMessage } from "vscode";
import { get_encoding } from "tiktoken";
import { logger } from "./outputLogger";
/**
 * Returns the number of tokens for a given text using the model specific tokenizer logic
 * @param model The language model to use
 * @param text The text to count tokens for
 * @param token A cancellation token for the request
 * @returns A promise that resolves to the number of tokens
 */



export async function prepareTokenCount(
	_model: LanguageModelChatInformation,
	text: LanguageModelChatRequestMessage,
	_token: CancellationToken
): Promise<number> {

	// For complex messages, calculate tokens for each part separately
	let totalTokens = 0;

	for (const part of text.content) {
		if (part instanceof vscode.LanguageModelTextPart) {
			// Estimate tokens directly for plain text
			totalTokens += estimateTextTokens(part.value);
		} else if (part instanceof vscode.LanguageModelToolCallPart) {
			// Tool call token calculation
			totalTokens += estimateToolTokens(part);
		} else if (part instanceof vscode.LanguageModelToolResultPart) {
			// Tool result token calculation
			const resultText = typeof part.content === "string" ? part.content : JSON.stringify(part.content);
			totalTokens += estimateTextTokens(resultText);
		}
	}
	// Apply correction factor based on empirical observations
	totalTokens = Math.ceil(totalTokens * 1.0166);
	logger.debug(`Token count prepared: ${totalTokens}`);
	return totalTokens;
}


/** Roughly estimate tokens for VS Code chat messages (text only) */
export function estimateMessagesTokens(msgs: readonly vscode.LanguageModelChatRequestMessage[]): number {
	const enc = get_encoding("o200k_base");
	let total = 0;
	for (const m of msgs) {
		for (const part of m.content) {
			if (part instanceof vscode.LanguageModelTextPart) {
				total += enc.encode_ordinary(part.value).length;
			}
		}
	}
	enc.free();
	return total;
}

/** Token estimation for different content types */
export function estimateTextTokens(text: string): number {
	const enc = get_encoding("o200k_base");
	const len = enc.encode_ordinary(text).length;
	enc.free();
	return len;
}

/** Rough token estimate for tool definitions by JSON size */
export function estimateToolTokens(
	toolCall: vscode.LanguageModelToolCallPart
): number {
	const enc = get_encoding("o200k_base");
	let total = 0;
	total += enc.encode_ordinary(toolCall.name).length;
	total += enc.encode_ordinary(JSON.stringify(toolCall.input)).length;
	total += enc.encode_ordinary(JSON.stringify(toolCall.callId)).length;
	enc.free();
	return total
}
