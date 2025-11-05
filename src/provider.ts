import * as vscode from "vscode";
import {
	CancellationToken,
	LanguageModelChatInformation,
	LanguageModelChatProvider,
	LanguageModelChatRequestMessage,
	ProvideLanguageModelChatResponseOptions,
	LanguageModelResponsePart2,
	Progress,
} from "vscode";

import type { ModelItem, ReasoningDetail, ReasoningSummaryDetail, ReasoningTextDetail, ReasoningConfig, ProviderConfig } from "./types";

import {
	convertTools,
	convertMessages,
	tryParseJSONObject,
	validateRequest,
	parseModelId,
	createRetryConfig,
	executeWithRetry,
	resolveModelWithProvider,
	getModelParameters,
	getModelProperties,
	processHeaders,
} from "./utils";

import { prepareLanguageModelChatInformation } from "./provideModel";
import { prepareTokenCount } from "./provideToken";

const MAX_TOOLS_PER_REQUEST = 128;

export class ChatModelProvider implements LanguageModelChatProvider {
	/** Buffer for assembling streamed tool calls by index. */
	private _toolCallBuffers: Map<number, { id?: string; name?: string; args: string }> = new Map<
		number,
		{ id?: string; name?: string; args: string }
	>();

	/** Indices for which a tool call has been fully emitted. */
	private _completedToolCallIndices = new Set<number>();

	/** Track if we emitted any assistant text before seeing tool calls (SSE-like begin-tool-calls hint). */
	private _hasEmittedAssistantText = false;

	/** Track if we emitted the begin-tool-calls whitespace flush. */
	private _emittedBeginToolCallsHint = false;

	private _textToolActive:
		| undefined
		| {
				name?: string;
				index?: number;
				argBuffer: string;
				emitted?: boolean;
		  };
	private _emittedTextToolCallKeys = new Set<string>();
	private _emittedTextToolCallIds = new Set<string>();

	// XML think block parsing state
	private _xmlThinkActive = false;
	private _xmlThinkDetectionAttempted = false;

	// Thinking content state management
	private _currentThinkingId: string | null = null;

	/** Track last request completion time for delay calculation. */
	private _lastRequestTime: number | null = null;

