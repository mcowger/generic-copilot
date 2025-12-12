import * as vscode from "vscode";
import {
	CancellationToken,
	LanguageModelChatInformation,
	LanguageModelChatProvider,
	LanguageModelChatRequestMessage,
	ProvideLanguageModelChatResponseOptions,
	LanguageModelResponsePart,
	Progress,
} from "vscode";
import { logger } from "./outputLogger";

import { prepareLanguageModelChatInformation } from "./provideModel";
import { prepareTokenCount } from "./provideToken";
import { convertLmModeltoModelItem, getExecutionDataForModel} from "./utils";
import {ProviderClientFactory} from "./ai/providerClientFactory";


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

		await client.generateStreamingResponse(
			messages,
			options,
			modelItem,
			progress,
			this.statusBarItem,
		);
		logger.debug(`Completed language model chat response for model`);
	}
}

