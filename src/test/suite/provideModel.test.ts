import * as assert from 'assert';
import * as vscode from 'vscode';
import { prepareLanguageModelChatInformation } from '../../provideModel';
import type { ModelItem, ProviderConfig } from '../../types';
import { MockSecretStorage, MockCancellationToken, MockConfiguration } from '../helpers/mocks';
import { assertArrayLength, assertHasProperties } from '../helpers/assertions';

suite('ProvideModel Test Suite', () => {
    let mockSecrets: MockSecretStorage;
    let mockConfig: MockConfiguration;
    let originalGetConfiguration: typeof vscode.workspace.getConfiguration;
    const userAgent = 'test-agent/1.0';

    setup(() => {
        mockSecrets = new MockSecretStorage();
        mockConfig = new MockConfiguration();
        originalGetConfiguration = vscode.workspace.getConfiguration;
        (vscode.workspace as { getConfiguration: unknown }).getConfiguration = () => mockConfig;
    });

    teardown(() => {
        (vscode.workspace as { getConfiguration: unknown }).getConfiguration = originalGetConfiguration;
    });

    suite('prepareLanguageModelChatInformation', () => {
        test('should return empty array when no models configured', async () => {
            mockConfig.set('generic-copilot.models', []);

            const token = new MockCancellationToken();
            const result = await prepareLanguageModelChatInformation(
                { silent: false },
                token,
                mockSecrets,
                userAgent
            );

            assertArrayLength(result, 0);
        });

        test('should create model info from user-configured models', async () => {
            const models: ModelItem[] = [{
                id: 'gpt-4',
                model_properties: {

                    owned_by: 'openai',
                },
                model_parameters: {}
            }];

            mockConfig.set('generic-copilot.models', models);

            const token = new MockCancellationToken();
            const result = await prepareLanguageModelChatInformation(
                { silent: false },
                token,
                mockSecrets,
                userAgent
            );

            assertArrayLength(result, 1);
            assert.strictEqual(result[0].id, 'openai/gpt-4');
            assert.strictEqual(result[0].name, 'openai/gpt-4');
        });

        test('should use configId in model ID when present', async () => {
            const models: ModelItem[] = [{
                id: 'gpt-4',
                model_properties: {

                    owned_by: 'openai',
                    configId: 'thinking',
                },
                model_parameters: {}
            }];

            mockConfig.set('generic-copilot.models', models);

            const token = new MockCancellationToken();
            const result = await prepareLanguageModelChatInformation(
                { silent: false },
                token,
                mockSecrets,
                userAgent
            );

            assert.strictEqual(result[0].id, 'openai/gpt-4::thinking');
            assert.strictEqual(result[0].name, 'openai/gpt-4::thinking');
        });

        test('should use displayName when provided', async () => {
            const providers: ProviderConfig[] = [{
                key: 'openai',
                baseUrl: 'https://api.openai.com/v1',
                displayName: 'OpenAI'
            }];

            const models: ModelItem[] = [{
                id: 'gpt-4',
                displayName: 'GPT-4',
                model_properties: {
                    owned_by: 'openai',
                },
                model_parameters: {}
            }];

            mockConfig.set('generic-copilot.providers', providers);
            mockConfig.set('generic-copilot.models', models);

            const token = new MockCancellationToken();
            const result = await prepareLanguageModelChatInformation(
                { silent: false },
                token,
                mockSecrets,
                userAgent
            );

            assert.strictEqual(result[0].name, 'OpenAI/GPT-4');
        });

        test('should set context length and max tokens correctly', async () => {
            const models: ModelItem[] = [{
                id: 'test-model',
                model_properties: {

                    owned_by: 'test',
                    context_length: 100000,
                },
                model_parameters: {
                    max_tokens: 4096,
                }
            }];

            mockConfig.set('generic-copilot.models', models);

            const token = new MockCancellationToken();
            const result = await prepareLanguageModelChatInformation(
                { silent: false },
                token,
                mockSecrets,
                userAgent
            );

            assert.strictEqual(result[0].maxOutputTokens, 4096);
            // maxInputTokens should be context_length - max_tokens
            assert.strictEqual(result[0].maxInputTokens, 100000 - 4096);
        });

        test('should prefer max_completion_tokens over max_tokens', async () => {
            const models: ModelItem[] = [{
                id: 'test-model',
                model_properties: {

                    owned_by: 'test',
                    context_length: 100000,
                },
                model_parameters: {
                    max_tokens: 2048,
                    max_completion_tokens: 4096,
                }
            }];

            mockConfig.set('generic-copilot.models', models);

            const token = new MockCancellationToken();
            const result = await prepareLanguageModelChatInformation(
                { silent: false },
                token,
                mockSecrets,
                userAgent
            );

            assert.strictEqual(result[0].maxOutputTokens, 4096);
        });


        test('should set tool calling capability', async () => {
            const models: ModelItem[] = [{
                id: 'test-model',
                model_properties: {

                    owned_by: 'test',
                },
                model_parameters: {}
            }];

            mockConfig.set('generic-copilot.models', models);

            const token = new MockCancellationToken();
            const result = await prepareLanguageModelChatInformation(
                { silent: false },
                token,
                mockSecrets,
                userAgent
            );

            assert.strictEqual(result[0].capabilities.toolCalling, true);
        });

        test('should set family correctly', async () => {
            const models: ModelItem[] = [
                {
                    id: 'gpt-4',
                    model_properties: {

                        owned_by: 'openai',
                        family: 'gpt-4',
                    },
                    model_parameters: {}
                },
                {
                    id: 'claude-3',
                    model_properties: {

                        owned_by: 'anthropic',
                        family: 'claude-3',
                    },
                    model_parameters: {}
                },
                {
                    id: 'generic',
                    model_properties: {

                        owned_by: 'test'
                    },
                    model_parameters: {}
                }
            ];

            mockConfig.set('generic-copilot.models', models);

            const token = new MockCancellationToken();
            const result = await prepareLanguageModelChatInformation(
                { silent: false },
                token,
                mockSecrets,
                userAgent
            );

            assert.strictEqual(result[0].family, 'gpt-4');
            assert.strictEqual(result[1].family, 'claude-3');
            assert.strictEqual(result[2].family, 'generic');
        });

        test('should handle multiple models', async () => {
            const models: ModelItem[] = [
                {
                    id: 'model-1',
                    model_properties: {

                        owned_by: 'provider-1',
                    },
                    model_parameters: {}
                },
                {
                    id: 'model-2',
                    model_properties: {

                        owned_by: 'provider-2',
                    },
                    model_parameters: {}
                },
                {
                    id: 'model-3',
                    model_properties: {

                        owned_by: 'provider-1',
                    },
                    model_parameters: {}
                }
            ];

            mockConfig.set('generic-copilot.models', models);

            const token = new MockCancellationToken();
            const result = await prepareLanguageModelChatInformation(
                { silent: false },
                token,
                mockSecrets,
                userAgent
            );

            assertArrayLength(result, 3);
            assert.strictEqual(result[0].id, 'provider-1/model-1');
            assert.strictEqual(result[1].id, 'provider-2/model-2');
            assert.strictEqual(result[2].id, 'provider-1/model-3');
        });


        test('should set version and detail fields', async () => {
            const providers: ProviderConfig[] = [{
                key: 'openai',
                baseUrl: 'https://api.openai.com/v1',
                displayName: 'OpenAI'
            }];

            const models: ModelItem[] = [{
                id: 'gpt-4',
                model_properties: {

                    owned_by: 'openai',
                },
                model_parameters: {}
            }];

            mockConfig.set('generic-copilot.providers', providers);
            mockConfig.set('generic-copilot.models', models);

            const token = new MockCancellationToken();
            const result = await prepareLanguageModelChatInformation(
                { silent: false },
                token,
                mockSecrets,
                userAgent
            );

            assert.strictEqual(result[0].version, '1.0.0');
            assert.strictEqual(result[0].detail, 'OpenAI');
        });

        test('should handle configId in tooltip', async () => {
            const models: ModelItem[] = [{
                id: 'gpt-4',
                model_properties: {

                    owned_by: 'openai',
                    configId: 'thinking',
                },
                model_parameters: {}
            }];

            mockConfig.set('generic-copilot.models', models);

            const token = new MockCancellationToken();
            const result = await prepareLanguageModelChatInformation(
                { silent: false },
                token,
                mockSecrets,
                userAgent
            );

            assert.ok(result[0].tooltip);
            assert.ok(result[0].tooltip!.includes('::thinking'));
        });

        test('should respect silent mode', async () => {
            const models: ModelItem[] = [{
                id: 'test-model',
                model_properties: {

                    owned_by: 'test',
                },
                model_parameters: {}
            }];

            mockConfig.set('generic-copilot.models', models);

            const token = new MockCancellationToken();
            // Silent mode shouldn't affect the result in this implementation
            const result = await prepareLanguageModelChatInformation(
                { silent: true },
                token,
                mockSecrets,
                userAgent
            );

            assertArrayLength(result, 1);
        });

        test('should handle cancellation', async () => {
            const models: ModelItem[] = [{
                id: 'test-model',
                model_properties: {

                    owned_by: 'test',
                },
                model_parameters: {}
            }];

            mockConfig.set('generic-copilot.models', models);

            const token = new MockCancellationToken();
            token.cancel();

            // Function should still complete even if cancelled
            // (current implementation doesn't check cancellation)
            const result = await prepareLanguageModelChatInformation(
                { silent: false },
                token,
                mockSecrets,
                userAgent
            );

            assertArrayLength(result, 1);
        });

        test('should handle edge case with maxInputTokens calculation', async () => {
            const models: ModelItem[] = [{
                id: 'test-model',
                model_properties: {

                    owned_by: 'test',
                    context_length: 1000,
                },
                model_parameters: {
                    max_tokens: 1000,
                }
            }];

            mockConfig.set('generic-copilot.models', models);

            const token = new MockCancellationToken();
            const result = await prepareLanguageModelChatInformation(
                { silent: false },
                token,
                mockSecrets,
                userAgent
            );

            // Should be at least 1
            assert.ok(result[0].maxInputTokens >= 1);
        });

        test('should return required properties for each model', async () => {
            const models: ModelItem[] = [{
                id: 'test-model',
                model_properties: {

                    owned_by: 'test',
                },
                model_parameters: {}
            }];

            mockConfig.set('generic-copilot.models', models);

            const token = new MockCancellationToken();
            const result = await prepareLanguageModelChatInformation(
                { silent: false },
                token,
                mockSecrets,
                userAgent
            );

            const model = result[0];
            assertHasProperties(model, [
                'id',
                'name',
                'family',
                'version',
                'maxInputTokens',
                'maxOutputTokens',
                'capabilities'
            ]);
        });
    });
});
