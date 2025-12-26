import { ProviderConfig } from "../../types";
import { AnthropicProviderClient } from "./anthropic";
import { LanguageModelUsage, StreamTextResult } from "ai";

interface ZaiResultData {
	input_tokens?: number;
	inputTokens?: number;
	output_tokens?: number;
	outputTokens?: number;
	cache_read_input_tokens?: number;
	cachedInputTokens?: number;
	server_tool_use?: Record<string, unknown>;
	service_tier?: string;
}

export class ZaiProviderClient extends AnthropicProviderClient {
	constructor(config: ProviderConfig, apiKey: string) {
		// Set default baseURL for Zai if not provided
		const configWithDefaults: ProviderConfig = {
			...config,
			baseUrl: config.baseUrl || "https://api.z.ai/api/anthropic/v1",
		};
		super(configWithDefaults, apiKey);
	}

	protected async processResultData(result: StreamTextResult<Record<string, any>, never>): Promise<LanguageModelUsage> {
		const raw = await result.providerMetadata;
        if (!raw?.anthropic?.usage) {
			return {
				inputTokens: 0,
				outputTokens: 0,
				cachedInputTokens: 0,
				totalTokens: 0,
			} as LanguageModelUsage;
		}
        const zaiUsage = raw.anthropic.usage as unknown as ZaiResultData;
		const inputTokens = (zaiUsage.input_tokens as number) || (zaiUsage.inputTokens as number) || 0;
		const outputTokens = (zaiUsage.output_tokens as number) || (zaiUsage.outputTokens as number) || 0;
		const cachedInputTokens = (zaiUsage.cache_read_input_tokens as number) || (zaiUsage.cachedInputTokens as number) || 0;
		const totalTokens = inputTokens + outputTokens + cachedInputTokens;
		return {
			inputTokens,
			outputTokens,
			cachedInputTokens,
			totalTokens,
		} as LanguageModelUsage;
	}
}
