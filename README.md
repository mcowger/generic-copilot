# Generic Provider for Copilot

Use frontier open LLMs like Qwen3 Coder, Kimi K2, DeepSeek V3.1, GLM 4.5 and more in VS Code with GitHub Copilot Chat powered by any OpenAI-compatible provider 🔥

## Thanks

Heavily inspired (and then extended) by https://github.com/JohnnyZ93/oai-compatible-copilot

## ✨ Features

- **Configuration GUI**: Intuitive webview-based interface for managing providers and models with validation and error handling.  Access this with the quick picker entry "GenericCopilot: Open Configuration GUI"
- **Provider-First Configuration**: Define providers once with shared settings (baseUrl, headers, API keys) that are automatically inherited by models
- **Multiple Provider Support**: Manage API keys for unlimited providers with automatic per-provider key storage using vscode secret storage.
- **Flexible Headers & parameters**: Set custom parameters for any model.

---

## Requirements

- **VS Code**: 1.105.0 or higher
- **Dependency**: GitHub Copilot Chat extension
- **API Keys**: OpenAI-compatible provider API keys

- **Supported Vercel AI SDK Providers**: This extension currently supports the following provider types: `openai`, `openai-compatible`, `openrouter`, and `google`.

---

## ⚡ Quick Start

### Option A: Using the Configuration GUI (Recommended)

### 1. Use the GUI

1. **Open Configuration GUI**:
   - Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS)
   - Type "GenericCopilot: Open Configuration GUI"
   - Press Enter

2. **Add Providers**:
   - Click "+ Add Provider"
   - Enter provider id (e.g., "iflow") and base URL
   - Optionally configure default parameters

3. **Add Models**:
   - Click "+ Add Model"
   - Enter model ID and select a provider
   - Configure model-specific settings as needed

4. **Save**: Click "Save Configuration" button


### 2. Set API Keys

If an API key is not found for a provider, you will be prompted in the QuickPick box.

1. Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Run: **"GenericCopilot: Set Generic Compatible Multi-Provider Apikey"**
3. Select your provider (e.g., `iflow`)
4. Enter the API key for that provider

Repeat for each provider. Keys are stored securely in VS Code's secret storage as `generic-copilot.apiKey.<provider-key>`.

### 3. Use in Copilot Chat

1. Open GitHub Copilot Chat
2. Click the model picker
3. Select **"Manage Models..."**
4. Choose **"Generic Compatible"** provider
5. Select the models you want to enable
6. Start chatting!

---

## 📖 Configuration Guide

Configuration is managed in VS Code's `settings.json` file. You can either edit the JSON directly or use the Configuration GUI (`GenericCopilot: Open Configuration GUI`).

The configuration is split into two main parts: `providers` and `models`.

### Provider Configuration (`generic-copilot.providers`)

Providers define the connection details for an API endpoint. Models reference a provider to inherit its settings.

**Schema:**

| Field         | Type     | Required | Description                                                                    |
|---------------|----------|----------|--------------------------------------------------------------------------------|
| `id`         | `string` | Yes      | A unique, lowercase identifier for the provider (e.g., "openrouter", "zai").   |
| `type`        | `string` | Yes      | The provider type. Must be one of `openai`, `openai-compatible`, `openrouter`, or `google`. |
| `displayName` | `string` | No       | A user-friendly name for the provider that appears in the UI.                  |
| `baseUrl`     | `string` | Yes      | The base URL of the provider's API endpoint (e.g., "https://api.example.com/v1"). |
| `headers`     | `object` | No       | Custom HTTP headers to be sent with every request to this provider.            |

### Model Configuration (`generic-copilot.models`)

Models define the specific LLMs you want to use. Each model must be associated with a provider.

**Schema:**

| Field                | Type     | Required | Description                                                                                                                             |
|----------------------|----------|----------|-----------------------------------------------------------------------------------------------------------------------------------------|
| `id`                 | `string` | Yes      | The internal unique identifier.                                       |
| `provider`           | `string` | Yes      | The `id` of a configured provider. The model will inherit `baseUrl` and `headers` from this provider.                                    |
| `slug`               | `string` | Yes      | The actual model value that will be sent to the inference provider.                     |
| `displayName`        | `string` | No       | A user-friendly name for the model. If not set, a name is generated from `id` and `slug`.                                           |
| `model_properties`   | `object` | No       | Internal metadata used by the extension to control behavior. These are **not** sent to the provider's API.                              |
| `model_parameters`   | `object` | No       | Parameters that are sent in the body of the request to the provider's API.                                                              |

#### `model_properties` Schema

| Field            | Type     | Description                                                                                             |
|------------------|----------|---------------------------------------------------------------------------------------------------------|
| `context_length` | `number` | The maximum context window size for the model. Defaults to `128000`.                                    |
| `owned_by`       | `string` | The provider name. This is typically inherited from the provider's `id` and doesn't need to be set manually. |
| `family`         | `string` | The model family (e.g., "gpt", "claude", "gemini"). Affects how Copilot interacts with the model. Defaults to "generic". |

#### `model_parameters` Schema

