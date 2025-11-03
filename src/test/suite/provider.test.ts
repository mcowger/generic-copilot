import * as assert from 'assert';
import * as vscode from 'vscode';
import { ChatModelProvider } from '../../provider';
import type { ModelItem } from '../../types';
import {
    MockSecretStorage,
    MockCancellationToken,
    MockProgress,
    MockConfiguration,
    createMockStreamingResponse
} from '../helpers/mocks';
import { assertThrowsAsync, assertArrayMinLength } from '../helpers/assertions';

suite('ChatModelProvider Test Suite', () => {
    let mockSecrets: MockSecretStorage;
    let mockConfig: MockConfiguration;
    let originalGetConfiguration: typeof vscode.workspace.getConfiguration;
    let originalFetch: typeof global.fetch;
    const userAgent = 'test-agent/1.0';

    setup(() => {
        mockSecrets = new MockSecretStorage();
        mockConfig = new MockConfiguration();
        originalGetConfiguration = vscode.workspace.getConfiguration;
        originalFetch = global.fetch;
        (vscode.workspace as { getConfiguration: unknown }).getConfiguration = () => mockConfig;

        // Setup default configuration
        mockConfig.set('generic-copilot.models', []);
        mockConfig.set('generic-copilot.providers', []);
        mockConfig.set('generic-copilot.retry', {
            enabled: false,  // Disable retry for most tests
            max_attempts: 1,
            interval_ms: 10
        });
        mockConfig.set('generic-copilot.delay', 0);
    });

    teardown(() => {
        (vscode.workspace as { getConfiguration: unknown }).getConfiguration = originalGetConfiguration;
        global.fetch = originalFetch;
    });

    suite('provideLanguageModelChatInformation', () => {
        test('should return model information', async () => {
            const models: ModelItem[] = [{
                    model_properties: {
                        id: 'test-model',
                        owned_by: 'test',
                        baseUrl: 'https://test.com/v1',
                    },
                    model_parameters: {
                    }
            }];

            mockConfig.set('generic-copilot.models', models);

            const provider = new ChatModelProvider(mockSecrets, userAgent);
            const token = new MockCancellationToken();

            const result = await provider.provideLanguageModelChatInformation(
                { silent: false },
                token
            );

            assertArrayMinLength(result, 1);
        });

        test('should handle silent mode', async () => {
            const models: ModelItem[] = [{
                    model_properties: {
                        id: 'test-model',
                        owned_by: 'test',
                    },
                    model_parameters: {
                    }
            }];

            mockConfig.set('generic-copilot.models', models);

            const provider = new ChatModelProvider(mockSecrets, userAgent);
            const token = new MockCancellationToken();

            const result = await provider.provideLanguageModelChatInformation(
                { silent: true },
                token
            );

            // Should still return models
            assertArrayMinLength(result, 1);
        });
    });

    suite('provideTokenCount', () => {
        const mockModel: vscode.LanguageModelChatInformation = {
            id: 'test/model',
            name: 'Test Model',
            family: 'test',
            version: '1.0',
            maxInputTokens: 100000,
            maxOutputTokens: 4096,
            capabilities: {
                toolCalling: true,
                imageInput: false
            }
        } as vscode.LanguageModelChatInformation;

        test('should count tokens for string', async () => {
            const provider = new ChatModelProvider(mockSecrets, userAgent);
            const token = new MockCancellationToken();

            const count = await provider.provideTokenCount(mockModel, 'Hello world', token);
            assert.ok(count > 0);
        });

        test('should count tokens for message', async () => {
            const provider = new ChatModelProvider(mockSecrets, userAgent);
            const token = new MockCancellationToken();

            const message = {
                role: vscode.LanguageModelChatMessageRole.User,
                content: [new vscode.LanguageModelTextPart('Hello')],
                name: ''
            };

            const count = await provider.provideTokenCount(mockModel, message, token);
            assert.ok(count > 0);
        });
    });

    suite('provideLanguageModelChatResponse', () => {
        const mockModel: vscode.LanguageModelChatInformation = {
            id: 'test/test-model',
            name: 'Test Model',
            family: 'test',
            version: '1.0',
            maxInputTokens: 100000,
            maxOutputTokens: 4096,
            capabilities: {
                toolCalling: true,
                imageInput: false
            }
        } as vscode.LanguageModelChatInformation;

        test('should handle simple text response', async () => {
            const models: ModelItem[] = [{
                    model_properties: {
                        id: 'test-model',
                        owned_by: 'test',
                        baseUrl: 'https://test.com/v1',
                    },
                    model_parameters: {
                    }
            }];

            mockConfig.set('generic-copilot.models', models);
            await mockSecrets.store('generic-copilot.apiKey.test', 'test-key');

            // Mock fetch
            global.fetch = async () => {
                const chunks = [
                    'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
                    'data: {"choices":[{"delta":{"content":" world"}}]}\n',
                    'data: [DONE]\n'
                ];
                return createMockStreamingResponse(chunks);
            };

            const provider = new ChatModelProvider(mockSecrets, userAgent);
            const messages = [{
                role: vscode.LanguageModelChatMessageRole.User,
                content: [new vscode.LanguageModelTextPart('Hi')],
                name: ''
            }];

            const progress = new MockProgress<vscode.LanguageModelResponsePart2>();
            const token = new MockCancellationToken();
            const options = {} as vscode.ProvideLanguageModelChatResponseOptions;

            await provider.provideLanguageModelChatResponse(
                mockModel,
                messages,
                options,
                progress,
                token
            );

            // Should have received text parts
            assertArrayMinLength(progress.reported, 1);
            assert.ok(progress.reported.some(p => p instanceof vscode.LanguageModelTextPart));
        });

        test('should handle tool calls in response', async () => {
            const models: ModelItem[] = [{
                    model_properties: {
                        id: 'test-model',
                        owned_by: 'test',
                        baseUrl: 'https://test.com/v1',
                    },
                    model_parameters: {
                    }
            }];

            mockConfig.set('generic-copilot.models', models);
            await mockSecrets.store('generic-copilot.apiKey.test', 'test-key');

            // Mock fetch with tool call
            global.fetch = async () => {
                const chunks = [
                    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_weather"}}]}}]}\n',
                    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"location\\":"}}]}}]}\n',
                    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"NYC\\"}"}}]}}]}\n',
                    'data: {"choices":[{"finish_reason":"tool_calls"}]}\n',
                    'data: [DONE]\n'
                ];
                return createMockStreamingResponse(chunks);
            };

            const provider = new ChatModelProvider(mockSecrets, userAgent);
            const messages = [{
                role: vscode.LanguageModelChatMessageRole.User,
                content: [new vscode.LanguageModelTextPart('What\'s the weather?')],
                name: ''
            }];

            const progress = new MockProgress<vscode.LanguageModelResponsePart2>();
            const token = new MockCancellationToken();
            const options = {
                tools: [{
                    name: 'get_weather',
                    description: 'Get weather',
                    inputSchema: {}
                }]
            } as Partial<vscode.ProvideLanguageModelChatResponseOptions>;

            await provider.provideLanguageModelChatResponse(
                mockModel,
                messages,
                options as vscode.ProvideLanguageModelChatResponseOptions,
                progress,
                token
            );

            // Should have tool call part
            const toolCalls = progress.reported.filter(p => p instanceof vscode.LanguageModelToolCallPart);
            assertArrayMinLength(toolCalls, 1);
        });

        test('should handle thinking content', async () => {
            const models: ModelItem[] = [{
                    model_properties: {
                        id: 'test-model',
                        owned_by: 'test',
                        baseUrl: 'https://test.com/v1',
                    },
                    model_parameters: {
                        enable_thinking: true,
                    }
            }];

            mockConfig.set('generic-copilot.models', models);
            await mockSecrets.store('generic-copilot.apiKey.test', 'test-key');

            // Mock fetch with thinking
            global.fetch = async () => {
                const chunks = [
                    'data: {"choices":[{"delta":{"thinking":"Let me think..."}}]}\n',
                    'data: {"choices":[{"delta":{"content":"Answer"}}]}\n',
                    'data: [DONE]\n'
                ];
                return createMockStreamingResponse(chunks);
            };

            const provider = new ChatModelProvider(mockSecrets, userAgent);
            const messages = [{
                role: vscode.LanguageModelChatMessageRole.User,
                content: [new vscode.LanguageModelTextPart('Question')],
                name: ''
            }];

            const progress = new MockProgress<vscode.LanguageModelResponsePart2>();
            const token = new MockCancellationToken();
            const options = {} as vscode.ProvideLanguageModelChatResponseOptions;

            await provider.provideLanguageModelChatResponse(
                mockModel,
                messages,
                options,
                progress,
                token
            );

            // Should have thinking part
            const thinkingParts = progress.reported.filter(p => p instanceof vscode.LanguageModelThinkingPart);
            assertArrayMinLength(thinkingParts, 1);
        });

        test('should throw error when API key not found', async () => {
            const models: ModelItem[] = [{
                    model_properties: {
                        id: 'test-model',
                        owned_by: 'test',
                        baseUrl: 'https://test.com/v1',
                    },
                    model_parameters: {
                    }
            }];

            mockConfig.set('generic-copilot.models', models);
            // Don't store API key - mock showInputBox to return undefined
            const originalShowInputBox = vscode.window.showInputBox;
            (vscode.window as { showInputBox: unknown }).showInputBox = async () => undefined;

            const provider = new ChatModelProvider(mockSecrets, userAgent);
            const messages = [{
                role: vscode.LanguageModelChatMessageRole.User,
                content: [new vscode.LanguageModelTextPart('Hi')],
                name: ''
            }];

            const progress = new MockProgress<vscode.LanguageModelResponsePart2>();
            const token = new MockCancellationToken();
            const options = {} as vscode.ProvideLanguageModelChatResponseOptions;

            await assertThrowsAsync(
                async () => await provider.provideLanguageModelChatResponse(
                    mockModel,
                    messages,
                    options,
                    progress,
                    token
                ),
                'API key'
            );

            // Restore
            (vscode.window as { showInputBox: unknown }).showInputBox = originalShowInputBox;
        });

        test('should throw error when base URL invalid', async () => {
            const models: ModelItem[] = [{
                    model_properties: {
                        id: 'test-model',
                        owned_by: 'test',
                        baseUrl: 'invalid-url',
                    },
                    model_parameters: {
                    }
            }];

            mockConfig.set('generic-copilot.models', models);
            await mockSecrets.store('generic-copilot.apiKey.test', 'test-key');

            const provider = new ChatModelProvider(mockSecrets, userAgent);
            const messages = [{
                role: vscode.LanguageModelChatMessageRole.User,
                content: [new vscode.LanguageModelTextPart('Hi')],
                name: ''
            }];

            const progress = new MockProgress<vscode.LanguageModelResponsePart2>();
            const token = new MockCancellationToken();
            const options = {} as vscode.ProvideLanguageModelChatResponseOptions;

            await assertThrowsAsync(
                async () => await provider.provideLanguageModelChatResponse(
                    mockModel,
                    messages,
                    options,
                    progress,
                    token
                ),
                'Invalid base URL'
            );
        });

        test('should handle API error response', async () => {
            const models: ModelItem[] = [{
                    model_properties: {
                        id: 'test-model',
                        owned_by: 'test',
                        baseUrl: 'https://test.com/v1',
                    },
                    model_parameters: {
                    }
            }];

            mockConfig.set('generic-copilot.models', models);
            await mockSecrets.store('generic-copilot.apiKey.test', 'test-key');

            // Mock fetch with error
            global.fetch = async () => {
                return new Response('Bad Request', { status: 400, statusText: 'Bad Request' });
            };

            const provider = new ChatModelProvider(mockSecrets, userAgent);
            const messages = [{
                role: vscode.LanguageModelChatMessageRole.User,
                content: [new vscode.LanguageModelTextPart('Hi')],
                name: ''
            }];

            const progress = new MockProgress<vscode.LanguageModelResponsePart2>();
            const token = new MockCancellationToken();
            const options = {} as vscode.ProvideLanguageModelChatResponseOptions;

            await assertThrowsAsync(
                async () => await provider.provideLanguageModelChatResponse(
                    mockModel,
                    messages,
                    options,
                    progress,
                    token
                ),
                '400'
            );
        });

        test('should handle cancellation', async () => {
            const models: ModelItem[] = [{
                    model_properties: {
                        id: 'test-model',
                        owned_by: 'test',
                        baseUrl: 'https://test.com/v1',
                    },
                    model_parameters: {
                    }
            }];

            mockConfig.set('generic-copilot.models', models);
            await mockSecrets.store('generic-copilot.apiKey.test', 'test-key');

            // Mock fetch that takes time
            global.fetch = async () => {
                await new Promise(resolve => setTimeout(resolve, 1000));
                return createMockStreamingResponse(['data: {"choices":[{"delta":{"content":"test"}}]}\n']);
            };

            const provider = new ChatModelProvider(mockSecrets, userAgent);
            const messages = [{
                role: vscode.LanguageModelChatMessageRole.User,
                content: [new vscode.LanguageModelTextPart('Hi')],
                name: ''
            }];

            const progress = new MockProgress<vscode.LanguageModelResponsePart2>();
            const token = new MockCancellationToken();
            const options = {} as vscode.ProvideLanguageModelChatResponseOptions;

            // Cancel immediately
            token.cancel();

            // Should handle cancellation gracefully
            try {
                await provider.provideLanguageModelChatResponse(
                    mockModel,
                    messages,
                    options,
                    progress,
                    token
                );
            } catch {
                // Expected to potentially throw
            }
        });

        test('should apply temperature and top_p from model config', async () => {
            const models: ModelItem[] = [{
                    model_properties: {
                        id: 'test-model',
                        owned_by: 'test',
                        baseUrl: 'https://test.com/v1',
                    },
                    model_parameters: {
                        temperature: 0.7,
                        top_p: 0.9,
                    }
            }];

            mockConfig.set('generic-copilot.models', models);
            await mockSecrets.store('generic-copilot.apiKey.test', 'test-key');

            let capturedBody: unknown;
            global.fetch = async (_url, init) => {
                capturedBody = JSON.parse(init?.body as string);
                return createMockStreamingResponse(['data: [DONE]\n']);
            };

            const provider = new ChatModelProvider(mockSecrets, userAgent);
            const messages = [{
                role: vscode.LanguageModelChatMessageRole.User,
                content: [new vscode.LanguageModelTextPart('Hi')],
                name: ''
            }];

            const progress = new MockProgress<vscode.LanguageModelResponsePart2>();
            const token = new MockCancellationToken();
            const options = {} as vscode.ProvideLanguageModelChatResponseOptions;

            await provider.provideLanguageModelChatResponse(
                mockModel,
                messages,
                options,
                progress,
                token
            );

            const body = capturedBody as Record<string, unknown>;
            assert.strictEqual(body.temperature, 0.7);
            assert.strictEqual(body.top_p, 0.9);
        });

        test('should apply max_tokens from model config', async () => {
            const models: ModelItem[] = [{
                    model_properties: {
                        id: 'test-model',
                        owned_by: 'test',
                        baseUrl: 'https://test.com/v1',
                    },
                    model_parameters: {
                        max_tokens: 2048,
                    }
            }];

            mockConfig.set('generic-copilot.models', models);
            await mockSecrets.store('generic-copilot.apiKey.test', 'test-key');

            let capturedBody: unknown;
            global.fetch = async (_url, init) => {
                capturedBody = JSON.parse(init?.body as string);
                return createMockStreamingResponse(['data: [DONE]\n']);
            };

            const provider = new ChatModelProvider(mockSecrets, userAgent);
            const messages = [{
                role: vscode.LanguageModelChatMessageRole.User,
                content: [new vscode.LanguageModelTextPart('Hi')],
                name: ''
            }];

            const progress = new MockProgress<vscode.LanguageModelResponsePart2>();
            const token = new MockCancellationToken();
            const options = {} as vscode.ProvideLanguageModelChatResponseOptions;

            await provider.provideLanguageModelChatResponse(
                mockModel,
                messages,
                options,
                progress,
                token
            );

            const body = capturedBody as Record<string, unknown>;
            assert.strictEqual(body.max_tokens, 2048);
        });

        test('should include tools in request when provided', async () => {
            const models: ModelItem[] = [{
                    model_properties: {
                        id: 'test-model',
                        owned_by: 'test',
                        baseUrl: 'https://test.com/v1',
                    },
                    model_parameters: {
                    }
            }];

            mockConfig.set('generic-copilot.models', models);
            await mockSecrets.store('generic-copilot.apiKey.test', 'test-key');

            let capturedBody: unknown;
            global.fetch = async (_url, init) => {
                capturedBody = JSON.parse(init?.body as string);
                return createMockStreamingResponse(['data: [DONE]\n']);
            };

            const provider = new ChatModelProvider(mockSecrets, userAgent);
            const messages = [{
                role: vscode.LanguageModelChatMessageRole.User,
                content: [new vscode.LanguageModelTextPart('Hi')],
                name: ''
            }];

            const progress = new MockProgress<vscode.LanguageModelResponsePart2>();
            const token = new MockCancellationToken();
            const options = {
                tools: [{
                    name: 'test_tool',
                    description: 'Test tool',
                    inputSchema: {}
                }]
            } as Partial<vscode.ProvideLanguageModelChatResponseOptions>;

            await provider.provideLanguageModelChatResponse(
                mockModel,
                messages,
                options as vscode.ProvideLanguageModelChatResponseOptions,
                progress,
                token
            );

            const body = capturedBody as Record<string, unknown>;
            assert.ok(body.tools);
            assert.ok(Array.isArray(body.tools));
        });

        test('should handle XML think blocks', async () => {
            const models: ModelItem[] = [{
                    model_properties: {
                        id: 'test-model',
                        owned_by: 'test',
                        baseUrl: 'https://test.com/v1',
                    },
                    model_parameters: {
                    }
            }];

            mockConfig.set('generic-copilot.models', models);
            await mockSecrets.store('generic-copilot.apiKey.test', 'test-key');

            // Mock fetch with XML think blocks
            global.fetch = async () => {
                const chunks = [
                    'data: {"choices":[{"delta":{"content":"<think>Thinking..."}}]}\n',
                    'data: {"choices":[{"delta":{"content":"</think>Answer"}}]}\n',
                    'data: [DONE]\n'
                ];
                return createMockStreamingResponse(chunks);
            };

            const provider = new ChatModelProvider(mockSecrets, userAgent);
            const messages = [{
                role: vscode.LanguageModelChatMessageRole.User,
                content: [new vscode.LanguageModelTextPart('Question')],
                name: ''
            }];

            const progress = new MockProgress<vscode.LanguageModelResponsePart2>();
            const token = new MockCancellationToken();
            const options = {} as vscode.ProvideLanguageModelChatResponseOptions;

            await provider.provideLanguageModelChatResponse(
                mockModel,
                messages,
                options,
                progress,
                token
            );

            // Should have thinking part from XML
            const thinkingParts = progress.reported.filter(p => p instanceof vscode.LanguageModelThinkingPart);
            assertArrayMinLength(thinkingParts, 1);
        });

        test('should respect delay configuration', async () => {
            const models: ModelItem[] = [{
                    model_properties: {
                        id: 'test-model',
                        owned_by: 'test',
                        baseUrl: 'https://test.com/v1',
                    },
                    model_parameters: {
                    }
            }];

            mockConfig.set('generic-copilot.models', models);
            mockConfig.set('generic-copilot.delay', 100);
            await mockSecrets.store('generic-copilot.apiKey.test', 'test-key');

            global.fetch = async () => {
                return createMockStreamingResponse(['data: [DONE]\n']);
            };

            const provider = new ChatModelProvider(mockSecrets, userAgent);
            const messages = [{
                role: vscode.LanguageModelChatMessageRole.User,
                content: [new vscode.LanguageModelTextPart('Hi')],
                name: ''
            }];

            const progress = new MockProgress<vscode.LanguageModelResponsePart2>();
            const token = new MockCancellationToken();
            const options = {} as vscode.ProvideLanguageModelChatResponseOptions;

            const start = Date.now();

            // First request - no delay
            await provider.provideLanguageModelChatResponse(
                mockModel,
                messages,
                options,
                progress,
                token
            );

            // Second request - should have delay
            await provider.provideLanguageModelChatResponse(
                mockModel,
                messages,
                options,
                progress,
                token
            );

            const elapsed = Date.now() - start;
            // Should have taken at least the delay time
            assert.ok(elapsed >= 100);
        });
    });
});
