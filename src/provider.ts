import * as vscode from "vscode";
import {
	CancellationToken,
	LanguageModelChatInformation,
	LanguageModelChatProvider,
	LanguageModelChatRequestMessage,
	ProvideLanguageModelChatResponseOptions,
	LanguageModelResponsePart2 as LanguageModelResponsePart,
	LanguageModelThinkingPart,
	Progress,
} from "vscode";
import { logger } from "./outputLogger";

import { prepareLanguageModelChatInformation } from "./provideModel";
import { prepareTokenCount } from "./provideToken";
import { convertLmModeltoModelItem, getExecutionDataForModel} from "./utils";
import { ProviderClientFactory } from "./ai/providerClientFactory";
import { ProviderClient } from "./ai/providerClient";


export class ChatModelProvider implements LanguageModelChatProvider {

	/**
	 * Create a provider using the given secret storage for the API key.
	 * @param secrets VS Code secret storage.
	 * @param userAgent User agent string for API requests.
	 * @param statusBarItem Status bar item for displaying token count.
	 */
	constructor(
		private readonly secrets: vscode.SecretStorage,
		private readonly userAgent: string,
		private readonly statusBarItem: vscode.StatusBarItem,
		private readonly context: vscode.ExtensionContext
	) { }

	/**
	 * Get the list of available language models contributed by this provider
	 * @param options Options which specify the calling context of this function
	 * @param token A cancellation token which signals if the user cancelled the request or not
	 * @returns A promise that resolves to the list of available language models
	 */
	async provideLanguageModelChatInformation(
		options: { silent: boolean },
		_token: CancellationToken
	): Promise<LanguageModelChatInformation[]> {
		logger.debug(`Providing language model chat information with options: ${JSON.stringify(options)}`);
		return prepareLanguageModelChatInformation(
			{ silent: options.silent ?? false },
			_token,
			this.secrets,
			this.userAgent,
			this.context
		);
	}

	/**
	 * Returns the number of tokens for a given text using the model specific tokenizer logic
	 * @param model The language model to use
	 * @param text The text to count tokens for
	 * @param token A cancellation token for the request
	 * @returns A promise that resolves to the number of tokens
	 */
	async provideTokenCount(
		model: LanguageModelChatInformation,
		text: LanguageModelChatRequestMessage,
		_token: CancellationToken
	): Promise<number> {
		logger.debug(`Providing token count for model "${model.id}"`);
		try {
			const tokenCount = await prepareTokenCount(model, text, _token);
			logger.debug(`Token count for model "${model.id}": ${tokenCount}`);
			return tokenCount;
		} catch (error) {
			throw error;
		}
	}

	/**
	 * Returns the response for a chat request, passing the results to the progress callback.
	 * The {@linkcode LanguageModelChatProvider} must emit the response parts to the progress callback as they are received from the language model.
	 * @param model The language model to use
	 * @param messages The messages to include in the request
	 * @param options Options for the request
	 * @param progress The progress to emit the streamed response chunks to
	 * @param token A cancellation token for the request
	 * @returns A promise that resolves when the response is complete. Results are actually passed to the progress callback.
	 */
	async provideLanguageModelChatResponse(
		model: LanguageModelChatInformation,
		messages: LanguageModelChatRequestMessage[],
		options: ProvideLanguageModelChatResponseOptions,
		progress: Progress<LanguageModelResponsePart>,
		token: CancellationToken
	): Promise<void> {

		const modelItem = convertLmModeltoModelItem(model);
		if (!modelItem) {
			logger.error(`Model "${model.id}" not found in configuration`);
			throw new Error(`Model "${model.id}" not found in configuration`);
		}
		const executionData = await getExecutionDataForModel(model, this.secrets);
		const client = ProviderClientFactory.getClient(executionData);

		logger.debug(`Providing language model chat response for model "${model.id}" with provider "${modelItem.provider}"`);

		// Retry logic for handling transient errors
		let lastError: any;
		const maxRetries = modelItem.retries ?? 3;

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				// Call the individual components sequentially
				// Step 1: Set up request context
				const ctx = await client.setupRequestContext(
					messages,
					options,
					modelItem,
				);

				// Step 2: Execute streamText and process streaming parts
				const result = await client.executeStreamText(
					ctx,
					progress,
				);

				// Step 3: Finalize response (usage, metrics, UI updates)
				await client.finalizeResponse(
					ctx,
					result,
					modelItem,
					this.statusBarItem,
				);
				return;
			} catch (error) {
				progress.report(
					new LanguageModelThinkingPart("\n\n[Error occurred during streaming response. Retrying...]\n", "error")
				);
				lastError = error;
				logger.warn(
					`Chat request failed (attempt ${attempt + 1}): ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}

		logger.error("Chat request failed after retries:", (lastError as Error).message);
		vscode.window.showErrorMessage(
			`Chat request failed after multiple attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`
		);
	}
}

