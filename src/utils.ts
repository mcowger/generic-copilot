import * as vscode from "vscode";
import { randomUUID } from "crypto";
import type { ProviderConfig, ModelItem, ProviderModelConfig } from "./types";

import { LanguageModelChatInformation } from "vscode";
import { resolveModelWithProvider } from "./provideModel";

import { logger } from "./outputLogger";

// Model ID parsing helper
export interface ParsedModelId {
	baseId: string;
}

/**
 * Process headers and replace "RANDOM" values with UUIDv4.
 * @param headers The headers object from provider configuration
 * @returns Processed headers with RANDOM values replaced by UUIDs
 */
function processHeaders(headers?: Record<string, string>): Record<string, string> {
	if (!headers) {
		return {};
	}

	const processed: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		if (value === "RANDOM") {
			processed[key] = randomUUID();
		} else {
			processed[key] = value;
		}
	}
	return processed;
}

export function convertLmModeltoModelItem(model: LanguageModelChatInformation): ModelItem | undefined {
	const config = vscode.workspace.getConfiguration();
	const userModels = config.get<ModelItem[]>("generic-copilot.models", []);
	// Parse the model ID to handle a potential provider prefix and config ID suffix
	const modelId = model.id;
	let providerHint: string | undefined;
	let baseIdForMatch = modelId;
	const slashIdx = baseIdForMatch.indexOf("/");
	if (slashIdx !== -1) {
		providerHint = baseIdForMatch.slice(0, slashIdx).toLowerCase();
		baseIdForMatch = baseIdForMatch.slice(slashIdx + 1);
	}

	const getDeclaredProviderKey = (m: ModelItem): string | undefined => {
		const props = m.model_properties;
		return (m.provider ?? props.owned_by)?.toLowerCase();
	};
	const userModel: ModelItem | undefined = userModels.find((m) => {
		// Match the model ID
		if (m.id !== baseIdForMatch) {
			return false;
		}
		if (!providerHint) {
			return true;
		}
		const decl = getDeclaredProviderKey(m);
		return decl ? decl === providerHint : false;
	});

	const resolvedModel = userModel ? resolveModelWithProvider(userModel) : userModel;
	return resolvedModel;
}

async function ensureApiKey(provider: string, providerConfig: ProviderConfig | undefined, secrets: vscode.SecretStorage): Promise<string> {
	// Claude-code providers don't require API keys (authentication handled by claude executable)
	if (providerConfig?.vercelType === "claude-code") {
		logger.debug(`Skipping API key requirement for claude-code provider "${provider}"`);
		return "noApiKeyRequired";
	}

	// Provider-level keys only; no generic key fallback
	const normalizedProvider = provider.toLowerCase();
	const providerKey = `generic-copilot.apiKey.${normalizedProvider}`;
	let apiKey = await secrets.get(providerKey);
	if (!apiKey) {
		logger.warn(
			`API key for provider "${normalizedProvider}" not found in secret storage; prompting user to enter it.`
		);
		const entered = await vscode.window.showInputBox({
			title: `API key for ${normalizedProvider}`,
			prompt: `Enter API key for ${normalizedProvider}`,
			ignoreFocusOut: true,
			password: true,
		});
		if (entered && entered.trim()) {
			apiKey = entered.trim();
			await secrets.store(providerKey, apiKey);
		}
	}
	if (!apiKey) {
		throw new Error(`API key for provider "${normalizedProvider}" not found`);
	}
	return apiKey;
}

export function getModelItemFromString(modelId: string): ModelItem {
	const config = vscode.workspace.getConfiguration();
	const userModels = config.get<ModelItem[]>("generic-copilot.models", []);
	const matchingModel = userModels.find((m) => m.id === modelId) || null;
	if (!matchingModel) {
		logger.error(`Model not found from ID: ${modelId}`);
		throw new Error("Model not found from ID");
	}
	return matchingModel;
}

export async function getExecutionDataForModel(
	modelInfo: LanguageModelChatInformation | ModelItem,
	secrets: vscode.SecretStorage
): Promise<ProviderModelConfig> {
	let newModelItem: ModelItem | undefined;
	if ("provider" in modelInfo) {
		// We have a LanguageModelChatInformation
		newModelItem = modelInfo;
	} else {
		newModelItem = convertLmModeltoModelItem(modelInfo as LanguageModelChatInformation);
	}

	const modelItem = newModelItem;
	if (!modelItem) {
		logger.error(`Model "${modelInfo.id}" not found in configuration`);
		throw new Error(`Model "${modelInfo.id}" not found in configuration`);
	}

	// Get model properties
	const providerKey: string = modelItem.provider;

	// Look up the provider configuration to get baseUrl and vercelType
	const config = vscode.workspace.getConfiguration();
	const providers = config.get<ProviderConfig[]>("generic-copilot.providers", []);
	const provider = providers.find((p) => p.id === providerKey);

	if (!provider) {
		logger.error(`Provider "${providerKey}" not found in configuration`);
		throw new Error(`Provider "${providerKey}" not found in configuration`);
	}

	// Get API key for the model's provider (returns "noApiKeyRequired" for claude-code)
	const modelApiKey = await ensureApiKey(providerKey, provider, secrets);

	const providerWithProcessedHeaders: ProviderConfig = {
		...provider,
		headers: processHeaders(provider.headers),
	};

	return {
		providerConfig: providerWithProcessedHeaders,
		modelItem: modelItem,
		apiKey: modelApiKey,
	};
}

export function stripDoubleNewlines(input: string): string {
	return input.replace(/\n\n+/g, "\n");
}

export function getAutocompleteModels(): ModelItem|undefined {
	const config = vscode.workspace.getConfiguration();
	const userModels = config.get<ModelItem[]>("generic-copilot.models", []);
	const matchingModel = userModels.find((m) => m.use_for_autocomplete === true) || null;
	if (!matchingModel) {
		logger.error(`No autocomplete models found in configuration`);
		return undefined;
	}
	return matchingModel;
}
