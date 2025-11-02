import * as assert from "assert";
import * as vscode from "vscode";
import { prepareTokenCount, estimateTextTokens, estimateMessagesTokens, estimateToolTokens } from "../../provideToken";
import { MockCancellationToken } from "../helpers/mocks";
import { assertInRange } from "../helpers/assertions";

suite("ProvideToken Test Suite", () => {
	const mockModel: vscode.LanguageModelChatInformation = {
		id: "test-model",
		name: "Test Model",
		family: "test",
		version: "1.0",
		maxInputTokens: 100000,
		maxOutputTokens: 4096,
		capabilities: {
			toolCalling: true,
			imageInput: false,
		},
	} as vscode.LanguageModelChatInformation;

	suite("estimateTextTokens", () => {
		test("should estimate tokens for English text", () => {
			const text = "Hello world this is a test";
			const tokens = estimateTextTokens(text);
			// 6 words + 5 spaces = 16 tokens
			assertInRange(tokens, 15, 17);
		});

		test("should estimate tokens for Chinese text", () => {
			const text = "你好世界";
			const tokens = estimateTextTokens(text);
			// 4 Chinese characters should be ~6 tokens (1.5 per char)
			assertInRange(tokens, 5, 8);
		});

		test("should estimate tokens for mixed text", () => {
			const text = "Hello 世界 world";
			const tokens = estimateTextTokens(text);
			// 2 English words + 2 Chinese chars + spaces = 10 tokens
			assertInRange(tokens, 9, 11);
		});

		test("should handle empty string", () => {
			const tokens = estimateTextTokens("");
			assert.strictEqual(tokens, 0);
		});

		test("should estimate tokens for text with symbols", () => {
			const text = "Hello! How are you? I'm fine.";
			const tokens = estimateTextTokens(text);
			// Should account for words and symbols = 18 tokens
			assertInRange(tokens, 17, 19);
		});

		test("should estimate tokens for code", () => {
			const text = "function test() { return 42; }";
			const tokens = estimateTextTokens(text);
			// Code with symbols and words = 17 tokens
			assertInRange(tokens, 16, 18);
		});

		test("should handle long text", () => {
			const text = "word ".repeat(1000);
			const tokens = estimateTextTokens(text);
			// ~1000 words + 1000 spaces = 3000 tokens
			assertInRange(tokens, 2900, 3100);
		});
	});

	suite("estimateMessagesTokens", () => {
		test("should estimate tokens for single message", () => {
			const messages = [
				{
					role: vscode.LanguageModelChatMessageRole.User,
					content: [new vscode.LanguageModelTextPart("Hello world")],
					name: "",
				},
			];

			const tokens = estimateMessagesTokens(messages);
			assertInRange(tokens, 6, 8);
		});

		test("should estimate tokens for multiple messages", () => {
			const messages = [
				{
					role: vscode.LanguageModelChatMessageRole.User,
					content: [new vscode.LanguageModelTextPart("Hello")],
					name: "",
				},
				{
					role: vscode.LanguageModelChatMessageRole.Assistant,
					content: [new vscode.LanguageModelTextPart("Hi there")],
					name: "",
				},
			];

			const tokens = estimateMessagesTokens(messages);
			assertInRange(tokens, 7, 9);
		});

		test("should estimate tokens for message with multiple parts", () => {
			const messages = [
				{
					role: vscode.LanguageModelChatMessageRole.User,
					content: [new vscode.LanguageModelTextPart("Hello"), new vscode.LanguageModelTextPart("world")],
					name: "",
				},
			];

			const tokens = estimateMessagesTokens(messages);
			assertInRange(tokens, 4, 6);
		});

		test("should handle empty messages array", () => {
			const tokens = estimateMessagesTokens([]);
			assert.strictEqual(tokens, 0);
		});

		test("should handle messages with no content", () => {
			const messages = [
				{
					role: vscode.LanguageModelChatMessageRole.User,
					content: [],
					name: "",
				},
			];

			const tokens = estimateMessagesTokens(messages);
			assert.strictEqual(tokens, 0);
		});
	});

	suite("estimateToolTokens", () => {
		test("should estimate tokens for single tool", () => {
			const tools = [
				{
					type: "function" as const,
					function: {
						name: "get_weather",
						description: "Get weather information",
						parameters: {
							type: "object",
							properties: {
								location: { type: "string" },
							},
						},
					},
				},
			];

			const tokens = estimateToolTokens(tools);
			assert.ok(tokens > 0);
		});

		test("should estimate tokens for multiple tools", () => {
			const tools = [
				{
					type: "function" as const,
					function: {
						name: "get_weather",
						description: "Get weather",
						parameters: {},
					},
				},
				{
					type: "function" as const,
					function: {
						name: "search",
						description: "Search",
						parameters: {},
					},
				},
			];

			const tokens = estimateToolTokens(tools);
			assert.ok(tokens > 0);
			// More tools should generally mean more tokens
			const singleToolTokens = estimateToolTokens([tools[0]]);
			assert.ok(tokens > singleToolTokens);
		});

		test("should handle undefined tools", () => {
			const tokens = estimateToolTokens(undefined);
			assert.strictEqual(tokens, 0);
		});

		test("should handle empty tools array", () => {
			const tokens = estimateToolTokens([]);
			assert.strictEqual(tokens, 0);
		});

		test("should estimate tokens for complex tool schemas", () => {
			const tools = [
				{
					type: "function" as const,
					function: {
						name: "complex_tool",
						description: "A complex tool with many parameters",
						parameters: {
							type: "object",
							properties: {
								param1: { type: "string", description: "First param" },
								param2: { type: "number", description: "Second param" },
								param3: {
									type: "object",
									properties: {
										nested: { type: "string" },
									},
								},
							},
							required: ["param1", "param2"],
						},
					},
				},
			];

			const tokens = estimateToolTokens(tools);
			// Complex schema should have more tokens
			assert.ok(tokens > 20);
		});
	});

	suite("prepareTokenCount", () => {
		const token = new MockCancellationToken();

		test("should count tokens for plain text string", async () => {
			const text = "Hello world this is a test";
			const count = await prepareTokenCount(mockModel, text, token);
			assertInRange(count, 15, 17);
		});

		test("should count tokens for simple text message", async () => {
			const message = {
				role: vscode.LanguageModelChatMessageRole.User,
				content: [new vscode.LanguageModelTextPart("Hello world")],
				name: "",
			};

			const count = await prepareTokenCount(mockModel, message, token);
			// Text tokens (7) + overhead (4) = 11
			assertInRange(count, 10, 12);
		});

		test("should count tokens for message with tool call", async () => {
			const message = {
				role: vscode.LanguageModelChatMessageRole.Assistant,
				content: [new vscode.LanguageModelToolCallPart("call_1", "get_weather", { location: "NYC" })],
				name: "",
			};

			const count = await prepareTokenCount(mockModel, message, token);
			// Tool call should have tokens
			assert.ok(count > 4);
		});

		test("should count tokens for message with tool result", async () => {
			const message = {
				role: vscode.LanguageModelChatMessageRole.User,
				content: [new vscode.LanguageModelToolResultPart("call_1", [new vscode.LanguageModelTextPart("Sunny, 72°F")])],
				name: "",
			};

			const count = await prepareTokenCount(mockModel, message, token);
			assert.ok(count > 4);
		});

		test("should count tokens for message with multiple parts", async () => {
			const message = {
				role: vscode.LanguageModelChatMessageRole.User,
				content: [new vscode.LanguageModelTextPart("Hello"), new vscode.LanguageModelTextPart("world")],
				name: "",
			};

			const count = await prepareTokenCount(mockModel, message, token);
			assertInRange(count, 4, 10);
		});

		test("should count tokens for empty string", async () => {
			const count = await prepareTokenCount(mockModel, "", token);
			assert.strictEqual(count, 0);
		});

		test("should count tokens for empty message", async () => {
			const message = {
				role: vscode.LanguageModelChatMessageRole.User,
				content: [],
				name: "",
			};

			const count = await prepareTokenCount(mockModel, message, token);
			// Should have overhead
			assert.strictEqual(count, 4);
		});

		test("should count tokens for long text", async () => {
			const text = "word ".repeat(1000);
			const count = await prepareTokenCount(mockModel, text, token);
			// 1000 words + 1000 spaces = 3000 tokens
			assertInRange(count, 2900, 3100);
		});

		test("should count tokens for Chinese text message", async () => {
			const message = {
				role: vscode.LanguageModelChatMessageRole.User,
				content: [new vscode.LanguageModelTextPart("你好世界")],
				name: "",
			};

			const count = await prepareTokenCount(mockModel, message, token);
			// Chinese chars + overhead
			assertInRange(count, 8, 14);
		});

		test("should count tokens for complex message with tool calls and text", async () => {
			const message = {
				role: vscode.LanguageModelChatMessageRole.Assistant,
				content: [
					new vscode.LanguageModelTextPart("Let me check that"),
					new vscode.LanguageModelToolCallPart("call_1", "search", { query: "test query" }),
				],
				name: "",
			};

			const count = await prepareTokenCount(mockModel, message, token);
			// Both text and tool call
			assert.ok(count > 8);
		});
	});

	suite("Token estimation accuracy", () => {
		test("should provide consistent estimates", async () => {
			const text = "This is a consistent test message";
			const count1 = await prepareTokenCount(mockModel, text, new MockCancellationToken());
			const count2 = await prepareTokenCount(mockModel, text, new MockCancellationToken());
			assert.strictEqual(count1, count2);
		});

		test("should scale linearly with text length", () => {
			const base = "word ";
			const tokens1 = estimateTextTokens(base.repeat(10));
			const tokens2 = estimateTextTokens(base.repeat(20));

			// Double the text should roughly double the tokens (with some tolerance)
			const ratio = tokens2 / tokens1;
			assertInRange(ratio, 1.8, 2.2);
		});

		test("should handle special characters consistently", () => {
			const text1 = "Hello, world!";
			const text2 = "Hello world";

			const tokens1 = estimateTextTokens(text1);
			const tokens2 = estimateTextTokens(text2);

			// Should be similar but symbols add some tokens
			assert.ok(Math.abs(tokens1 - tokens2) <= 2);
		});
	});
});
