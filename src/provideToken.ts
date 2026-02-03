import * as vscode from "vscode";
import {
	CancellationToken,
	LanguageModelChatInformation,
	LanguageModelChatRequestMessage,
	LanguageModelDataPart,
} from "vscode";
import { logger } from "./outputLogger";

let estimateTokenCount: ((text: string) => number) | null = null;

async function loadEstimateTokenCount() {
	if (!estimateTokenCount) {
		const module = await import("tokenx");
		estimateTokenCount = module.estimateTokenCount;
	}
	return estimateTokenCount;
}
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

	// Handle case where content might be a string instead of an array (VS Code API change)
	const contentParts = Array.isArray(text.content)
		? text.content
		: [new vscode.LanguageModelTextPart(String(text.content))];

	for (const part of contentParts) {
		if (part instanceof vscode.LanguageModelTextPart) {
			// Estimate tokens directly for plain text
			totalTokens += await estimateTextTokens(part.value);
		} else if (part instanceof vscode.LanguageModelToolCallPart) {
			// Tool call token calculation
			totalTokens += await estimateToolTokens(part);
		} else if (part instanceof vscode.LanguageModelToolResultPart) {
			// Tool result token calculation
			const resultText = typeof part.content === "string" ? part.content : JSON.stringify(part.content);
			totalTokens += await estimateTextTokens(resultText);
		} else if (part instanceof LanguageModelDataPart) {
			// Image data token calculation
			totalTokens += await estimateImageTokens(part);
		}
	}
	// Apply correction factor based on empirical observations
	totalTokens = Math.ceil(totalTokens * 1.0166);
	logger.debug(`Token count prepared: ${totalTokens}`);
	return totalTokens;
}

/** Roughly estimate tokens for VS Code chat messages (text only) */
export async function estimateMessagesTokens(msgs: readonly vscode.LanguageModelChatRequestMessage[]): Promise<number> {
	const estimateTokenCountFn = await loadEstimateTokenCount();
	let total = 0;
	for (const m of msgs) {
		// Handle case where content might be a string instead of an array (VS Code API change)
		const contentParts = Array.isArray(m.content) ? m.content : [new vscode.LanguageModelTextPart(String(m.content))];
		for (const part of contentParts) {
			if (part instanceof vscode.LanguageModelTextPart) {
				total += estimateTokenCountFn(part.value);
			}
		}
	}
	return total;
}

/** Token estimation for different content types */
export async function estimateTextTokens(text: string): Promise<number> {
	const estimateTokenCountFn = await loadEstimateTokenCount();
	return estimateTokenCountFn(text);
}

/** Rough token estimate for tool definitions by JSON size */
export async function estimateToolTokens(toolCall: vscode.LanguageModelToolCallPart): Promise<number> {
	const estimateTokenCountFn = await loadEstimateTokenCount();
	let total = 0;
	total += estimateTokenCountFn(toolCall.name);
	total += estimateTokenCountFn(JSON.stringify(toolCall.input));
	total += estimateTokenCountFn(JSON.stringify(toolCall.callId));
	return total;
}

/**
 * Estimate tokens for image data parts.
 * Uses a conservative heuristic: 100 base tokens + ~1 token per KB of data.
 */
export async function estimateImageTokens(dataPart: typeof LanguageModelDataPart.prototype): Promise<number> {
	logger.debug(`Estimating tokens for image data part with mimeType "${dataPart.mimeType}"`);

	const baseImageTokens = 100;
	const dataSize = dataPart.data.byteLength;
	const sizeBasedTokens = Math.ceil(dataSize / 1024);

	const totalTokens = baseImageTokens + sizeBasedTokens;
	logger.debug(
		`Image token estimate: ${totalTokens} (base: ${baseImageTokens}, size: ${sizeBasedTokens}, bytes: ${dataSize})`
	);

	return totalTokens;
}
