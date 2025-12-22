import {ProviderConfig } from "../../types";
import { createOpenAICompatible, OpenAICompatibleProviderSettings } from "@ai-sdk/openai-compatible";
import { ProviderClient } from "../providerClient";
import { LanguageModelChatRequestMessage } from "vscode";
import { ModelMessage, UserModelMessage } from "ai";

export class OpenAICompatibleProviderClient extends ProviderClient {
	constructor(config: ProviderConfig, apiKey: string) {
		super(
			"openai-compatible",
			config,
			createOpenAICompatible({
				apiKey: apiKey,
				...(config.baseUrl && { baseURL: config.baseUrl }),
				...(config.headers && { headers: config.headers }),
			} as OpenAICompatibleProviderSettings)
		);
	}

	override convertMessages(messages: readonly LanguageModelChatRequestMessage[]): ModelMessage[] {
		const messagesPayload = super.convertMessages(messages);

		// Merge consecutive `user` messages into a single message.
		const mergedPayload: ModelMessage[] = [];
		for (const msg of messagesPayload) {
			if (msg.role === "user" && mergedPayload.length > 0 && mergedPayload[mergedPayload.length - 1].role === "user") {
				const prev = mergedPayload[mergedPayload.length - 1] as UserModelMessage;
				const curr = msg as UserModelMessage;
				prev.content = `${String(prev.content)}\n${String(curr.content)}`;
			} else {
				mergedPayload.push(msg);
			}
		}

		return mergedPayload;
	}

}
