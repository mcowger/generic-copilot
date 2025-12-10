// large portions of this code are copied under Apache 2.0 license from https://github.com/fsiovn/ai-autocomplete/blob/main/extension.js

import * as vscode from "vscode";
import { FILENAME_SENSITIVE_KEYWORDS } from "./constants";
import { getExecutionDataForModel, getAutocompleteModels } from "../utils";
import { ModelItem, ProviderModelConfig } from "../types";
import { logger } from "../outputLogger";
import { ProviderClientFactory } from "../ai/providerClientFactory";
import { ProviderClient } from "../ai/providerClient";
import { log } from "console";

let isRequestPending = false;

// Constants

interface InlineCompletionContext {
	triggerKind: vscode.InlineCompletionTriggerKind;
}

async function registerInlineCompletionItemProvider(context: vscode.ExtensionContext): Promise<void> {
	try {
		const secrets: vscode.SecretStorage = context.secrets;
		const modelItem = getAutocompleteModels();
		if (!modelItem) {
			logger.warn("No autocomplete model configured");
			return;
		}
		const providerModelConfig: ProviderModelConfig = await getExecutionDataForModel(modelItem, secrets);
		logger.debug(`Registering inline completion item provider for model: ${modelItem.id}`);
		const client = ProviderClientFactory.getClient(providerModelConfig);
		const inlineCompletionItemDocumentSelector: vscode.DocumentSelector = { pattern: "**" };
		const inlineCompletionItemProvider: vscode.InlineCompletionItemProvider = {
			provideInlineCompletionItems: async (
				document: vscode.TextDocument,
				position: vscode.Position,
				_inlineCompletionContext: InlineCompletionContext,
				token: vscode.CancellationToken
			): Promise<vscode.InlineCompletionItem[] | null> => {
				return getInlineCompletionItems(client, modelItem, document, position, token, context);
			},
		};

		const inlineCompletionItemProviderDisposable = vscode.languages.registerInlineCompletionItemProvider(
			inlineCompletionItemDocumentSelector,
			inlineCompletionItemProvider
		);

		context.subscriptions.push(inlineCompletionItemProviderDisposable);
		logger.debug(`Registered inline completion item provider for model: ${modelItem.id}`);
	} catch (error) {
		logger.error("registerInlineCompletionItemProvider", error);
	}
}

export function deactivate(): void {}
export function dispose(): void {}
export { registerInlineCompletionItemProvider };

/**
 * Generates a list of inline completion items based on the current line prefix and the suggested insert text.
 * It filters out short suggestions and attempts to provide variations of the insert text, such as handling
 * prefix duplication, stripping leading characters when following punctuation, and offering newline-prefixed variations.
 *
 * Specific heuristics applied:
 * 1. **Filtering**: Discards suggestions that are empty, whitespace-only, or shorter than 9 characters (after trimming).
 * 2. **Prefix Deduplication**: Detects if the generated text starts with the same word/characters
 *    that end the current line (e.g., user typed "con" and model generated "console").
 *    It generates a version of the text with the overlapping prefix removed.
 * 3. **Separator Handling**: If the line ends with a dot (.) or space, it creates a variant
 *    that strips leading whitespace or dots from the generated text to ensure smooth continuity.
 * 4. **Newline Variants**: If the context isn't a simple continuation (e.g., not ending in a semicolon),
 *    it generates variations prefixed with varying numbers of newlines to support block completions.
 *
 * @param linePrefix - The text of the current line up to the cursor position.
 * @param insertText - The raw text suggested by the AI model.
 * @param position - The current cursor position.
 * @returns An array of VS Code InlineCompletionItems, or an empty array if filtered out.
 */
