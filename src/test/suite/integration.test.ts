import * as assert from "assert";
import * as vscode from "vscode";
import { ChatModelProvider } from "../../provider";
import type { ModelItem, ProviderConfig } from "../../types";
import {
	MockSecretStorage,
	MockCancellationToken,
	MockProgress,
	MockConfiguration,
	createMockStreamingResponse,
} from "../helpers/mocks";
import { assertArrayMinLength } from "../helpers/assertions";

suite("End-to-End Integration Test Suite", () => {
	let mockSecrets: MockSecretStorage;
	let mockConfig: MockConfiguration;
	let originalGetConfiguration: typeof vscode.workspace.getConfiguration;
	let originalFetch: typeof global.fetch;
	const userAgent = "test-agent/1.0";

	setup(() => {
		mockSecrets = new MockSecretStorage();
		mockConfig = new MockConfiguration();
		originalGetConfiguration = vscode.workspace.getConfiguration;
		originalFetch = global.fetch;
		(vscode.workspace as { getConfiguration: unknown }).getConfiguration = () => mockConfig;
	});

	teardown(() => {
		(vscode.workspace as { getConfiguration: unknown }).getConfiguration = originalGetConfiguration;
		global.fetch = originalFetch;
	});

	suite("Complete Chat Flow", () => {
		test("should complete full chat request/response cycle", async () => {
			// Setup configuration
			const providers: ProviderConfig[] = [
				{
					key: "test-provider",
					baseUrl: "https://test.com/v1",
					displayName: "Test Provider",
					defaults: {
						context_length: 100000,
						temperature: 0.7,
					},
				},
			];

			const models: ModelItem[] = [
				{
					id: "test-model",
					provider: "test-provider",
					owned_by: "test-provider",
					vision: false,
				},
			];

			mockConfig.set("generic-copilot.providers", providers);
			mockConfig.set("generic-copilot.models", models);
			mockConfig.set("generic-copilot.retry", { enabled: false, max_attempts: 1, interval_ms: 10 });
			mockConfig.set("generic-copilot.delay", 0);

			await mockSecrets.store("generic-copilot.apiKey.test-provider", "test-api-key");

			// Mock API response
			global.fetch = async () => {
				return createMockStreamingResponse([
					'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
					'data: {"choices":[{"delta":{"content":" there!"}}]}\n',
					"data: [DONE]\n",
				]);
			};

			// Create provider and execute request
			const provider = new ChatModelProvider(mockSecrets, userAgent);

			// Get model info
			const modelInfo = await provider.provideLanguageModelChatInformation(
				{ silent: false },
				new MockCancellationToken()
			);
			assertArrayMinLength(modelInfo, 1);

			// Execute chat
			const messages = [
				{
					role: vscode.LanguageModelChatMessageRole.User,
					content: [new vscode.LanguageModelTextPart("Hi")],
					name: "",
				},
			];

			const progress = new MockProgress<vscode.LanguageModelResponsePart2>();
			const token = new MockCancellationToken();
			const options = {} as vscode.ProvideLanguageModelChatResponseOptions;

			await provider.provideLanguageModelChatResponse(modelInfo[0], messages, options, progress, token);

			// Verify response
			assertArrayMinLength(progress.reported, 1);
			const textParts = progress.reported.filter((p) => p instanceof vscode.LanguageModelTextPart);
			assertArrayMinLength(textParts, 1);
		});

		test("should handle multi-turn conversation", async () => {
			const providers: ProviderConfig[] = [
				{
					key: "test-provider",
					baseUrl: "https://test.com/v1",
				},
			];

			const models: ModelItem[] = [
				{
					id: "test-model",
					provider: "test-provider",
					owned_by: "test-provider",
				},
			];

			mockConfig.set("generic-copilot.providers", providers);
			mockConfig.set("generic-copilot.models", models);
			mockConfig.set("generic-copilot.retry", { enabled: false, max_attempts: 1, interval_ms: 10 });
			mockConfig.set("generic-copilot.delay", 0);

			await mockSecrets.store("generic-copilot.apiKey.test-provider", "test-api-key");

			global.fetch = async () => {
				return createMockStreamingResponse([
					'data: {"choices":[{"delta":{"content":"Response"}}]}\n',
					"data: [DONE]\n",
				]);
			};

			const provider = new ChatModelProvider(mockSecrets, userAgent);
			const modelInfo = await provider.provideLanguageModelChatInformation(
				{ silent: false },
				new MockCancellationToken()
			);

			// First turn
			const messages1 = [
				{
					role: vscode.LanguageModelChatMessageRole.User,
					content: [new vscode.LanguageModelTextPart("First message")],
					name: "",
				},
			];

			const progress1 = new MockProgress<vscode.LanguageModelResponsePart2>();
			await provider.provideLanguageModelChatResponse(
				modelInfo[0],
				messages1,
				{} as vscode.ProvideLanguageModelChatResponseOptions,
				progress1,
				new MockCancellationToken()
			);

			assertArrayMinLength(progress1.reported, 1);

			// Second turn with history
			const messages2 = [
				...messages1,
				{
					role: vscode.LanguageModelChatMessageRole.Assistant,
					content: [new vscode.LanguageModelTextPart("Response")],
					name: "",
				},
				{
					role: vscode.LanguageModelChatMessageRole.User,
					content: [new vscode.LanguageModelTextPart("Second message")],
					name: "",
				},
			];

			const progress2 = new MockProgress<vscode.LanguageModelResponsePart2>();
			await provider.provideLanguageModelChatResponse(
				modelInfo[0],
				messages2,
				{} as vscode.ProvideLanguageModelChatResponseOptions,
				progress2,
				new MockCancellationToken()
			);

			assertArrayMinLength(progress2.reported, 1);
		});

		test("should handle tool call and result flow", async () => {
			const providers: ProviderConfig[] = [
				{
					key: "test-provider",
					baseUrl: "https://test.com/v1",
				},
			];

			const models: ModelItem[] = [
				{
					id: "test-model",
					provider: "test-provider",
					owned_by: "test-provider",
				},
			];

			mockConfig.set("generic-copilot.providers", providers);
			mockConfig.set("generic-copilot.models", models);
			mockConfig.set("generic-copilot.retry", { enabled: false, max_attempts: 1, interval_ms: 10 });
			mockConfig.set("generic-copilot.delay", 0);

			await mockSecrets.store("generic-copilot.apiKey.test-provider", "test-api-key");

			// Mock tool call response
			global.fetch = async (_url, init) => {
				const body = JSON.parse((init?.body as string) || "{}");

				// Check if this is the initial request or follow-up
				const hasToolResult = body.messages?.some((m: { role: string }) => m.role === "tool");

				if (!hasToolResult) {
					// Return tool call
					return createMockStreamingResponse([
						'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_weather"}}]}}]}\n',
						'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"location\\":\\"NYC\\"}"}}]}}]}\n',
						'data: {"choices":[{"finish_reason":"tool_calls"}]}\n',
						"data: [DONE]\n",
					]);
				} else {
					// Return final answer
					return createMockStreamingResponse([
						'data: {"choices":[{"delta":{"content":"Weather in NYC is sunny"}}]}\n',
						"data: [DONE]\n",
					]);
				}
			};

			const provider = new ChatModelProvider(mockSecrets, userAgent);
			const modelInfo = await provider.provideLanguageModelChatInformation(
				{ silent: false },
				new MockCancellationToken()
			);

			// Initial request with tools
			const messages1 = [
				{
					role: vscode.LanguageModelChatMessageRole.User,
					content: [new vscode.LanguageModelTextPart("What's the weather in NYC?")],
					name: "",
				},
			];

			const progress1 = new MockProgress<vscode.LanguageModelResponsePart2>();
			const options1 = {
				tools: [
					{
						name: "get_weather",
						description: "Get weather information",
						inputSchema: {
							type: "object",
							properties: {
								location: { type: "string" },
							},
						},
					},
				],
			} as Partial<vscode.ProvideLanguageModelChatResponseOptions>;

			await provider.provideLanguageModelChatResponse(
				modelInfo[0],
				messages1,
				options1 as vscode.ProvideLanguageModelChatResponseOptions,
				progress1,
				new MockCancellationToken()
			);

			// Should have tool call
			const toolCalls = progress1.reported.filter((p) => p instanceof vscode.LanguageModelToolCallPart);
			assertArrayMinLength(toolCalls, 1);

			// Follow-up with tool result
			const messages2 = [
				...messages1,
				{
					role: vscode.LanguageModelChatMessageRole.Assistant,
					content: [new vscode.LanguageModelToolCallPart("call_1", "get_weather", { location: "NYC" })],
					name: "",
				},
				{
					role: vscode.LanguageModelChatMessageRole.User,
					content: [
						new vscode.LanguageModelToolResultPart("call_1", [new vscode.LanguageModelTextPart("Sunny, 72°F")]),
					],
					name: "",
				},
			];

			const progress2 = new MockProgress<vscode.LanguageModelResponsePart2>();
			await provider.provideLanguageModelChatResponse(
				modelInfo[0],
				messages2,
				{} as vscode.ProvideLanguageModelChatResponseOptions,
				progress2,
				new MockCancellationToken()
			);

			// Should have final answer
			const textParts = progress2.reported.filter((p) => p instanceof vscode.LanguageModelTextPart);
			assertArrayMinLength(textParts, 1);
		});

		test("should handle retry on transient errors", async () => {
			const providers: ProviderConfig[] = [
				{
					key: "test-provider",
					baseUrl: "https://test.com/v1",
				},
			];

			const models: ModelItem[] = [
				{
					id: "test-model",
					provider: "test-provider",
					owned_by: "test-provider",
				},
			];

			mockConfig.set("generic-copilot.providers", providers);
			mockConfig.set("generic-copilot.models", models);
			mockConfig.set("generic-copilot.retry", {
				enabled: true,
				max_attempts: 3,
				interval_ms: 10,
			});
			mockConfig.set("generic-copilot.delay", 0);

			await mockSecrets.store("generic-copilot.apiKey.test-provider", "test-api-key");

			let attemptCount = 0;
			global.fetch = async () => {
				attemptCount++;
				if (attemptCount < 2) {
					return new Response("Too Many Requests", {
						status: 429,
						statusText: "Too Many Requests",
					});
				}
				return createMockStreamingResponse(['data: {"choices":[{"delta":{"content":"Success"}}]}\n', "data: [DONE]\n"]);
			};

			const provider = new ChatModelProvider(mockSecrets, userAgent);
			const modelInfo = await provider.provideLanguageModelChatInformation(
				{ silent: false },
				new MockCancellationToken()
			);

			const messages = [
				{
					role: vscode.LanguageModelChatMessageRole.User,
					content: [new vscode.LanguageModelTextPart("Test")],
					name: "",
				},
			];

			const progress = new MockProgress<vscode.LanguageModelResponsePart2>();
			await provider.provideLanguageModelChatResponse(
				modelInfo[0],
				messages,
				{} as vscode.ProvideLanguageModelChatResponseOptions,
				progress,
				new MockCancellationToken()
			);

			assert.strictEqual(attemptCount, 2, "Should have retried once");
			assertArrayMinLength(progress.reported, 1);
		});

		test("should handle different model families", async () => {
			const providers: ProviderConfig[] = [
				{
					key: "openai",
					baseUrl: "https://api.openai.com/v1",
				},
			];

			const models: ModelItem[] = [
				{
					id: "gpt-4",
					provider: "openai",
					owned_by: "openai",
					family: "gpt-4",
				},
				{
					id: "generic-model",
					provider: "openai",
					owned_by: "openai",
					family: "generic",
				},
			];

			mockConfig.set("generic-copilot.providers", providers);
			mockConfig.set("generic-copilot.models", models);
			mockConfig.set("generic-copilot.retry", { enabled: false, max_attempts: 1, interval_ms: 10 });

			await mockSecrets.store("generic-copilot.apiKey.openai", "test-api-key");

			const provider = new ChatModelProvider(mockSecrets, userAgent);
			const modelInfo = await provider.provideLanguageModelChatInformation(
				{ silent: false },
				new MockCancellationToken()
			);

			assertArrayMinLength(modelInfo, 2);
			assert.strictEqual(modelInfo[0].family, "gpt-4");
			assert.strictEqual(modelInfo[1].family, "generic");
		});

		test("should handle vision models", async () => {
			const providers: ProviderConfig[] = [
				{
					key: "test-provider",
					baseUrl: "https://test.com/v1",
				},
			];

			const models: ModelItem[] = [
				{
					id: "vision-model",
					provider: "test-provider",
					owned_by: "test-provider",
					vision: true,
				},
			];

			mockConfig.set("generic-copilot.providers", providers);
			mockConfig.set("generic-copilot.models", models);

			await mockSecrets.store("generic-copilot.apiKey.test-provider", "test-api-key");

			const provider = new ChatModelProvider(mockSecrets, userAgent);
			const modelInfo = await provider.provideLanguageModelChatInformation(
				{ silent: false },
				new MockCancellationToken()
			);

			assertArrayMinLength(modelInfo, 1);
			assert.strictEqual(modelInfo[0].capabilities.imageInput, true);
		});

		test("should handle configId variants", async () => {
			const providers: ProviderConfig[] = [
				{
					key: "test-provider",
					baseUrl: "https://test.com/v1",
				},
			];

			const models: ModelItem[] = [
				{
					id: "model",
					provider: "test-provider",
					owned_by: "test-provider",
					configId: "thinking",
					enable_thinking: true,
				},
				{
					id: "model",
					provider: "test-provider",
					owned_by: "test-provider",
					configId: "standard",
					enable_thinking: false,
				},
			];

			mockConfig.set("generic-copilot.providers", providers);
			mockConfig.set("generic-copilot.models", models);

			await mockSecrets.store("generic-copilot.apiKey.test-provider", "test-api-key");

			const provider = new ChatModelProvider(mockSecrets, userAgent);
			const modelInfo = await provider.provideLanguageModelChatInformation(
				{ silent: false },
				new MockCancellationToken()
			);

			// Should have 2 variants of the same model
			assertArrayMinLength(modelInfo, 2);
			assert.ok(modelInfo[0].id.includes("::thinking"));
			assert.ok(modelInfo[1].id.includes("::standard"));
		});
	});
});
