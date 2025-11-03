/**
 * OpenAI function-call entry emitted by assistant messages.
 */
export interface OpenAIToolCall {
	id: string;
	type: "function";
	function: { name: string; arguments: string };
}

/**
 * OpenAI function tool definition used to advertise tools.
 */
export interface OpenAIFunctionToolDef {
	type: "function";
	function: { name: string; description?: string; parameters?: object };
}

/**
 * OpenAI-style chat message used for router requests.
 */
export interface OpenAIChatMessage {
	role: OpenAIChatRole;
	content?: string | ChatMessageContent[];
	name?: string;
	tool_calls?: OpenAIToolCall[];
	tool_call_id?: string;
}

/**
 * Chat message content interface (supports multimodal)
 */
export interface ChatMessageContent {
	type: "text" | "image_url";
	text?: string;
	image_url?: {
		url: string;
	};
}

/**
 * A single underlying provider (e.g., together, groq) for a model.
 */
export interface Provider {
	provider: string;
	status: string;
	supports_tools?: boolean;
	supports_structured_output?: boolean;
	context_length?: number;
}

export interface Architecture {
	input_modalities?: string[];
	output_modalities?: string[];
}

/**
 * Parameters sent to the model API in the request body
 */
export interface ModelParameters {
	// Allow null so user can explicitly disable sending this parameter (fall back to provider default)
	temperature?: number | null;
	// Allow null so user can explicitly disable sending this parameter (fall back to provider default)
	top_p?: number | null;
	max_tokens?: number;
	// OpenAI new standard parameter
	max_completion_tokens?: number;
	reasoning_effort?: string;
	enable_thinking?: boolean;
	thinking_budget?: number;
	// New thinking configuration for Zai provider
	thinking?: ThinkingConfig;
	top_k?: number;
	min_p?: number;
	frequency_penalty?: number;
	presence_penalty?: number;
	repetition_penalty?: number;
	reasoning?: ReasoningConfig;
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
	id: string;
	object?: string;
	created?: number;
	/**
	 * Optional human-friendly display name for this model configuration.
	 * When provided, the UI should prefer this over the raw model id.
	 */
	displayName?: string;
	/**
	 * Model provider. Can be overridden by provider reference.
	 * If 'provider' field is specified, this value is inherited from the provider.
	 */
	owned_by: string;
	/**
	 * Reference to a provider key for inheriting configuration.
	 * When specified, the model inherits baseUrl, owned_by, and defaults from the provider.
	 */
	provider?: string;
	configId?: string;
	baseUrl?: string;
	providers?: Provider[];
	architecture?: Architecture;
	context_length?: number;
	vision?: boolean;
	/**
	 * Optional family specification for the model. This allows users to specify
	 * the model family (e.g., "gpt-4", "claude-3", "gemini") to enable family-specific
	 * optimizations and behaviors in the Copilot extension. If not specified,
	 * defaults to "generic".
	 */
	family?: string;
	headers?: Record<string, string>;
}

/**
 * Model configuration interface using grouped structure
 * Properties and parameters are separated for clarity
 */
export interface ModelItem {
	// Grouped structure - required
	model_properties: ModelProperties;
	model_parameters: ModelParameters;
}

/**
 * OpenRouter reasoning configuration
 */
export interface ReasoningConfig {
	effort?: string;
	exclude?: boolean;
	max_tokens?: number;
	enabled?: boolean;
}

export interface ExtraModelInfo {
	id: string;
	pipeline_tag?: string;
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

/** OpenAI-style chat roles. */
export type OpenAIChatRole = "system" | "user" | "assistant" | "tool";

export interface ReasoningDetailCommon {
	id: string | null;
	format: string; // e.g., "anthropic-claude-v1", "openai-responses-v1"
	index?: number;
}

export interface ReasoningSummaryDetail extends ReasoningDetailCommon {
	type: "reasoning.summary";
	summary: string;
}

export interface ReasoningEncryptedDetail extends ReasoningDetailCommon {
	type: "reasoning.encrypted";
	data: string; // Base64 encoded
}

export interface ReasoningTextDetail extends ReasoningDetailCommon {
	type: "reasoning.text";
	text: string;
	signature?: string | null;
}

export type ReasoningDetail = ReasoningSummaryDetail | ReasoningEncryptedDetail | ReasoningTextDetail;

/**
 * Thinking configuration for Zai provider
 */
export interface ThinkingConfig {
	type?: string;
}

/**
 * Retry configuration for rate limiting
 */
export interface RetryConfig {
	enabled?: boolean;
	max_attempts?: number;
	interval_ms?: number;
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
	/** Default parameters that models can inherit - grouped structure only */
	defaults?: {
		model_properties?: Partial<ModelProperties>;
		model_parameters?: Partial<ModelParameters>;
	};
}
