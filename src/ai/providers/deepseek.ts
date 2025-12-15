import { createDeepSeek, DeepSeekProviderSettings } from "@ai-sdk/deepseek";
import { ProviderClient } from "../providerClient";
import { ProviderConfig, ModelItem } from "../../types";
import {
	Progress,
	LanguageModelChatRequestMessage,
	ProvideLanguageModelChatResponseOptions,
	LanguageModelResponsePart2 as LanguageModelResponsePart,
} from "vscode";
import * as vscode from "vscode";
import { JSONValue } from "ai";
import { logger } from "../../outputLogger";
import { CacheRegistry } from "../utils/metadataCache";
import { LM2VercelMessage } from "../utils/conversion";
import type { ModelMessage } from "ai";

export class DeepSeekProviderClient extends ProviderClient {
	private currentReasoningBuffer = "";
	private sawAnyReasoning = false;

	constructor(config: ProviderConfig, apiKey: string) {
		super(
			"deepseek",
			config,
			createDeepSeek({
				apiKey: apiKey,
				...(config.baseUrl && { baseURL: config.baseUrl }),
				...(config.headers && { headers: config.headers }),
			} as DeepSeekProviderSettings)
		);
	}

	/**
	 * DeepSeek docs: in thinking mode with tool calls, callers must send back the previous
	 * `reasoning_content` to allow the model to continue its reasoning across sub-turns.
	 *
	 * VS Code does not always preserve thinking parts in conversation history, so we:
	 * 1) accumulate streamed reasoning deltas for the current response
	 * 2) store it as a one-shot "pending" value
	 * 3) on the next request, inject it into the most recent assistant message if missing
	 */
	override convertMessages(messages: readonly LanguageModelChatRequestMessage[]): ModelMessage[] {
		const payload = LM2VercelMessage(messages);

		const cache = CacheRegistry.getCache("deepseekPendingReasoning", 10);
		const pendingReasoning = cache.get("pending") as string | undefined;
		if (!pendingReasoning || pendingReasoning.length === 0) {
			return payload;
		}

		// Find the most recent assistant message in the outgoing history and ensure it contains reasoning.
		for (let i = payload.length - 1; i >= 0; i--) {
			const msg = payload[i] as { role?: string; content?: unknown };
			if (msg.role !== "assistant" || !Array.isArray(msg.content)) {
				continue;
			}

			const contentArr = msg.content as Array<{ type?: string } & Record<string, unknown>>;
			const hasReasoning = contentArr.some((p) => p?.type === "reasoning");
			if (!hasReasoning) {
				contentArr.unshift({ type: "reasoning", text: pendingReasoning });
			}
			cache.delete("pending");
			break;
		}

		return payload;
	}

	async generateStreamingResponse(
		request: LanguageModelChatRequestMessage[],
		options: ProvideLanguageModelChatResponseOptions,
		config: ModelItem,
		progress: Progress<LanguageModelResponsePart>,
		statusBarItem: vscode.StatusBarItem,
		_providerOptions?: Record<string, Record<string, JSONValue>>
	): Promise<void> {
		// Reset per-response accumulators.
		this.currentReasoningBuffer = "";
		this.sawAnyReasoning = false;

		return super.generateStreamingResponse(request, options, config, progress, statusBarItem, {});
	}

	protected override processReasoningDelta(_id: string, deltaText: string): void {
		if (!deltaText) {
			return;
		}
		this.sawAnyReasoning = true;
		this.currentReasoningBuffer += deltaText;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected override processResponseMetadata(_result: any): void {
		// Store the full reasoning as a one-shot value to reattach on the next request if needed.
		if (!this.sawAnyReasoning || this.currentReasoningBuffer.length === 0) {
			return;
		}

		const cache = CacheRegistry.getCache("deepseekPendingReasoning", 500);
		cache.set("pending", this.currentReasoningBuffer);
		logger.debug(`Cached DeepSeek pending reasoning_content (${this.currentReasoningBuffer.length} chars)`);
	}


}
