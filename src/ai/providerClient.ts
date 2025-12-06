import { LanguageModelChatRequestMessage } from "vscode";
import { GenerateTextResult, ToolSet, generateText } from "ai";
import { ModelItem, ProviderConfig, VercelType } from "../types.js";
import { LM2VercelMessage } from "./conversion.js";
import { ModelMessage, LanguageModel, Provider } from "ai";

/**
 * Abstract base class for provider clients that interact with language model providers.
 * Handles configuration, provider instance management, and message conversion.
 */
export abstract class ProviderClient {
	/**
	 * The type of the provider (e.g., OpenAI, Vercel, etc.).
	 */
	public type: VercelType;

	/**
	 * Configuration for the provider client.
	 */
	protected config: ProviderConfig;

	/**
	 * The underlying provider instance used for API calls.
	 */
	protected providerInstance: Provider;

	/**
	 * Constructs a new ProviderClient.
	 * @param type The type of provider.
	 * @param config The provider configuration.
	 * @param providerInstance The provider instance.
	 */
	protected constructor(type: VercelType, config: ProviderConfig, providerInstance: Provider) {
		this.type = type;
		this.config = config;
		this.providerInstance = providerInstance;
	}

	/**
	 * Generates a response from the language model provider based on the given request and model configuration.
	 * @param request Array of chat request messages.
	 * @param config Model configuration item.
	 * @returns A promise resolving to the generated text result.
	 */
	async generateResponse(
		request: LanguageModelChatRequestMessage[],
		config: ModelItem
	): Promise<GenerateTextResult<ToolSet, never>> {
		const languageModel = this.getLanguageModel(config.slug);
		const messages = this.convertMessages(request);
		const result = await generateText({
			model: languageModel,
			messages: messages,
		});
		return result;

		//return {} as unknown as GenerateTextResult<ToolSet, never>;
	}
	/**
	 * Retrieves a language model by its slug identifier from the provider instance.
	 * @param slug The model slug identifier.
	 * @returns The language model instance.
	 */
	getLanguageModel(slug: string): LanguageModel {
		return this.providerInstance.languageModel(slug);
	}

	/**
	 * Converts VS Code chat request messages to the provider's model message format.
	 * @param messages Array of VS Code chat request messages.
	 * @returns Array of converted model messages.
	 */
	convertMessages(messages: readonly LanguageModelChatRequestMessage[]): ModelMessage[] {
		return LM2VercelMessage(messages);
	}
}
