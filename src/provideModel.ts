import * as vscode from "vscode";
import { CancellationToken, LanguageModelChatInformation } from "vscode";
import type { ModelItem, ProviderConfig } from "./types";
import { logger } from "./outputLogger";
const DEFAULT_CONTEXT_LENGTH = 128000;
const DEFAULT_MAX_TOKENS = 8000;

/**
 * Get the list of available language models contributed by this provider
 * @param options Options which specify the calling context of this function
 * @param token A cancellation token which signals if the user cancelled the request or not
 * @returns A promise that resolves to the list of available language models
 */
export async function prepareLanguageModelChatInformation(
	_options: { silent: boolean },
	_token: CancellationToken,
	_secrets: vscode.SecretStorage,
	_userAgent: string,
	context: vscode.ExtensionContext
): Promise<LanguageModelChatInformation[]> {
	// Check for user-configured models first
	const config = vscode.workspace.getConfiguration();
	const userModels = config.get<ModelItem[]>("generic-copilot.models", []);
	const providers = config.get<ProviderConfig[]>("generic-copilot.providers", []);
	let infos: LanguageModelChatInformation[];
	if (userModels.length > 0) {
		logger.debug(`Preparing language model chat information for ${userModels.length} user models`);
		// Return user-provided models directly
		infos = userModels.map((m) => {
			// Resolve model configuration with provider inheritance
			const resolved = resolveModelWithProvider(m);

			// Get model properties and parameters using helper functions
			const props = resolved.model_properties;
			//const params = getModelParameters(resolved);

			const contextLen = props.context_length ?? DEFAULT_CONTEXT_LENGTH;
			const maxOutput = DEFAULT_MAX_TOKENS;
			const maxInput = Math.max(1, contextLen - maxOutput);


			// Build canonical ID using provider key and raw model id
			const modelId =  `${props.owned_by}/${resolved.id}`;
			// Compose human-friendly display name as providerDisplayName/modelDisplayName[::configId]

			const providerMeta = providers.find((p) => p.id === props.owned_by);
			const providerDisplayName = providerMeta?.displayName || providerMeta?.id;
			const modelDisplayName = resolved.displayName || resolved.id;
			const modelFullName = `${providerDisplayName}/${modelDisplayName}`;

			return {
				id: modelId,
				name: modelFullName,
				detail: providerDisplayName,
				tooltip: modelId,
				family: props.family ?? "generic",
				version: "1.0.0",
				maxInputTokens: maxInput,
				maxOutputTokens: maxOutput,
				capabilities: {
					toolCalling: true,
				},
			} satisfies LanguageModelChatInformation;
		});
	} else {
		// No user-provided models
		logger.debug("No user-configured models found; returning empty model list");
		infos = [];
	}
	logger.debug(`Prepared ${infos.length} language model chat information entries`);
	return infos;
}

/**
 * Resolve model configuration with provider inheritance.
 * If a model references a provider, inherits baseUrl, owned_by, and defaults from the provider.
 * Model-specific values always override inherited values.
 * @param model The model configuration to resolve
 * @returns Resolved model configuration with inherited values
 */
export function resolveModelWithProvider(model: ModelItem): ModelItem {
	const providerRef = model.provider;

	// If no provider reference, return model as-is
	if (!providerRef) {
		return model;
	}

	// Get providers from configuration
	const config = vscode.workspace.getConfiguration();
	const providers = config.get<ProviderConfig[]>("generic-copilot.providers", []);

	// Find the referenced provider
	const provider = providers.find((p) => p.id === providerRef);
	if (!provider) {
		logger.error(`[Generic Compatible Model Provider] Provider '${providerRef}' not found in configuration`);
		return model;
	}

	// Create resolved model by merging provider defaults with model config
	const resolved: ModelItem = {
		id: model.id,
		displayName: model.displayName ?? model.id,
		provider: provider.id,
		model_properties: {
			...model.model_properties,
			owned_by: provider.id,
		},
		slug: model.slug,
		model_parameters: { ...model.model_parameters },
	};

	return resolved;
}