	/**
	 * Create a provider using the given secret storage for the API key.
	 * @param secrets VS Code secret storage.
	 */
	constructor(
		private readonly secrets: vscode.SecretStorage,
		private readonly userAgent: string
	) {}

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
		text: string | LanguageModelChatRequestMessage,
		_token: CancellationToken
	): Promise<number> {
		return prepareTokenCount(model, text, _token);
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
		messages: readonly LanguageModelChatRequestMessage[],
		options: ProvideLanguageModelChatResponseOptions,
		progress: Progress<LanguageModelResponsePart2>,
		token: CancellationToken
	): Promise<void> {
		this._toolCallBuffers.clear();
		this._completedToolCallIndices.clear();
		this._hasEmittedAssistantText = false;
		this._emittedBeginToolCallsHint = false;
		this._textToolActive = undefined;
		this._emittedTextToolCallKeys.clear();
		this._emittedTextToolCallIds.clear();
		this._xmlThinkActive = false;
		this._xmlThinkDetectionAttempted = false;
		// Initialize thinking state for this request
		this._currentThinkingId = null;

		// Apply delay between consecutive requests
		const config = vscode.workspace.getConfiguration();
		const delayMs = config.get<number>("generic-copilot.delay", 0);

		if (delayMs > 0 && this._lastRequestTime !== null) {
			const elapsed = Date.now() - this._lastRequestTime;
			if (elapsed < delayMs) {
				const remainingDelay = delayMs - elapsed;
				await new Promise<void>((resolve) => {
					const timeout = setTimeout(() => {
						clearTimeout(timeout);
						resolve();
					}, remainingDelay);
				});
			}
		}

		let requestBody: Record<string, unknown> | undefined;
		const trackingProgress: Progress<LanguageModelResponsePart2> = {
			report: (part) => {
				try {
					progress.report(part);
				} catch (e) {
					console.error("[Generic Compatible Model Provider] Progress.report failed", {
						modelId: model.id,
						error: e instanceof Error ? { name: e.name, message: e.message } : String(e),
					});
				}
			},
		};
		try {
			if (options.tools && options.tools.length > MAX_TOOLS_PER_REQUEST) {
				throw new Error(`Cannot have more than ${MAX_TOOLS_PER_REQUEST} tools per request.`);
			}

			const openaiMessages = convertMessages(messages);
			validateRequest(messages);

			// get model config from user settings
			const config = vscode.workspace.getConfiguration();
			const userModels = config.get<ModelItem[]>("generic-copilot.models", []);

			// Parse the model ID to handle a potential provider prefix and config ID suffix
			const parsedModelId = parseModelId(model.id);
			let providerHint: string | undefined;
			let baseIdForMatch = parsedModelId.baseId;
			const slashIdx = baseIdForMatch.indexOf("/");
			if (slashIdx !== -1) {
				providerHint = baseIdForMatch.slice(0, slashIdx).toLowerCase();
				baseIdForMatch = baseIdForMatch.slice(slashIdx + 1);
			}

			const getDeclaredProviderKey = (m: ModelItem): string | undefined => {
				const props = getModelProperties(m);
				return (m.provider ?? props.owned_by)?.toLowerCase();
			};

			// Find the matching user model configuration
			// Prefer match: same model id AND same configId AND (if present) same provider key
			let um: ModelItem | undefined = userModels.find((m) => {
				if (m.id !== baseIdForMatch) {
					return false;
				}
				const configMatch =
					(parsedModelId.configId && m.configId === parsedModelId.configId) || (!parsedModelId.configId && !m.configId);
				if (!configMatch) {
					return false;
				}
				if (!providerHint) {
					return true;
				}
				const decl = getDeclaredProviderKey(m);
				return decl ? decl === providerHint : false;
			});

			// If not found, relax provider constraint (match by id and configId only)
			if (!um) {
				um = userModels.find(
					(m) => m.id === baseIdForMatch &&
						((parsedModelId.configId && m.configId === parsedModelId.configId) ||
							(!parsedModelId.configId && !m.configId))
				);
			}

			// Resolve model configuration with provider inheritance
			const resolvedModel = um ? resolveModelWithProvider(um) : um;

			// Get model properties using helper function
			const modelProps = resolvedModel ? getModelProperties(resolvedModel) : undefined;

			// Get API key for the model's provider (provider-level keys only)
			const providerKey = modelProps?.owned_by;
			const modelApiKey = await this.ensureApiKey(providerKey);
			if (!modelApiKey) {
				throw new Error(
					providerKey && providerKey.trim()
						? `API key for provider "${providerKey}" not found`
						: "No provider specified for model; please set 'owned_by' and configure its API key"
				);
			}

			// requestBody
			requestBody = {
				model: baseIdForMatch,
				messages: openaiMessages,
				stream: true,
				stream_options: { include_usage: true },
			};
			requestBody = this.prepareRequestBody(requestBody, resolvedModel, options);

			// debug log
			// console.log("[Generic Compatible Model Provider] RequestBody:", JSON.stringify(requestBody));

			// send chat request
			// Resolve base URL from the provider configuration (not the model)
			const providers = config.get<ProviderConfig[]>("generic-copilot.providers", []);
			const providerConfig = providers.find(
				(p) => p.key.toLowerCase() === (providerKey ?? "").toLowerCase()
			);
			const BASE_URL = providerConfig?.baseUrl || "";
			if (!BASE_URL || !BASE_URL.startsWith("http")) {
				throw new Error(
					providerKey && providerKey.trim()
						? `Invalid or missing base URL for provider "${providerKey}". Check generic-copilot.providers settings.`
						: `Invalid base URL configuration.`
				);
			}

			// get retry config
			const retryConfig = createRetryConfig();


			// Process custom headers from provider config
			const customHeaders = processHeaders(providerConfig?.headers);

			// send chat request with retry
			const response = await executeWithRetry(
				async () => {
					// Build headers using the WHATWG Headers API to ensure proper override behavior
					const headers = new Headers();
					headers.set("Authorization", `Bearer ${modelApiKey}`);
					headers.set("Content-Type", "application/json");
					headers.set("User-Agent", this.userAgent);
					for (const [k, v] of Object.entries(customHeaders)) {
						try { headers.set(k, v); } catch { /* ignore invalid header names */ }
					}

					// Optional debug: allow users to log final headers
					try {
						const cfg = vscode.workspace.getConfiguration();
						const debugHeaders = cfg.get<boolean>("generic-copilot.debug.logHeaders", false);
						if (debugHeaders) {
							const snapshot: Record<string, string> = {};
							headers.forEach((v, k) => { snapshot[k] = v; });
							console.log("[Generic Compatible Model Provider] Request headers:", snapshot);
						}
					} catch { /* ignore */ }

					const res = await fetch(`${BASE_URL}/chat/completions`, {
						method: "POST",
						headers,
						body: JSON.stringify(requestBody),
					});

					if (!res.ok) {
						const errorText = await res.text();
						console.error("[Generic Compatible Model Provider] Generic Compatible API error response", errorText);
						throw new Error(
							`Generic Compatible API error: [${res.status}] ${res.statusText}${errorText ? `\n${errorText}` : ""}`
						);
					}

					return res;
				},
				retryConfig,
				token
			);

			if (!response.body) {
				throw new Error("No response body from Generic Compatible API");
			}
			await this.processStreamingResponse(response.body, trackingProgress, token);
		} catch (err) {
			console.error("[Generic Compatible Model Provider] Chat request failed", {
				modelId: model.id,
				messageCount: messages.length,
				error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
			});
			throw err;
		} finally {
			// Update last request time after successful completion
			this._lastRequestTime = Date.now();
		}
	}

	private prepareRequestBody(
		rb: Record<string, unknown>,
		um: ModelItem | undefined,
		options: ProvideLanguageModelChatResponseOptions
	) {
		// If no model config, apply defaults from options
		if (!um) {
			const oTemperature = options.modelOptions?.temperature ?? 0;
			rb.temperature = oTemperature;
			const oTopP = options.modelOptions?.top_p ?? 1;
			rb.top_p = oTopP;
			return rb;
		}

		// Get model parameters using helper function (supports both flat and grouped structures)
		const params = getModelParameters(um);

		// temperature
		const oTemperature = options.modelOptions?.temperature ?? 0;
		const temperature = params.temperature ?? oTemperature;
		rb.temperature = temperature;

		// top_p
		const oTopP = options.modelOptions?.top_p ?? 0.9;
		const topP = params.top_p ?? oTopP;
		rb.top_p = topP;

		if (params.top_p === null) {
			delete rb.top_p;
		}

		// If user model config explicitly sets sampling params to null, remove them so provider defaults apply
		if (params.temperature === null) {
			delete rb.temperature;
		}

		// max_tokens
		if (params.max_tokens !== undefined) {
			rb.max_tokens = params.max_tokens;
		}

		// max_completion_tokens (OpenAI new standard parameter)
		if (params.max_completion_tokens !== undefined) {
			rb.max_completion_tokens = params.max_completion_tokens;
		}

		// OpenAI reasoning configuration
		if (params.reasoning_effort !== undefined) {
			rb.reasoning_effort = params.reasoning_effort;
		}

		if (params.thinking_budget !== undefined) {
			rb.thinking_budget = params.thinking_budget;
		}


		// thinking (Zai provider)
		if (params.thinking?.type !== undefined) {
			rb.thinking = {
				type: params.thinking.type,
			};
		}

		// OpenRouter reasoning configuration
		if (params.reasoning !== undefined) {
			const reasoningConfig: ReasoningConfig = params.reasoning as ReasoningConfig;
			if (reasoningConfig.enabled !== false) {
				const reasoningObj: Record<string, unknown> = {};
				const effort = reasoningConfig.effort;
				const maxTokensReasoning = reasoningConfig.max_tokens || 2000; // Default 2000 as per docs
				if (effort && effort !== "auto") {
					reasoningObj.effort = effort;
				} else {
					// If auto or unspecified, use max_tokens (Anthropic-style fallback)
					reasoningObj.max_tokens = maxTokensReasoning;
				}
				if (reasoningConfig.exclude !== undefined) {
					reasoningObj.exclude = reasoningConfig.exclude;
				}
				rb.reasoning = reasoningObj;
			}
		}

		// stop
		if (options.modelOptions) {
			const mo = options.modelOptions as Record<string, unknown>;
			if (typeof mo.stop === "string" || Array.isArray(mo.stop)) {
				rb.stop = mo.stop;
			}
		}

		// tools
		const toolConfig = convertTools(options);
		if (toolConfig.tools) {
			rb.tools = toolConfig.tools;
		}
		if (toolConfig.tool_choice) {
			rb.tool_choice = toolConfig.tool_choice;
		}



		// Process extra configuration parameters
		if (params.extra && typeof params.extra === "object") {
			// Add all extra parameters directly to the request body
			for (const [key, value] of Object.entries(params.extra)) {
				if (value !== undefined) {
					rb[key] = value;
				}
			}
		}

		return rb;
	}

	/**
	 * Ensure an API key exists in SecretStorage, optionally prompting the user when not silent.
	 * @param useGenericKey If true, use generic API key.
	 * @param provider Optional provider name to get provider-specific API key.
	 */
	private async ensureApiKey(provider?: string): Promise<string | undefined> {
		// Provider-level keys only; no generic key fallback
		if (provider && provider.trim() !== "") {
			const normalizedProvider = provider.toLowerCase();
			const providerKey = `generic-copilot.apiKey.${normalizedProvider}`;
			let apiKey = await this.secrets.get(providerKey);
			if (!apiKey) {
				const entered = await vscode.window.showInputBox({
					title: `API key for ${normalizedProvider}`,
					prompt: `Enter API key for ${normalizedProvider}`,
					ignoreFocusOut: true,
					password: true,
				});
				if (entered && entered.trim()) {
					apiKey = entered.trim();
					await this.secrets.store(providerKey, apiKey);
				}
			}
			return apiKey ?? undefined;
		}
		// If provider is missing, cannot determine which key to use
		return undefined;
	}

	/**
	 * Read and parse the Router streaming (SSE-like) response and report parts.
	 * @param responseBody The readable stream body.
	 * @param progress Progress reporter for streamed parts.
	 * @param token Cancellation token.
	 */
	private async processStreamingResponse(
		responseBody: ReadableStream<Uint8Array>,
		progress: Progress<LanguageModelResponsePart2>,
		token: CancellationToken
	): Promise<void> {
		const reader = responseBody.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		try {
			while (!token.isCancellationRequested) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (!line.startsWith("data:")) {
						continue;
					}
					const data = line.slice(5).trim();
					if (data === "[DONE]") {
						// Do not throw on [DONE]; any incomplete/empty buffers are ignored.
						await this.flushToolCallBuffers(progress, /*throwOnInvalid*/ false);
						// Flush any in-progress text-embedded tool call (silent if incomplete)
						await this.flushActiveTextToolCall(progress);
						continue;
					}

					try {
						const parsed = JSON.parse(data);

						// debug log
						// console.log("[Generic Compatible Model Provider] Chunk Data:", parsed);

						await this.processDelta(parsed, progress);
					} catch {
						// Silently ignore malformed SSE lines temporarily
					}
				}
			}
		} finally {
			reader.releaseLock();
			// Clean up any leftover tool call state
			this._toolCallBuffers.clear();
			this._completedToolCallIndices.clear();
			this._hasEmittedAssistantText = false;
			this._emittedBeginToolCallsHint = false;
			this._textToolActive = undefined;
			this._emittedTextToolCallKeys.clear();
			this._xmlThinkActive = false;
			this._xmlThinkDetectionAttempted = false;
			this._currentThinkingId = null;
		}
	}

	/**
	 * Generate a unique thinking ID based on request start time and random suffix
	 */
	private generateThinkingId(): string {
		return `thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	}

	/**
	 * Handle a single streamed delta chunk, emitting text and tool call parts.
	 * @param delta Parsed SSE chunk from the Router.
	 * @param progress Progress reporter for parts.
	 */
	private async processDelta(
		delta: Record<string, unknown>,
		progress: Progress<LanguageModelResponsePart2>
	): Promise<boolean> {
		let emitted = false;
		const choice = (delta.choices as Record<string, unknown>[] | undefined)?.[0];
		if (!choice) {
			return false;
		}

		const deltaObj = choice.delta as Record<string, unknown> | undefined;

		// Process thinking content first (before regular text content)
		try {
			let maybeThinking =
				(choice as Record<string, unknown> | undefined)?.thinking ??
				(deltaObj as Record<string, unknown> | undefined)?.thinking ??
				(deltaObj as Record<string, unknown> | undefined)?.reasoning_content;

			// OpenRouter/Claude reasoning_details array handling (new)
			const maybeReasoningDetails =
				(deltaObj as Record<string, unknown>)?.reasoning_details ??
				(choice as Record<string, unknown>)?.reasoning_details;
			if (maybeReasoningDetails && Array.isArray(maybeReasoningDetails) && maybeReasoningDetails.length > 0) {
				// Prioritize details array over simple reasoning
				const details: Array<ReasoningDetail> = maybeReasoningDetails as Array<ReasoningDetail>;
				// Sort by index to preserve order (in case out-of-order chunks)
				const sortedDetails = details.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

				for (const detail of sortedDetails) {
					let extractedText = "";
					if (detail.type === "reasoning.summary") {
						extractedText = (detail as ReasoningSummaryDetail).summary;
					} else if (detail.type === "reasoning.text") {
						extractedText = (detail as ReasoningTextDetail).text;
					} else if (detail.type === "reasoning.encrypted") {
						extractedText = "[REDACTED]"; // As per docs
					} else {
						extractedText = JSON.stringify(detail); // Fallback for unknown
					}

					if (extractedText) {
						// Generate thinking ID if not provided by the model
						if (!this._currentThinkingId) {
							this._currentThinkingId = this.generateThinkingId();
						}
						const metadata = { format: detail.format, type: detail.type, index: detail.index };
						progress.report(new vscode.LanguageModelThinkingPart(extractedText, this._currentThinkingId, metadata));
						emitted = true;
					}
				}
				maybeThinking = null; // Skip simple thinking if details present
			}

			// Fallback to simple thinking if no details
			if (maybeThinking !== undefined && maybeThinking !== null) {
				let text = "";
				let metadata: Record<string, unknown> | undefined;
				if (maybeThinking && typeof maybeThinking === "object") {
					const mt = maybeThinking as Record<string, unknown>;
					text = typeof mt["text"] === "string" ? (mt["text"] as string) : JSON.stringify(mt);
					metadata = mt["metadata"] ? (mt["metadata"] as Record<string, unknown>) : undefined;
				} else if (typeof maybeThinking === "string") {
					text = maybeThinking;
				}
				if (text) {
					// Generate thinking ID if not provided by the model
					if (!this._currentThinkingId) {
						this._currentThinkingId = this.generateThinkingId();
					}
					progress.report(new vscode.LanguageModelThinkingPart(text, this._currentThinkingId, metadata));
					emitted = true;
				}
			}
		} catch (e) {
			console.warn("[Generic Compatible Model Provider] Failed to process thinking/reasoning_details:", e);
		}

		if (deltaObj?.content) {
			const content = String(deltaObj.content);

			// Process XML think blocks or text content (mutually exclusive)
			const xmlRes = this.processXmlThinkBlocks(content, progress);
			if (xmlRes.emittedAny) {
				emitted = true;
			} else {
				// Check if content contains visible text (non-whitespace)
				const hasVisibleContent = content.trim().length > 0;

				// If we have visible content and there's an active thinking sequence, end it first
				if (hasVisibleContent && this._currentThinkingId) {
					try {
						// End the current thinking sequence with empty content and same ID
						progress.report(new vscode.LanguageModelThinkingPart("", this._currentThinkingId));
					} catch (e) {
						console.warn("[Generic Compatible Model Provider] Failed to end thinking sequence:", e);
					} finally {
						this._currentThinkingId = null;
					}
				}

				// Only process text content if no XML think blocks were emitted
				const res = this.processTextContent(content, progress);
				if (res.emittedText) {
					this._hasEmittedAssistantText = true;
				}
				if (res.emittedAny) {
					emitted = true;
				}
			}
		}

		if (deltaObj?.tool_calls) {
			const toolCalls = deltaObj.tool_calls as Array<Record<string, unknown>>;

			// SSEProcessor-like: if first tool call appears after text, emit a whitespace
			// to ensure any UI buffers/linkifiers are flushed without adding visible noise.
			if (!this._emittedBeginToolCallsHint && this._hasEmittedAssistantText && toolCalls.length > 0) {
				progress.report(new vscode.LanguageModelTextPart(" "));
				this._emittedBeginToolCallsHint = true;
			}

			for (const tc of toolCalls) {
				const idx = (tc.index as number) ?? 0;
				// Ignore any further deltas for an index we've already completed
				if (this._completedToolCallIndices.has(idx)) {
					continue;
				}
				const buf = this._toolCallBuffers.get(idx) ?? { args: "" };
				if (tc.id && typeof tc.id === "string") {
					buf.id = tc.id as string;
				}
				const func = tc.function as Record<string, unknown> | undefined;
				if (func?.name && typeof func.name === "string") {
					buf.name = func.name as string;
				}
				if (typeof func?.arguments === "string") {
					buf.args += func.arguments as string;
				}
				this._toolCallBuffers.set(idx, buf);

				// Emit immediately once arguments become valid JSON to avoid perceived hanging
				await this.tryEmitBufferedToolCall(idx, progress);
			}
		}

		const finish = (choice.finish_reason as string | undefined) ?? undefined;
		if (finish === "tool_calls" || finish === "stop") {
			// On both 'tool_calls' and 'stop', emit any buffered calls and throw on invalid JSON
			await this.flushToolCallBuffers(progress, /*throwOnInvalid*/ true);
		}
		return emitted;
	}

	/**
	 * Process streamed text content for inline tool-call control tokens and emit text/tool calls.
	 * Returns which parts were emitted for logging/flow control.
	 */
	private processTextContent(
		input: string,
		progress: Progress<LanguageModelResponsePart2>
	): { emittedText: boolean; emittedAny: boolean } {
		let emittedText = false;
		let emittedAny = false;

		// Emit any visible text
		const textToEmit = input;
		if (textToEmit && textToEmit.length > 0) {
			progress.report(new vscode.LanguageModelTextPart(textToEmit));
			emittedText = true;
			emittedAny = true;
		}

		return { emittedText, emittedAny };
	}

	private emitTextToolCallIfValid(
		progress: Progress<LanguageModelResponsePart2>,
		call: { name?: string; index?: number; argBuffer: string; emitted?: boolean },
		argText: string
	): boolean {
		const name = call.name ?? "unknown_tool";
		const parsed = tryParseJSONObject(argText);
		if (!parsed.ok) {
			return false;
		}
		const canonical = JSON.stringify(parsed.value);
		const key = `${name}:${canonical}`;
		// identity-based dedupe when index is present
		if (typeof call.index === "number") {
			const idKey = `${name}:${call.index}`;
			if (this._emittedTextToolCallIds.has(idKey)) {
				return false;
			}
			// Mark identity as emitted
			this._emittedTextToolCallIds.add(idKey);
		} else if (this._emittedTextToolCallKeys.has(key)) {
			return false;
		}
		this._emittedTextToolCallKeys.add(key);
		const id = `tct_${Math.random().toString(36).slice(2, 10)}`;
		progress.report(new vscode.LanguageModelToolCallPart(id, name, parsed.value));
		return true;
	}

	private async flushActiveTextToolCall(progress: Progress<LanguageModelResponsePart2>): Promise<void> {
		if (!this._textToolActive) {
			return;
		}
		const argText = this._textToolActive.argBuffer;
		const parsed = tryParseJSONObject(argText);
		if (!parsed.ok) {
			return;
		}
		// Emit (dedupe ensures we don't double-emit)
		this.emitTextToolCallIfValid(progress, this._textToolActive, argText);
		this._textToolActive = undefined;
	}

	/**
	 * Try to emit a buffered tool call when a valid name and JSON arguments are available.
	 * @param index The tool call index from the stream.
	 * @param progress Progress reporter for parts.
	 */
	private async tryEmitBufferedToolCall(index: number, progress: Progress<LanguageModelResponsePart2>): Promise<void> {
		const buf = this._toolCallBuffers.get(index);
		if (!buf) {
			return;
		}
		if (!buf.name) {
			return;
		}
		const canParse = tryParseJSONObject(buf.args);
		if (!canParse.ok) {
			return;
		}
		const id = buf.id ?? `call_${Math.random().toString(36).slice(2, 10)}`;
		const parameters = canParse.value;
		try {
			const canonical = JSON.stringify(parameters);
			this._emittedTextToolCallKeys.add(`${buf.name}:${canonical}`);
		} catch {
			/* ignore */
		}
		progress.report(new vscode.LanguageModelToolCallPart(id, buf.name, parameters));
		this._toolCallBuffers.delete(index);
		this._completedToolCallIndices.add(index);
	}

	/**
	 * Flush all buffered tool calls, optionally throwing if arguments are not valid JSON.
	 * @param progress Progress reporter for parts.
	 * @param throwOnInvalid If true, throw when a tool call has invalid JSON args.
	 */
	private async flushToolCallBuffers(
		progress: Progress<LanguageModelResponsePart2>,
		throwOnInvalid: boolean
	): Promise<void> {
		if (this._toolCallBuffers.size === 0) {
			return;
		}
		for (const [idx, buf] of Array.from(this._toolCallBuffers.entries())) {
			const parsed = tryParseJSONObject(buf.args);
			if (!parsed.ok) {
				if (throwOnInvalid) {
					console.error("[Generic Compatible Model Provider] Invalid JSON for tool call", {
						idx,
						snippet: (buf.args || "").slice(0, 200),
					});
					throw new Error("Invalid JSON for tool call");
				}
				// When not throwing (e.g. on [DONE]), drop silently to reduce noise
				continue;
			}
			const id = buf.id ?? `call_${Math.random().toString(36).slice(2, 10)}`;
			const name = buf.name ?? "unknown_tool";
			try {
				const canonical = JSON.stringify(parsed.value);
				this._emittedTextToolCallKeys.add(`${name}:${canonical}`);
			} catch {
				/* ignore */
			}
			progress.report(new vscode.LanguageModelToolCallPart(id, name, parsed.value));
			this._toolCallBuffers.delete(idx);
			this._completedToolCallIndices.add(idx);
		}
	}

	/**
	 * Process streamed text content for XML think blocks and emit thinking parts.
	 * Returns whether any thinking content was emitted.
	 */
	private processXmlThinkBlocks(
		input: string,
		progress: Progress<LanguageModelResponsePart2>
	): { emittedAny: boolean } {
		// If we've already attempted detection and found no THINK_START, skip processing
		if (this._xmlThinkDetectionAttempted && !this._xmlThinkActive) {
			return { emittedAny: false };
		}

		const THINK_START = "<think>";
		const THINK_END = "</think>";

		let data = input;
		let emittedAny = false;

		while (data.length > 0) {
			if (!this._xmlThinkActive) {
				// Look for think start tag
				const startIdx = data.indexOf(THINK_START);
				if (startIdx === -1) {
					// No think start found, mark detection as attempted and skip future processing
					this._xmlThinkDetectionAttempted = true;
					data = "";
					break;
				}

				// Found think start tag
				this._xmlThinkActive = true;
				// Generate a new thinking ID for this XML think block
				this._currentThinkingId = this.generateThinkingId();

				// Skip the start tag and continue processing
				data = data.slice(startIdx + THINK_START.length);
				continue;
			}

			// We are inside a think block, look for end tag
			const endIdx = data.indexOf(THINK_END);
			if (endIdx === -1) {
				// No end tag found, emit current chunk content as thinking part (preserve whitespace)
				const thinkContent = data;
				if (thinkContent.length > 0) {
					progress.report(new vscode.LanguageModelThinkingPart(thinkContent, this._currentThinkingId || undefined));
					emittedAny = true;
				}
				data = "";
				break;
			}

			// Found end tag, emit final thinking part
			const thinkContent = data.slice(0, endIdx);
			if (thinkContent) {
				progress.report(new vscode.LanguageModelThinkingPart(thinkContent, this._currentThinkingId || undefined));
				emittedAny = true;
			}

			// Reset state and continue with remaining data
			this._xmlThinkActive = false;
			this._currentThinkingId = null;
			data = data.slice(endIdx + THINK_END.length);
		}

		return { emittedAny };
	}
}
