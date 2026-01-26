import { createOpenAI, OpenAIProviderSettings, OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import { ProviderClient, RequestContext } from "../providerClient";
import { ProviderConfig, ModelItem } from "../../types";
import {
	Progress,
	LanguageModelChatRequestMessage,
	ProvideLanguageModelChatResponseOptions,
	LanguageModelResponsePart2 as LanguageModelResponsePart,
} from "vscode";
import * as vscode from "vscode";
import { JSONValue } from "ai";
import { CacheRegistry } from "../utils/metadataCache";
import { logger } from "../../outputLogger";

// OpenAI-specific knob extraction logic
const VALID_REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;
const VALID_TEXT_VERBOSITIES = ["low", "medium", "high"] as const;

type ReasoningEffort = (typeof VALID_REASONING_EFFORTS)[number];
type TextVerbosity = (typeof VALID_TEXT_VERBOSITIES)[number];

interface OpenAIKnobs {
	reasoningEffort?: ReasoningEffort;
	textVerbosity?: TextVerbosity;
}

type WarnFn = (message: string) => void;

function isNonNullObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isOneOf<const T extends readonly string[]>(values: T, value: string): value is T[number] {
	return (values as readonly string[]).includes(value);
}

/**
 * Extracts and validates OpenAI-specific knobs from model_parameters.extra.
 * @param extra - untrusted extra object from model parameters
 * @param warnFn - optional callback for logging warnings on invalid values
 */
function extractOpenAIKnobs(
	extra: Record<string, unknown> | undefined,
	warnFn?: WarnFn
): OpenAIKnobs {
	const result: OpenAIKnobs = {};

	if (!extra || typeof extra !== "object") {
		return result;
	}

	const reasoning = extra.reasoning;
	if (isNonNullObject(reasoning)) {
		const effort = reasoning.effort;
		if (typeof effort === "string") {
			if (isOneOf(VALID_REASONING_EFFORTS, effort)) {
				result.reasoningEffort = effort;
			} else {
				warnFn?.(`invalid reasoning.effort value; expected one of: ${VALID_REASONING_EFFORTS.join(", ")}`);
			}
		} else if (effort !== undefined) {
			warnFn?.(`reasoning.effort must be a string; got ${typeof effort}`);
		}
	}

	const text = extra.text;
	if (isNonNullObject(text)) {
		const verbosity = text.verbosity;
		if (typeof verbosity === "string") {
			if (isOneOf(VALID_TEXT_VERBOSITIES, verbosity)) {
				result.textVerbosity = verbosity;
			} else {
				warnFn?.(`invalid text.verbosity value; expected one of: ${VALID_TEXT_VERBOSITIES.join(", ")}`);
			}
		} else if (verbosity !== undefined) {
			warnFn?.(`text.verbosity must be a string; got ${typeof verbosity}`);
		}
	}

	return result;
}

export class OpenAIProviderClient extends ProviderClient {
	constructor(config: ProviderConfig, apiKey: string) {
		super(
			"openai",
			config,
			createOpenAI({
				apiKey: apiKey,
				...(config.baseUrl && { baseURL: config.baseUrl }),
				...(config.headers && { headers: config.headers }),
			} as OpenAIProviderSettings)
		);
	}

	/**
	 * Provides OpenAI-specific provider options for streaming responses.
	 * Includes cached previousResponseId for conversation continuity.
	 */
	protected override getProviderOptions(ctx: RequestContext): Record<string, Record<string, JSONValue>> | undefined {
		// Check for cached previousResponseId from the last response
		const cache = CacheRegistry.getCache("openaiResponseId");
		const previousResponseId = cache.get("lastResponseId") as string | undefined;

		// Delete the cached value after retrieval (single use)
		if (previousResponseId) {
			logger.debug(`Using cached previousResponseId: ${previousResponseId}`);
			cache.delete("lastResponseId");
		}

		const knobs = extractOpenAIKnobs(
			ctx.modelConfig.model_parameters?.extra,
			(msg) => logger.warn(msg)
		);

		// Provide OpenAI-specific provider options
		return {
			openai: {
				reasoningSummary: "detailed",
				parallelToolCalls: true,
				promptCacheKey: "generic-copilot-cache-v1",
				promptCacheRetention: "24h",
				...(previousResponseId && { previousResponseId }),
				...(knobs.reasoningEffort && { reasoningEffort: knobs.reasoningEffort }),
				...(knobs.textVerbosity && { textVerbosity: knobs.textVerbosity }),
			} satisfies OpenAIResponsesProviderOptions,
		};
	}

	/**
	 * Processes response-level metadata from OpenAI, specifically capturing the responseId
	 * for use in subsequent requests to enable conversation continuity.
	 * @param result The streaming result object from streamText
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected override processResponseMetadata(result: any): void {
		// OpenAI returns responseId in providerMetadata
		const providerMetadata = result.providerMetadata;
		if (providerMetadata) {
			// providerMetadata is a Promise, so we handle it asynchronously
			Promise.resolve(providerMetadata).then((metadata) => {
				const responseId = metadata?.openai?.responseId;
				if (responseId) {
					logger.debug(`Caching OpenAI responseId: ${responseId}`);
					const cache = CacheRegistry.getCache("openaiResponseId");
					cache.set("lastResponseId", responseId);
				}
			}).catch((err) => {
				logger.warn(`Failed to retrieve OpenAI responseId: ${err instanceof Error ? err.message : String(err)}`);
			});
		}
	}
}
