import * as vscode from "vscode";
import {
	CancellationToken,
	LanguageModelChatInformation,
	LanguageModelChatProvider,
	LanguageModelChatRequestMessage,
	LanguageModelThinkingPart,
	LanguageModelTextPart,
	ProvideLanguageModelChatResponseOptions,
	LanguageModelResponsePart2,
	Progress,
} from "vscode";
import OpenAI from 'openai';
import { ThinkTagParser } from "./thinkParser"
import { ExtendedDelta } from "./types"
import { ToolCallAccumulator, type ThinkSegment } from "./types"
import {
	convertRequestToOpenAI,
	getCoreDataForModel,
	stripDoubleNewlines
} from "./utils";

import { prepareLanguageModelChatInformation } from "./provideModel";
import { prepareTokenCount } from "./provideToken";
import { updateContextStatusBar } from "./statusBar";

const COMPLETIONS_ENDPOINT = "/chat/completions";

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
		private readonly statusBarItem?: vscode.StatusBarItem
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
		return prepareLanguageModelChatInformation(
			{ silent: options.silent ?? false },
			_token,
			this.secrets,
			this.userAgent
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
		try {
			const tokenCount = await prepareTokenCount(model, text, _token);
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
		progress: Progress<LanguageModelResponsePart2>,
		token: CancellationToken
	): Promise<void> {

		const { modelApiKey, modelItem, baseUrl, headers } = await getCoreDataForModel(model, this.secrets)

		// Apply custom temperature if configured
		// const customTemperature = getModelTemperature(model.id);
		// if (customTemperature !== undefined) {
		// 	openAIRequest.temperature = customTemperature;
		// }

		const openAIRequest: OpenAI.ChatCompletionCreateParamsStreaming = {
			...convertRequestToOpenAI(messages, options.tools as vscode.LanguageModelChatTool[]),
			model: modelItem.id
		};

		const openai = new OpenAI({
			baseURL: baseUrl,
			apiKey: modelApiKey,
			defaultHeaders: headers ? headers : { 'User-Agent': this.userAgent }
		});

		try {

			const stream = await openai.chat.completions.create(openAIRequest);
			// const thinkParser = new ThinkTagParser();
			// const toolCallStates = new Map<number, ToolCallAccumulator>();

			for await (const chunk of stream) {
				if (token.isCancellationRequested) {
					break;
				}
				const choice = chunk.choices[0];
				if (!choice?.delta) {
					continue;
				}
				const delta = choice.delta;
				const toolCallStates = new Map<number, ToolCallAccumulator>();

				reportThinkingParts(delta,progress)
				reportTextParts(delta, progress)

			}


		} catch (error) {
			console.error("[Generic Model Provider] Error during chat completion:", error);

			// Emit user-friendly error message
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			vscode.window.showInformationMessage(
				`Failed to get completion from Generic: ${errorMessage}. Please check your API key and connection.`
			);

			throw error;
		}
	}



}


function reportThinkingParts(delta: ExtendedDelta, progress: Progress<LanguageModelThinkingPart>): void {
	let contentToEmit: string = ""
	if (delta.reasoning_content) {
		contentToEmit = delta.reasoning_content
	} else if (delta.reasoning) {
		contentToEmit = delta.reasoning
	} else if (delta.reasoning_details && delta.reasoning_details[0] && delta.reasoning_details[0].text) {
		contentToEmit = delta.reasoning_details[0].text
	}
	if (contentToEmit.length > 0) {
		progress.report(
			new vscode.LanguageModelThinkingPart(
				contentToEmit
			))
	}
}

function reportTextParts(delta: ExtendedDelta, progress: Progress<LanguageModelTextPart>): void {
	let contentToEmit: string = ""
	if (delta.content) {
		contentToEmit = delta.content
	}
	if (contentToEmit.length > 0) {
		contentToEmit = stripDoubleNewlines(contentToEmit)
		progress.report(
			new vscode.LanguageModelTextPart(
				contentToEmit
			))
	}
}



function emitToolCallIfReady(index: number, state: ToolCallAccumulator, progress: vscode.Progress<LanguageModelResponsePart2>): void {
	if (state.emitted) {
		return;
	}
	if (!state.id || !state.name) {
		console.warn(
			`[Generic Model Provider] Tool call state incomplete (missing id or name) for index ${index} when finalizing:`,
			state
		);
		return;
	}

	let input: object = {};
	const rawArgs = state.argumentsBuffer.trim();
	if (rawArgs.length > 0) {
		try {
			input = JSON.parse(rawArgs);
		} catch (error) {
			console.error(
				`[Generic Model Provider] Failed to parse aggregated tool call arguments for ${state.name} (${state.id}) at index ${index}:`,
				rawArgs,
				error
			);
			return;
		}
	}

	const toolCallPart = new vscode.LanguageModelToolCallPart(state.id, state.name, input);
	progress.report(toolCallPart);
	state.emitted = true;
};