| Field                   | Type     | Description                                                                                                                            |
|-------------------------|----------|----------------------------------------------------------------------------------------------------------------------------------------|
| `temperature`           | `number` | Controls randomness. Lower values are more deterministic. Range: `[0, 2]`. Defaults to `1`.                                            |
| `extra`                 | `object` | A container for any other parameters you want to send to the API. These are passed through directly.                                   |

---

## ⚙️ Configuration Example

Here is a complete example for your `settings.json` file, demonstrating how to configure multiple providers and models.

```json
{
  "generic-copilot.providers": [
    {
      "id": "openrouter-connection",
      "type": "openrouter",
      "displayName": "OpenRouter",
      "baseUrl": "https://openrouter.ai/api/v1"
    },
    {
      "id": "zai",
      "type": "openai-compatible",
      "displayName": "Zai",
      "baseUrl": "https://open.zaidata.com/v1",
      "headers": {
        "X-Source": "vscode-extension"
      }
    }
  ],
  "generic-copilot.models": [
    {
      "_comment": "A simple model configuration inheriting from OpenRouter.",
      "slug": "claude-sonnet-default",
      "id": "anthropic/claude-3.5-sonnet",
      "provider": "openrouter",
      "model_properties": {
        "context_length": 200000,
        "family": "claude"
      },
      "model_parameters": {
        "temperature": 0.7
      }
    },
    {
      "slug": "glm-4.6-fast",
      "id": "glm-4.6",
      "provider": "zai",
      "displayName": "GLM-4.6 (Fast)",
      "model_properties": {
        "context_length": 256000
      },
      "model_parameters": {
        "temperature": 0.1
      }
    },
    {
      "_comment": "A model with custom parameters passed via the 'extra' field.",
      "slug": "gemini-flash-custom",
      "id": "google/gemini-flash-1.5",
      "provider": "openrouter",
      "model_parameters": {
        "temperature": 0.5,
        "extra": {
          "top_p": 0.9,
          "stop": ["\n"]
        }
      }
    }
  ]
}
```

---

## �🔑 API Key Management

### Per-Provider Keys

Each provider has its own API key stored securely:

- **Storage Key**: `generic-copilot.apiKey.<provider-key>`
- **Example**: For provider `key: "iflow"`, the storage key is `generic-copilot.apiKey.iflow`



## 🎛️ Advanced Configuration

### Custom Headers

Headers can be set at the provider level and will be inherited by all models associated with that provider. See the `Provider Configuration` section for details.


### API Request Format

When making requests to the model provider:

1. **Model ID Mapping**: The `id` from `model_properties` is sent as the `model` parameter in the API request
2. **Parameters Only**: Only `model_parameters` (temperature, max_tokens, etc.) are included in the request body
3. **Excluded Metadata**: `model_properties` like `baseUrl`, `context_length`, and `family` are NOT sent to the API - they're used internally by the extension.
4. **Unknown Keys**: Custom parameters can be added via `model_parameters.extra` and will be passed through to the API


## 💡 Tips & Best Practices

### Use family and model names carefully.  Copilot changes behavior based on these names:

#### Model Name variations
* gpt-5-codex | gpt-5-codex : uses Codex-style prompt branch
* gpt-5* | gpt-5 : can use apply_patch exclusively; agent prompts differ for gpt-5
* o4-mini | o4-mini : allowed apply_patch and prefers JSON notebook representation
* claude-3.5-sonnet | claude-3.5-sonnet : prefers instructions in user message and after history

#### Family Name variations
* GPT family | gpt (excl. gpt-4o) : supports apply_patch, prefers JSON notebook representation
* Claude / Anthropic | claude / Anthropic : supports multi_replace/replace_string, can use replace_string exclusively, MCP image_url disallowed
* Gemini | gemini : supports replace_string, healing/strong-replace hints required, cannot accept image_url in requests
* Grok | grok-code : supports replace_string and can use replace_string exclusively


### Naming Convention

Use lowercase provider keys that match the service name for consistency:
- ✅ `"key": "openai"`
- ✅ `"key": "anthropic"`
- ❌ `"key": "OpenAI"`

### ConfigId for Variants

Use descriptive `configId` values:
- `"thinking"` / `"no-thinking"`
- `"fast"` / `"accurate"`

### Headers for Custom Auth

If a provider uses non-standard authentication, set it in the `headers` object of the provider's configuration.

---

## 🐛 Troubleshooting

### Models Not Appearing

1. Check provider `key` matches exactly in both provider and model config
2. Verify `baseUrl` is correct and accessible
3. Look for errors in VS Code Developer Console (`Help > Toggle Developer Tools`)

### Authentication Errors

1. Verify API key is set: Run "Set Multi-Provider Apikey" command
2. Check if provider requires custom headers in its provider configuration.
3. Ensure `baseUrl` includes correct path (usually `/v1`)

### Provider Not Found

1. Confirm `provider` field in your model configuration matches a provider's `id` exactly (case-sensitive).
2. Check Developer Console for warnings about missing providers.
3. Verify JSON syntax is valid (no trailing commas, quotes closed).
4. Remember: Only `baseUrl` and `headers` are inherited from providers.

---

## 📄 License

- **License**:
MIT License Copyright (c) 2025