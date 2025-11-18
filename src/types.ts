import OpenAI from 'openai';
/**
 * Parameters sent to the model API in the request body
 */
export interface ModelParameters {
	// Allow null so user can explicitly disable sending this parameter (fall back to provider default)
	temperature?: number | null;

	/**
	 * Extra configuration parameters sent to the API.
	 * This allows users to add any additional parameters they might need
	 * without modifying the core interface. Unknown keys are only allowed here.
	 */
	extra?: Record<string, unknown>;
}

/**
 * Internal properties used by the extension, not sent to the API
 */
export interface ModelProperties {
	owned_by: string;
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
	displayName?: string;
	/**
	 * Model provider. Can be overridden by provider reference.
	 * If 'provider' field is specified, this value is inherited from the provider.
	 */
	provider?: string;
	/**
	 * Configuration variant identifier for models that share the same base id.
	 * This is a configuration-level attribute and not a model property.
	 */
	configId?: string;
	model_properties: ModelProperties;
	model_parameters: ModelParameters;
}



/**
 * Response envelope for the router models listing.
 */
export interface ModelsResponse {
	object: string;
	data: ModelItem[];
}

/**
 * Buffer used to accumulate streamed tool call parts until arguments are valid JSON.
 */
export interface ToolCallBuffer {
	id?: string;
	name?: string;
	args: string;
}

/**
 * Provider configuration that can be inherited by models
 */
export interface ProviderConfig {
	/** Canonical provider key (lowercase, used as owned_by and for API key storage) */
	key: string;
	/** Display name for the provider */
	displayName?: string;
	/** Base URL for the provider's API endpoint */
	baseUrl: string;
	/** Custom HTTP headers for all requests */
	headers?: Record<string, string>;

}

export interface ExtendedDelta extends OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta {
	reasoning_content?: string,
	reasoning?: string,
	reasoning_details?: [
		{
			type: string,
			text: string,
			id: string,
			format: string,
			index: number
		},
	],
}

export interface ToolCallAccumulator {
	id?: string;
	name?: string;
	argumentsBuffer: string;
	emitted: boolean;
}

export type ThinkSegment =
	| { kind: "text"; value: string }
	| { kind: "thinking"; value: string };

export type ModelDetails = {
	modelApiKey: string | undefined
	modelItem: ModelItem
	baseUrl: string
	headers?: Record<string, string>
}
