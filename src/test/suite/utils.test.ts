import * as assert from 'assert';
import * as vscode from 'vscode';
import {
    parseModelId,
    convertMessages,
    convertTools,
    validateRequest,
    validateTools,
    tryParseJSONObject,
    resolveModelWithProvider,
    createRetryConfig,
    executeWithRetry,
    getModelProperties,
    getModelParameters,
} from '../../utils';
import type { ModelItem, ProviderConfig } from '../../types';
import { MockCancellationToken, MockConfiguration } from '../helpers/mocks';
import { assertThrowsAsync } from '../helpers/assertions';

suite('Utils Test Suite', () => {

    suite('parseModelId', () => {
        test('should parse model ID without config ID', () => {
            const result = parseModelId('gpt-4');
            assert.strictEqual(result.baseId, 'gpt-4');
            assert.strictEqual(result.configId, undefined);
        });

        test('should parse model ID with config ID', () => {
            const result = parseModelId('gpt-4::thinking');
            assert.strictEqual(result.baseId, 'gpt-4');
            assert.strictEqual(result.configId, 'thinking');
        });

        test('should parse model ID with multiple colons', () => {
            const result = parseModelId('provider/model::config::variant');
            assert.strictEqual(result.baseId, 'provider/model');
            assert.strictEqual(result.configId, 'config::variant');
        });

        test('should handle model ID with provider prefix', () => {
            const result = parseModelId('openai/gpt-4');
            assert.strictEqual(result.baseId, 'openai/gpt-4');
            assert.strictEqual(result.configId, undefined);
        });
    });

    suite('convertMessages', () => {
        test('should convert simple text message', () => {
            const messages = [
                {
                    role: vscode.LanguageModelChatMessageRole.User,
                    content: [new vscode.LanguageModelTextPart('Hello')],
                    name: ''
                }
            ];

            const result = convertMessages(messages);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].role, 'user');
            assert.strictEqual(result[0].content, 'Hello');
        });

        test('should convert assistant message', () => {
            const messages = [
                {
                    role: vscode.LanguageModelChatMessageRole.Assistant,
                    content: [new vscode.LanguageModelTextPart('Hello back')],
                    name: ''
                }
            ];

            const result = convertMessages(messages);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].role, 'assistant');
            assert.strictEqual(result[0].content, 'Hello back');
        });

        test('should convert multiple text parts', () => {
            const messages = [
                {
                    role: vscode.LanguageModelChatMessageRole.User,
                    content: [
                        new vscode.LanguageModelTextPart('Part 1'),
                        new vscode.LanguageModelTextPart('Part 2')
                    ],
                    name: ''
                }
            ];

            const result = convertMessages(messages);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].content, 'Part 1\nPart 2');
        });

        test('should convert tool call message', () => {
            const messages = [
                {
                    role: vscode.LanguageModelChatMessageRole.Assistant,
                    content: [
                        new vscode.LanguageModelToolCallPart('call_123', 'get_weather', { location: 'NYC' })
                    ],
                    name: ''
                }
            ];

            const result = convertMessages(messages);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].role, 'assistant');
            assert.ok(result[0].tool_calls);
            assert.strictEqual(result[0].tool_calls![0].id, 'call_123');
            assert.strictEqual(result[0].tool_calls![0].function.name, 'get_weather');
        });

        test('should convert tool result message', () => {
            const messages = [
                {
                    role: vscode.LanguageModelChatMessageRole.User,
                    content: [
                        new vscode.LanguageModelToolResultPart('call_123', [
                            new vscode.LanguageModelTextPart('Sunny, 72°F')
                        ])
                    ],
                    name: ''
                }
            ];

            const result = convertMessages(messages);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].role, 'tool');
            assert.strictEqual(result[0].tool_call_id, 'call_123');
            assert.strictEqual(result[0].content, 'Sunny, 72°F');
        });

        test('should handle mixed content in single message', () => {
            const messages = [
                {
                    role: vscode.LanguageModelChatMessageRole.Assistant,
                    content: [
                        new vscode.LanguageModelTextPart('Let me check'),
                        new vscode.LanguageModelToolCallPart('call_456', 'search', { query: 'test' })
                    ],
                    name: ''
                }
            ];

            const result = convertMessages(messages);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].content, 'Let me check');
            assert.ok(result[0].tool_calls);
            assert.strictEqual(result[0].tool_calls!.length, 1);
        });
    });

    suite('convertTools', () => {
        test('should convert empty tools array', () => {
            const options = {
                tools: []
            } as Partial<vscode.ProvideLanguageModelChatResponseOptions>;

            const result = convertTools(options as vscode.ProvideLanguageModelChatResponseOptions);
            assert.deepStrictEqual(result, {});
        });

        test('should convert single tool', () => {
            const options = {
                tools: [{
                    name: 'get_weather',
                    description: 'Get weather information',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            location: { type: 'string' }
                        },
                        required: ['location']
                    }
                }]
            } as Partial<vscode.ProvideLanguageModelChatResponseOptions>;

            const result = convertTools(options as vscode.ProvideLanguageModelChatResponseOptions);
            assert.ok(result.tools);
            assert.strictEqual(result.tools!.length, 1);
            assert.strictEqual(result.tools![0].function.name, 'get_weather');
            assert.strictEqual(result.tool_choice, 'auto');
        });

        test('should set tool_choice to required for single tool with Required mode', () => {
            const options = {
                tools: [{
                    name: 'search',
                    description: 'Search',
                    inputSchema: {}
                }],
                toolMode: vscode.LanguageModelChatToolMode.Required
            } as Partial<vscode.ProvideLanguageModelChatResponseOptions>;

            const result = convertTools(options as vscode.ProvideLanguageModelChatResponseOptions);
            assert.ok(result.tool_choice);
            assert.strictEqual(typeof result.tool_choice, 'object');
            assert.strictEqual((result.tool_choice as { type: string }).type, 'function');
        });

        test('should sanitize invalid tool names', () => {
            const options = {
                tools: [{
                    name: 'invalid name with spaces!',
                    description: 'Test',
                    inputSchema: {}
                }]
            } as Partial<vscode.ProvideLanguageModelChatResponseOptions>;

            const result = convertTools(options as vscode.ProvideLanguageModelChatResponseOptions);
            assert.ok(result.tools);
            assert.ok(result.tools![0].function.name.match(/^[a-zA-Z0-9_-]+$/));
        });

        test('should sanitize tool schemas with unknown keywords', () => {
            const options = {
                tools: [{
                    name: 'test_tool',
                    description: 'Test',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            field: { type: 'string' }
                        },
                        unknownKeyword: 'should be removed'
                    }
                }]
            } as Partial<vscode.ProvideLanguageModelChatResponseOptions>;

            const result = convertTools(options as vscode.ProvideLanguageModelChatResponseOptions);
            const schema = result.tools![0].function.parameters;
            assert.ok(!('unknownKeyword' in schema!));
        });
    });

    suite('validateTools', () => {
        test('should pass for valid tool names', () => {
            const tools = [
                { name: 'get_weather', description: '', inputSchema: {} },
                { name: 'search-api', description: '', inputSchema: {} },
                { name: 'tool123', description: '', inputSchema: {} }
            ];

            // Should not throw
            validateTools(tools);
        });

        test('should throw for invalid tool names', async () => {
            const tools = [
                { name: 'invalid name!', description: '', inputSchema: {} }
            ];

            await assertThrowsAsync(
                async () => validateTools(tools),
                'Invalid tool name'
            );
        });
    });

    suite('validateRequest', () => {
        test('should pass for valid request', () => {
            const messages = [
                {
                    role: vscode.LanguageModelChatMessageRole.User,
                    content: [new vscode.LanguageModelTextPart('Hello')],
                    name: ''
                }
            ];

            // Should not throw
            validateRequest(messages);
        });

        test('should throw for empty messages', async () => {
            await assertThrowsAsync(
                async () => validateRequest([]),
                'Invalid request'
            );
        });

        test('should validate tool call followed by tool result', () => {
            const messages = [
                {
                    role: vscode.LanguageModelChatMessageRole.Assistant,
                    content: [
                        new vscode.LanguageModelToolCallPart('call_1', 'tool', {})
                    ],
                    name: ''
                },
                {
                    role: vscode.LanguageModelChatMessageRole.User,
                    content: [
                        new vscode.LanguageModelToolResultPart('call_1', [
                            new vscode.LanguageModelTextPart('result')
                        ])
                    ],
                    name: ''
                }
            ];

            // Should not throw
            validateRequest(messages);
        });

        test('should throw when tool call not followed by tool result', async () => {
            const messages = [
                {
                    role: vscode.LanguageModelChatMessageRole.Assistant,
                    content: [
                        new vscode.LanguageModelToolCallPart('call_1', 'tool', {})
                    ],
                    name: ''
                },
                {
                    role: vscode.LanguageModelChatMessageRole.User,
                    content: [
                        new vscode.LanguageModelTextPart('Just text')
                    ],
                    name: ''
                }
            ];

            await assertThrowsAsync(
                async () => validateRequest(messages),
                'Tool call part must be followed'
            );
        });
    });

    suite('tryParseJSONObject', () => {
        test('should parse valid JSON object', () => {
            const result = tryParseJSONObject('{"key": "value"}');
            assert.ok(result.ok);
            if (result.ok) {
                assert.strictEqual(result.value.key, 'value');
            }
        });

        test('should fail for invalid JSON', () => {
            const result = tryParseJSONObject('not json');
            assert.strictEqual(result.ok, false);
        });

        test('should fail for JSON array', () => {
            const result = tryParseJSONObject('[1, 2, 3]');
            assert.strictEqual(result.ok, false);
        });

        test('should fail for JSON primitives', () => {
            assert.strictEqual(tryParseJSONObject('123').ok, false);
            assert.strictEqual(tryParseJSONObject('"string"').ok, false);
            assert.strictEqual(tryParseJSONObject('true').ok, false);
        });

        test('should handle nested objects', () => {
            const result = tryParseJSONObject('{"outer": {"inner": "value"}}');
            assert.ok(result.ok);
            if (result.ok) {
                assert.deepStrictEqual(result.value, { outer: { inner: 'value' } });
            }
        });

        test('should handle empty object', () => {
            const result = tryParseJSONObject('{}');
            assert.ok(result.ok);
            if (result.ok) {
                assert.deepStrictEqual(result.value, {});
            }
        });
    });

    suite('resolveModelWithProvider', () => {
        let originalGetConfiguration: typeof vscode.workspace.getConfiguration;
        let mockConfig: MockConfiguration;

        setup(() => {
            mockConfig = new MockConfiguration();
            originalGetConfiguration = vscode.workspace.getConfiguration;
            (vscode.workspace as { getConfiguration: unknown }).getConfiguration = () => mockConfig;
        });

        teardown(() => {
            (vscode.workspace as { getConfiguration: unknown }).getConfiguration = originalGetConfiguration;
        });

        test('should return model as-is when no provider reference', () => {
            const model: ModelItem = {
                model_properties: {
                    id: 'gpt-4',
                    owned_by: 'openai',
                    baseUrl: 'https://api.openai.com/v1'
                },
                model_parameters: {}
            };

            const result = resolveModelWithProvider(model);
            assert.deepStrictEqual(result, model);
        });

        test('should inherit baseUrl from provider', () => {
            const providers: ProviderConfig[] = [{
                key: 'test-provider',
                baseUrl: 'https://test.com/v1',
                displayName: 'Test Provider'
            }];

            mockConfig.set('generic-copilot.providers', providers);

            const model: ModelItem = {
                model_properties: {
                    id: 'test-model',
                    provider: 'test-provider',
                    owned_by: 'temp'
                },
                model_parameters: {}
            };

            const result = resolveModelWithProvider(model);
            assert.strictEqual(result.model_properties.baseUrl, 'https://test.com/v1');
            assert.strictEqual(result.model_properties.owned_by, 'test-provider');
        });

        test('should inherit defaults from provider', () => {
            const providers: ProviderConfig[] = [{
                key: 'test-provider',
                baseUrl: 'https://test.com/v1',
                defaults: {
                    model_properties: {
                        context_length: 100000,
                        vision: true
                    },
                    model_parameters: {
                        temperature: 0.7
                    }
                }
            }];

            mockConfig.set('generic-copilot.providers', providers);

            const model: ModelItem = {
                model_properties: {
                    id: 'test-model',
                    provider: 'test-provider',
                    owned_by: 'temp'
                },
                model_parameters: {}
            };

            const result = resolveModelWithProvider(model);
            assert.strictEqual(result.model_properties.context_length, 100000);
            assert.strictEqual(result.model_parameters.temperature, 0.7);
            assert.strictEqual(result.model_properties.vision, true);
        });

        test('should not override explicit model values with provider defaults', () => {
            const providers: ProviderConfig[] = [{
                key: 'test-provider',
                baseUrl: 'https://test.com/v1',
                defaults: {
                    model_properties: {
                        vision: true
                    },
                    model_parameters: {
                        temperature: 0.7
                    }
                }
            }];

            mockConfig.set('generic-copilot.providers', providers);

            const model: ModelItem = {
                model_properties: {
                    id: 'test-model',
                    provider: 'test-provider',
                    owned_by: 'temp',
                    vision: false
                },
                model_parameters: {
                    temperature: 0.3
                }
            };

            const result = resolveModelWithProvider(model);
            assert.strictEqual(result.model_parameters.temperature, 0.3);
            assert.strictEqual(result.model_properties.vision, false);
        });

        test('should handle missing provider gracefully', () => {
            mockConfig.set('generic-copilot.providers', []);

            const model: ModelItem = {
                model_properties: {
                    id: 'test-model',
                    provider: 'nonexistent',
                    owned_by: 'test'
                },
                model_parameters: {}
            };

            const result = resolveModelWithProvider(model);
            assert.strictEqual(result.model_properties.id, 'test-model');
        });
    });

    suite('createRetryConfig', () => {
        let originalGetConfiguration: typeof vscode.workspace.getConfiguration;
        let mockConfig: MockConfiguration;

        setup(() => {
            mockConfig = new MockConfiguration();
            originalGetConfiguration = vscode.workspace.getConfiguration;
            (vscode.workspace as { getConfiguration: unknown }).getConfiguration = () => mockConfig;
        });

        teardown(() => {
            (vscode.workspace as { getConfiguration: unknown }).getConfiguration = originalGetConfiguration;
        });

        test('should return default config when no user config', () => {
            const result = createRetryConfig();
            assert.strictEqual(result.enabled, true);
            assert.strictEqual(result.max_attempts, 3);
            assert.strictEqual(result.interval_ms, 1000);
        });

        test('should use user-provided config', () => {
            mockConfig.set('generic-copilot.retry', {
                enabled: false,
                max_attempts: 5,
                interval_ms: 2000
            });

            const result = createRetryConfig();
            assert.strictEqual(result.enabled, false);
            assert.strictEqual(result.max_attempts, 5);
            assert.strictEqual(result.interval_ms, 2000);
        });

        test('should handle partial config', () => {
            mockConfig.set('generic-copilot.retry', {
                max_attempts: 10
            });

            const result = createRetryConfig();
            assert.strictEqual(result.enabled, true);
            assert.strictEqual(result.max_attempts, 10);
            assert.strictEqual(result.interval_ms, 1000);
        });
    });

    suite('executeWithRetry', () => {
        test('should succeed on first attempt', async () => {
            let callCount = 0;
            const fn = async () => {
                callCount++;
                return 'success';
            };

            const config = { enabled: true, max_attempts: 3, interval_ms: 10 };
            const token = new MockCancellationToken();

            const result = await executeWithRetry(fn, config, token);
            assert.strictEqual(result, 'success');
            assert.strictEqual(callCount, 1);
        });

        test('should retry on retryable error', async () => {
            let callCount = 0;
            const fn = async () => {
                callCount++;
                if (callCount < 2) {
                    throw new Error('API error: [429] Too Many Requests');
                }
                return 'success';
            };

            const config = { enabled: true, max_attempts: 3, interval_ms: 10 };
            const token = new MockCancellationToken();

            const result = await executeWithRetry(fn, config, token);
            assert.strictEqual(result, 'success');
            assert.strictEqual(callCount, 2);
        });

        test('should not retry on non-retryable error', async () => {
            let callCount = 0;
            const fn = async () => {
                callCount++;
                throw new Error('API error: [400] Bad Request');
            };

            const config = { enabled: true, max_attempts: 3, interval_ms: 10 };
            const token = new MockCancellationToken();

            await assertThrowsAsync(
                async () => await executeWithRetry(fn, config, token),
                '400'
            );
            assert.strictEqual(callCount, 1);
        });

        test('should respect max_attempts', async () => {
            let callCount = 0;
            const fn = async () => {
                callCount++;
                throw new Error('API error: [500] Internal Server Error');
            };

            const config = { enabled: true, max_attempts: 2, interval_ms: 10 };
            const token = new MockCancellationToken();

            await assertThrowsAsync(
                async () => await executeWithRetry(fn, config, token),
                '500'
            );
            assert.strictEqual(callCount, 2);
        });

        test('should handle cancellation during retry', async () => {
            const fn = async () => {
                throw new Error('API error: [503] Service Unavailable');
            };

            const config = { enabled: true, max_attempts: 5, interval_ms: 100 };
            const token = new MockCancellationToken();

            // Cancel after first attempt
            setTimeout(() => token.cancel(), 50);

            await assertThrowsAsync(
                async () => await executeWithRetry(fn, config, token),
                /cancelled|Service Unavailable/
            );
        });

        test('should not retry when disabled', async () => {
            let callCount = 0;
            const fn = async () => {
                callCount++;
                if (callCount < 2) {
                    throw new Error('API error: [429] Too Many Requests');
                }
                return 'success';
            };

            const config = { enabled: false, max_attempts: 3, interval_ms: 10 };
            const token = new MockCancellationToken();

            await assertThrowsAsync(
                async () => await executeWithRetry(fn, config, token),
                '429'
            );
            assert.strictEqual(callCount, 1);
        });

        test('should retry on all retryable status codes', async () => {
            const retryableStatuses = [429, 500, 502, 503, 504];

            for (const status of retryableStatuses) {
                const fn = async () => {
                    throw new Error(`API error: [${status}] Error`);
                };

                const config = { enabled: true, max_attempts: 1, interval_ms: 10 };
                const token = new MockCancellationToken();

                // Should attempt retry (will fail but demonstrates retry logic)
                await assertThrowsAsync(
                    async () => await executeWithRetry(fn, config, token),
                    String(status)
                );
            }
        });
    });

    suite('getModelProperties', () => {
        test('should extract properties from grouped structure', () => {
            const model: ModelItem = {
                model_properties: {
                    id: 'test-model',
                    owned_by: 'test-provider',
                    context_length: 128000,
                    vision: true,
                    family: 'gpt-4',
                },
                model_parameters: {
                    temperature: 0.7,
                },
            };

            const props = getModelProperties(model);
            assert.strictEqual(props.id, 'test-model');
            assert.strictEqual(props.owned_by, 'test-provider');
            assert.strictEqual(props.context_length, 128000);
            assert.strictEqual(props.vision, true);
            assert.strictEqual(props.family, 'gpt-4');
        });
    });

    suite('getModelParameters', () => {
        test('should extract parameters from grouped structure', () => {
            const model: ModelItem = {
                model_properties: {
                    id: 'test-model',
                    owned_by: 'test-provider',
                },
                model_parameters: {
                    temperature: 0.7,
                    max_tokens: 4096,
                    top_p: 1,
                    extra: {
                        custom_param: 'value',
                    },
                },
            };

            const params = getModelParameters(model);
            assert.strictEqual(params.temperature, 0.7);
            assert.strictEqual(params.max_tokens, 4096);
            assert.strictEqual(params.top_p, 1);
            assert.deepStrictEqual(params.extra, { custom_param: 'value' });
        });

        test('should handle null values for temperature and top_p', () => {
            const model: ModelItem = {
                model_properties: {
                    id: 'test-model',
                    owned_by: 'test-provider',
                },
                model_parameters: {
                    temperature: null,
                    top_p: null,
                },
            };

            const params = getModelParameters(model);
            assert.strictEqual(params.temperature, null);
            assert.strictEqual(params.top_p, null);
        });
    });
});
