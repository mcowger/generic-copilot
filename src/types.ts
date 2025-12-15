import { LanguageModelChatMessageRole, LanguageModelChatRequestMessage } from "vscode";
import { GenerateTextResult, ToolSet } from "ai";
/**
 * Parameters sent to the model API in the request body
 */
export interface ModelParameters {
	// Allow null so user can explicitly disable sending this parameter (fall back to provider default)
	temperature?: number | null;
	extra?: Record<string, unknown>;
}

/**
 * Internal properties used by the extension, not sent to the API
 */
export interface ModelProperties {
	owned_by?: string;
	context_length?: number;
	/**
	 * Optional family specification for the model. This allows users to specify
	 * the model family (e.g., "gpt-4", "claude-3", "gemini") to enable family-specific
	 * optimizations and behaviors in the Copilot extension. If not specified,
	 * defaults to "generic".
	 */
	family?: string;
}

/**
 * Model configuration interface using grouped structure
 * Properties and parameters are separated for clarity
 */
export interface ModelItem {
	id: string;
	slug: string;
	displayName?: string;
	provider: string;
	use_for_autocomplete?: boolean;
	retries?: number;

	model_properties: ModelProperties;
	model_parameters: ModelParameters;
}


export type VercelType = "openrouter" | "openai" | "openai-compatible" | "google" | "claude-code";


export interface ProviderConfig {
	/** Canonical provider id (lowercase, used as owned_by and for API key storage) */
	id: string;
	/** Display name for the provider */
	displayName?: string;
	/** Base URL for the provider's API endpoint */
	baseUrl?: string;
	/** Custom HTTP headers for all requests */
	headers?: Record<string, string>;
	/** Type of the provider for vercel handling */
	vercelType: VercelType;
	/** Provider-specific options (arbitrary JSON for provider-specific configuration) */
	providerSpecificOptions?: Record<string, unknown>;
}
export interface ProviderModelConfig {
	providerConfig: ProviderConfig;
	modelItem: ModelItem
	apiKey?: string;  // Optional for providers like claude-code that don't require API keys
}