function generateCompletionItems(
	linePrefix: string,
	insertText: string,
	position: vscode.Position
): vscode.InlineCompletionItem[] {
	switch (insertText) {
		case null:
			logger.debug("No insert text provided: null");
			return [];
		case undefined:
			logger.debug("No insert text provided: undefined");
			return [];
		case "":
			logger.debug("No insert text provided: empty string");
			return [];
	}
	if (insertText.trim().length < 9) {
		logger.debug(`Insert text too short (${insertText.trim().length} chars): "${insertText.trim()}"`);
		return [];
	}

	const items: vscode.InlineCompletionItem[] = [];
	const range = new vscode.Range(position, position);
	const addItem = (text: string) => items.push(new vscode.InlineCompletionItem(text, range));

	try {
		const keywordPrefix = linePrefix.replace(/\./g, "").split(/\s+/).pop();

		if (keywordPrefix && (linePrefix.length < 9 || keywordPrefix.length > 1) && insertText.startsWith(keywordPrefix)) {
			addItem(insertText.slice(keywordPrefix.length));
		}
	} catch (error) {
		logger.error("Deduplicate prefix of keyword", error);
	}

	addItem(insertText);

	if (linePrefix.endsWith(".") || linePrefix.endsWith(" ")) {
		addItem(insertText.replace(/^[\s.]+/, ""));
	} else {
		if (!linePrefix.endsWith(";")) {
			addItem(` ${insertText}`);
		}

		for (let i = 1; i <= 4; i++) {
			addItem("\n".repeat(i) + insertText);
		}
	}

	return items;
}

export async function getInlineCompletionItems(
	client: ProviderClient,
	modelItem: ModelItem,
	document: vscode.TextDocument,
	position: vscode.Position,
	token: vscode.CancellationToken,
	context: vscode.ExtensionContext
): Promise<vscode.InlineCompletionItem[] | null> {
	try {
		// Using getText for multi lines
		// Using substring for single line for better performance
		const currentLine = document.lineAt(position.line);
		const linePrefix = currentLine.text.substring(0, position.character);

		if (linePrefix === "}") {
			return null;
		}

		if (String(linePrefix).startsWith("</") && String(linePrefix).endsWith(">")) {
			return null;
		}

		const filename = document.fileName;

		if (
			FILENAME_SENSITIVE_KEYWORDS.some((filenameSensitiveKeyword) =>
				filename.toLowerCase().includes(filenameSensitiveKeyword)
			)
		) {
			logger.debug(`Skip sensitive file ${filename}`);
			return null;
		}

		await new Promise((resolve) => setTimeout(resolve, 500));
		// Cancel on change
		if (token.isCancellationRequested) {
			logger.debug("Cancel on change");
			return null;
		}

		if (isRequestPending) {
			return null;
		}
		isRequestPending = true;

		try {
			const startPosition = position.with(Math.min(position.line - 10, 0), 0);
			const prefix = document.getText(new vscode.Range(startPosition, position));
			const endPosition = position.with(Math.max(position.line + 10, document.lineCount), 10);
			const suffix = document.getText(new vscode.Range(position, endPosition));
			// Context for the prompt is 10 lines before and after the cursor position

			//const prompt = generateCompletionPrompt(filename, document.languageId, prefix, suffix);

			logger.debug(
				`Firing inline completion request for model ${modelItem.id} at position ${position.line}:${position.character}`
			);
			let insertText = await client.getInlineCompleteResponse(modelItem, prefix, suffix, document.fileName, document.languageId, token);
			logger.debug(`Received inline completion response: ${insertText}`);
			// insertText = insertText?.trim()?.match(/^<fim_middle>([\s\S]*?)<\/fim_middle>$/s)?.[1] || "";

			const inlineCompletionItems = generateCompletionItems(linePrefix, insertText, position);
			if (!inlineCompletionItems || inlineCompletionItems.length === 0) {
				return null;
			}
			return inlineCompletionItems;
		} finally {
			isRequestPending = false;
		}
	} catch (error) {
		logger.error("Error in getInlineCompletionItems", error);
		return null;
	}
}
