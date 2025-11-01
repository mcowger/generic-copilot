# 🤗 OAI Compatible Provider for Copilot

[![CI](https://github.com/JohnnyZ93/oai-compatible-copilot/actions/workflows/release.yml/badge.svg)](https://github.com/JohnnyZ93/oai-compatible-copilot/actions)
[![License](https://img.shields.io/github/license/JohnnyZ93/oai-compatible-copilot?color=orange&label=License)](https://github.com/JohnnyZ93/oai-compatible-copilot/blob/main/LICENSE)

Use frontier open LLMs like Qwen3 Coder, Kimi K2, DeepSeek V3.1, GLM 4.5 and more in VS Code with GitHub Copilot Chat powered by any OpenAI-compatible provider 🔥

## ✨ Features
- Supports almost all OpenAI-compatible providers, such as ModelScope, SiliconFlow, DeepSeek...
- Supports vision models.
- Offers additional configuration options for chat requests.
- Supports control model thinking and reasoning content show in chat interface.
  > ![thinkingPartDemo](./assets/thinkingPartDemo.png)
- Supports configuring models from multiple providers simultaneously, automatically managing API keys without switch them repeatedly.
- Supports defining multiple configurations for the same model ID with different settings (e.g. thinking enable/disable for GLM-4.6).
- Support auto retry mechanism for handling api errors like [429, 500, 502, 503, 504].
---

## Requirements
- VS Code 1.104.0 or higher.
- OpenAI-compatible provider API key.
---

## ⚡ Quick Start
1. Install the OAI Compatible Provider for Copilot extension [here](https://marketplace.visualstudio.com/items?itemName=johnny-zhao.oai-compatible-copilot).
2. Open VS Code Settings and configure `oaicopilot.baseUrl` and `oaicopilot.models`.
3. Open Github Copilot Chat interface.
4. Click the model picker and select "Manage Models...".
5. Choose "OAI Compatible" provider.
6. Enter your API key — it will be saved locally.
7. Select the models you want to add to the model picker.

### Settings Example

```json
"oaicopilot.baseUrl": "https://api-inference.modelscope.cn/v1",
"oaicopilot.models": [
    {
        "id": "Qwen/Qwen3-Coder-480B-A35B-Instruct",
        "owned_by": "modelscope",
        "context_length": 256000,
        "max_tokens": 8192,
        "temperature": 0,
        "top_p": 1
    }
]
```
---

## (Optional) Provider-First Configuration

The extension supports a provider-first configuration approach where you define providers once and reference them in model configurations. This reduces duplication and makes it easier to manage multiple models from the same provider.

### Benefits
- Define common settings (baseUrl, defaults) in one place
- Models automatically inherit from their provider
- Easier API key management per provider
- Override any setting at the model level when needed

### How it works
1. Define providers in `oaicopilot.providers` with baseUrl and optional defaults
2. Reference providers in model configurations using the `provider` field
3. Models inherit baseUrl, owned_by, and defaults from the provider
4. Model-specific values always override inherited values

### Settings Example

```json
"oaicopilot.providers": [
    {
        "key": "modelscope",
        "displayName": "ModelScope",
        "baseUrl": "https://api-inference.modelscope.cn/v1",
        "defaults": {
            "context_length": 256000,
            "max_tokens": 8192,
            "temperature": 0,
            "top_p": 1
        }
    },
    {
        "key": "siliconflow",
        "displayName": "SiliconFlow",
        "baseUrl": "https://api.siliconflow.cn/v1",
        "defaults": {
            "context_length": 128000,
            "max_tokens": 4096,
            "temperature": 0.7
        }
    }
],
"oaicopilot.models": [
    {
        "id": "Qwen/Qwen3-Coder-480B-A35B-Instruct",
        "provider": "modelscope"
        // Inherits: baseUrl, owned_by: "modelscope", and all defaults from provider
    },
    {
        "id": "deepseek-ai/DeepSeek-V3",
        "provider": "modelscope",
        "temperature": 0.5
        // Inherits from provider but overrides temperature
    },
    {
        "id": "Qwen/Qwen2.5-Coder-32B-Instruct",
        "provider": "siliconflow",
        "max_tokens": 16384
        // Inherits from siliconflow provider but overrides max_tokens
    }
]
```

In this example:
- Models reference providers using the `provider` field
- The provider's `key` becomes the model's `owned_by`
- Models inherit `baseUrl` and all `defaults` from the provider
- Individual models can override any inherited setting

---

## (Optional) Multi-Provider Guide

> `owned_by` in model config is used for group apiKey. The storage key is `oaicopilot.apiKey.${owned_by}`.
> When using provider-first configuration, the provider's `key` is automatically used as `owned_by`.

1. Open VS Code Settings and configure `oaicopilot.models` (or use `oaicopilot.providers` for provider-first configuration).
2. Open command center ( Ctrl + Shift + P ), and search "OAICopilot: Set OAI Compatible Multi-Provider Apikey" to configure provider-specific API keys.
3. Open Github Copilot Chat interface.
4. Click the model picker and select "Manage Models...".
5. Choose "OAI Compatible" provider.
6. Select the models you want to add to the model picker.

### Settings Example (Direct Model Configuration)

```json
"oaicopilot.baseUrl": "https://api-inference.modelscope.cn/v1",
"oaicopilot.models": [
    {
        "id": "Qwen/Qwen3-Coder-480B-A35B-Instruct",
        "owned_by": "modelscope",
        "context_length": 256000,
        "max_tokens": 8192,
        "temperature": 0,
        "top_p": 1
    },
    {
        "id": "qwen3-coder",
        "owned_by": "iflow",
        "baseUrl": "https://apis.iflow.cn/v1",
        "context_length": 256000,
        "max_tokens": 8192,
        "temperature": 0,
        "top_p": 1
    }
]
```

---

## (Optional) Multi-config for the same model

You can define multiple configurations for the same model ID by using the `configId` field. This allows you to have the same base model with different settings for different use cases.

To use this feature:

1. Add the `configId` field to your model configuration
2. Each configuration with the same `id` must have a unique `configId`
3. The model will appear as separate entries in the VS Code model picker

### Settings Example

```json
"oaicopilot.models": [
    {
        "id": "glm-4.6",
        "configId": "thinking",
        "owned_by": "zai",
        "temperature": 0.7,
        "top_p": 1,
        "thinking": {
            "type": "enabled"
        }
    },
    {
        "id": "glm-4.6",
        "configId": "no-thinking",
        "owned_by": "zai",
        "temperature": 0,
        "top_p": 1,
        "thinking": {
            "type": "disabled"
        }
    }
]
```

In this example, you'll have three different configurations of the glm-4.6 model available in VS Code:
- `glm-4.6::thinking` - use GLM-4.6 with thinking
- `glm-4.6::no-thinking` - use GLM-4.6 without thinking

---

## Provider Configuration
Providers can be defined to reduce duplication and simplify configuration management. Each provider can specify:

- `key` (required): Canonical provider key (lowercase, used as `owned_by` and for API key storage)
- `displayName`: Display name for the provider
- `baseUrl` (required): Base URL for the provider's API endpoint
- `defaults`: Default parameters that models can inherit, including:
  - All model parameters listed below (context_length, max_tokens, temperature, etc.)
  - Models automatically inherit these defaults but can override any value

When a model specifies a `provider` field, it inherits `baseUrl`, `owned_by` (from provider key), and all defaults from the provider configuration.

---

## Model Parameters
All parameters support individual configuration for different models, providing highly flexible model tuning capabilities.

- `id` (required): Model identifier
- `provider`: Reference to a provider key for inheriting configuration. When specified, the model inherits baseUrl, owned_by, and defaults from the provider
- `configId`: Configuration ID for this model. Allows defining the same model with different settings (e.g. 'glm-4.6::thinking', 'glm-4.6::no-thinking')
- `owned_by`: Model provider (automatically inherited from provider key if `provider` field is used)
- `family`: Model family (e.g., 'gpt-4', 'claude-3', 'gemini'). Enables model-specific optimizations and behaviors. Defaults to 'oai-compatible' if not specified.
- `baseUrl`: Model-specific base URL. If not provided, inherits from provider or falls back to global `oaicopilot.baseUrl`
- `context_length`: The context length supported by the model. Default value is 128000
- `max_tokens`: Maximum number of tokens to generate (range: [1, context_length]). Default value is 4096
- `max_completion_tokens`: Maximum number of tokens to generate (OpenAI new standard parameter)
- `vision`: Whether the model supports vision capabilities. Defaults to false
- `temperature`: Sampling temperature (range: [0, 2]). Lower values make the output more deterministic, higher values more creative. Default value is 0
- `top_p`: Top-p sampling value (range: (0, 1]). Default value is 1
- `top_k`: Top-k sampling value (range: [1, ∞)). Optional parameter
- `min_p`: Minimum probability threshold (range: [0, 1]). Optional parameter
- `frequency_penalty`: Frequency penalty (range: [-2, 2]). Optional parameter
- `presence_penalty`: Presence penalty (range: [-2, 2]). Optional parameter
- `repetition_penalty`: Repetition penalty (range: (0, 2]). Optional parameter
- `enable_thinking`: Enable model thinking and reasoning content display (for non-OpenRouter providers)
- `thinking_budget`: Maximum token count for thinking chain output. Optional parameter
- `reasoning`: OpenRouter reasoning configuration, includes the following options:
  - `enabled`: Enable reasoning functionality (if not specified, will be inferred from effort or max_tokens)
  - `effort`: Reasoning effort level (high, medium, low, minimal, auto)
  - `exclude`: Exclude reasoning tokens from the final response
  - `max_tokens`: Specific token limit for reasoning (Anthropic style, as an alternative to effort)
- `thinking`: Thinking configuration for Zai provider
  - `type`: Set to 'enabled' to enable thinking, 'disabled' to disable thinking
- `reasoning_effort`: Reasoning effort level (OpenAI reasoning configuration)
- `extra`: Extra request parameters that will be used in /chat/completions.
---

## Thanks to

Thanks to all the people who contribute.

- [Contributors](https://github.com/JohnnyZ93/oai-compatible-copilot/graphs/contributors)
- [Hugging Face Chat Extension](https://github.com/huggingface/huggingface-vscode-chat)
- [VS Code Chat Provider API](https://code.visualstudio.com/api/extension-guides/ai/language-model-chat-provider)

---

## Support & License
- Open issues: https://github.com/JohnnyZ93/oai-compatible-copilot/issues
- License: MIT License Copyright (c) 2025 Johnny Zhao
