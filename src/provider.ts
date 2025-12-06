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
import { ToolCallAccumulator } from "./types"
import {
	convertRequestToOpenAI,
	getModelItemForModel,
	stripDoubleNewlines
} from "./utils";

import { prepareLanguageModelChatInformation } from "./provideModel";
import { prepareTokenCount } from "./provideToken";
import { updateContextStatusBar } from "./statusBar";

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

		const { modelApiKey, modelItem, baseUrl, headers, vercelType } = await getModelItemForModel(model, this.secrets)
		updateContextStatusBar(messages,model,this.statusBarItem)

		const openAIRequest: ExtendedOpenAIRequest = {
			...convertRequestToOpenAI(messages, options.tools as vscode.LanguageModelChatTool[]),
			model: modelItem.id,
			temperature: modelItem.model_parameters.temperature
		};

		if (modelItem.model_parameters.extra && typeof modelItem.model_parameters.extra === "object") {
			// Add all extra parameters directly to the request body
			for (const [key, value] of Object.entries(modelItem.model_parameters.extra)) {
				if (value !== undefined) {
					openAIRequest[key] = value;
				}
			}
		}



		const openai = new OpenAI({
			baseURL: baseUrl,
			apiKey: modelApiKey,
			defaultHeaders: headers ? headers : { 'User-Agent': this.userAgent }
		});

		try {

			const stream = await openai.chat.completions.create(openAIRequest);

			const toolCallStates = new Map<number, ToolCallAccumulator>();
			for await (const chunk of stream) {
				if (token.isCancellationRequested) {
					break;
				}
				const choice = chunk.choices[0];
				if (!choice?.delta) {
					continue;
				}
				const delta = choice.delta;


				reportThinkingParts(delta,progress)
				reportTextParts(delta, progress)
				assembleToolCalls(delta,toolCallStates)
				const { finish_reason: finishReason } = choice as {
					finish_reason?: string;
				};
				if (finishReason === "tool_calls") {
					for (const [index, state] of toolCallStates.entries()) {
						emitToolCallIfReady(index, state, progress);
					}
				}

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

function assembleToolCalls(delta: ExtendedDelta, toolCallStates: Map<number, ToolCallAccumulator>) {
	const toolCalls = (delta as { tool_calls?: unknown }).tool_calls;
	if (Array.isArray(toolCalls) && toolCalls.length > 0) {
		for (const toolCall of toolCalls) {
			if (!toolCall || typeof toolCall !== "object") {
				console.warn("[Generic Model Provider] Skipping malformed tool call payload:", toolCall);
				continue;
			}

			const toolCallRecord = toolCall as {
				id?: string | null;
				index?: number;
				type?: string;
				function?: { name?: string; arguments?: string };
			};

			const index = Number.isInteger(toolCallRecord.index) ? toolCallRecord.index! : 0;
			const state = toolCallStates.get(index) ?? { argumentsBuffer: "", emitted: false };
			if (!toolCallStates.has(index)) {
				toolCallStates.set(index, state);
			}

			if (typeof toolCallRecord.id === "string" && toolCallRecord.id.length > 0) {
				state.id = toolCallRecord.id;
			}

			const functionRecord = toolCallRecord.function;
			if (functionRecord?.name) {
				state.name = functionRecord.name;
			}
			if (typeof functionRecord?.arguments === "string" && functionRecord.arguments.length > 0) {
				state.argumentsBuffer += functionRecord.arguments;
			}
		}
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

