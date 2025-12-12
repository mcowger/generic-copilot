# Configuration Guide

Configuration is managed in VS Code's `settings.json` file. You can either edit the JSON directly or use the Configuration GUI (`GenericCopilot: Open Configuration GUI`).

![GUI](/docs/images/gui.png)
![GUI](/docs/images/modelsgui.png)

The configuration is split into two main parts: `providers` and `models`.

## Provider Configuration (`generic-copilot.providers`)

Providers define the connection details for an API endpoint. Models reference a provider to inherit its settings.

**Schema:**

| Field         | Type     | Required | Description                                                                    |
|---------------|----------|----------|--------------------------------------------------------------------------------|
| `id`         | `string` | Yes      | A unique, lowercase identifier for the provider (e.g., "openrouter", "zai").   |
| `vercelType`        | `string` | Yes      | The provider type. Must be one of `openai`, `openai-compatible`, `openrouter`, or `google`. |
| `displayName` | `string` | No       | A user-friendly name for the provider that appears in the UI.                  |
| `baseUrl`     | `string` | No      | The base URL of the provider's API endpoint (e.g., "https://api.example.com/v1"). |
| `headers`     | `object` | No       | Custom HTTP headers to be sent with every request to this provider.            |

## Model Configuration (`generic-copilot.models`)

Models define the specific LLMs you want to use. Each model must be associated with a provider.

**Schema:**

| Field                | Type     | Required | Description                                                                                                                             |
|----------------------|----------|----------|-----------------------------------------------------------------------------------------------------------------------------------------|
| `id`                 | `string` | Yes      | The internal unique identifier.                                       |
| `provider`           | `string` | Yes      | The `id` of a configured provider. The model will inherit `baseUrl` and `headers` from this provider.                                    |
| `slug`               | `string` | Yes      | The actual model value that will be sent to the inference provider.                     |
| `displayName`        | `string` | No       | A user-friendly name for the model. If not set, a name is generated from `id` and `slug`.                                           |
| `use_for_autocomplete` | `boolean` | No      | If set to true, this model will be used for ghost text autocompletions in the editor. Only one model should have this enabled. |
| `retries`            | `number` | No       | Number of retries for failed requests. Defaults to 3.                                                                                   |
| `model_properties`   | `object` | No       | Internal metadata used by the extension to control behavior. These are **not** sent to the provider's API.                              |
| `model_parameters`   | `object` | No       | Parameters that are sent in the body of the request to the provider's API.                                                              |

### `model_properties` Schema

| Field            | Type     | Description                                                                                             |
|------------------|----------|---------------------------------------------------------------------------------------------------------|
| `context_length` | `number` | The maximum context window size for the model. Defaults to `128000`.                                    |
| `owned_by`       | `string` | The provider name. This is typically inherited from the provider's `id` and doesn't need to be set manually. |
| `family`         | `string` | The model family (e.g., "gpt", "claude", "gemini"). Affects how Copilot interacts with the model. Defaults to "generic". |

### `model_parameters` Schema

| Field                   | Type     | Description                                                                                                                            |
|-------------------------|----------|----------------------------------------------------------------------------------------------------------------------------------------|
| `temperature`           | `number` | Controls randomness. Lower values are more deterministic. Range: `[0, 2]`. Defaults to `1`.                                            |
| `extra`                 | `object` | A container for any other parameters you want to send to the API. These are passed through directly.                                   |

## Retries

The extension will automatically retry failed connections and requests, up to the value for `retries`.   When doing so, it will inject a synthetic thinking output into the stream:

![Retry Thinking](/docs/images/retry1.png)

After all retries are exhaused, an error notification will be posted:

![Retry Failure](/docs/images/retryerror.png)

## Autocompletions

You can designate a single model to be used for inline ghost-text autocompletions in the editor. This can be enabled via the checkbox in the Configuration GUI or by setting `"use_for_autocomplete": true` in the model configuration.  If more than 1 model is enabled, behavior is undefined.

**Recommendation:** Autocompletion requires extremely low latency to be useful. It is **strongly recommended** to only use very fast, low-latency models for this feature, such as:
*   `gemini-flash-lite`
*   `codestral`
*   `qwen-2.5-coder-7b`
*   `llama-3-8b`

Using large or reasoning-heavy models (like `gpt-4o` or `claude-3-opus`) will result in a poor user experience due to high latency (and high cost).

---

# Configuration Example

Here is a complete example for your `settings.json` file, demonstrating how to configure multiple providers and models.

```json
{
  "generic-copilot.providers": [
    {
      "id": "openrouter-connection",
      "vercelType": "openrouter",
      "displayName": "OpenRouter",
    },
    {
      "id": "zai",
      "vercelType": "openai-compatible",
      "displayName": "Zai",
      "baseUrl": "https://open.zaidata.com/v1",
      "headers": {
        "X-Source": "vscode-extension"
      },
      {
      "id": "claude-code",
      "vercelType": "claude-code",
      "displayName": "Claude Code",
      "providerSpecificOptions": {
        "pathToClaudeCodeExecutable": "/Users/HOMEDIR/.bin/claude", //Optional
        "permissionMode": "bypassPermissions", //Optional
        "systemPrompt": "", // Optional - will be combined with prompts from Copilot
      }
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
      "id": "claude-code-haiku",
      "slug": "haiku", // can be haiku | sonnet | opus
      "provider": "claude-code",
      "displayName": "Haiku",
      "model_properties": {
        "context_length": 200000
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

# API Key Management

## Per-Provider Keys

Each provider has its own API key stored securely:

- **Storage Key**: `generic-copilot.apiKey.<provider-key>`
- **Example**: For provider `id: "iflow"`, the storage key is `generic-copilot.apiKey.iflow`

# Advanced Configuration

## Custom Headers

Headers can be set at the provider level and will be inherited by all models associated with that provider. See the `Provider Configuration` section for details.


## API Request Format

When making requests to the model provider:

1. **Model ID Mapping**: The `id` from `model_properties` is sent as the `model` parameter in the API request
2. **Parameters Only**: Only `model_parameters` (temperature, max_tokens, etc.) are included in the request body
3. **Excluded Metadata**: `model_properties` like `baseUrl`, `context_length`, and `family` are NOT sent to the API - they're used internally by the extension.
4. **Unknown Keys**: Custom parameters can be added via `model_parameters.extra` and will be passed through to the API


# Tips & Best Practices

## Use family and model names carefully.  Copilot changes behavior based on these names:

### Model Name variations
* gpt-5-codex | gpt-5-codex : uses Codex-style prompt branch
* gpt-5* | gpt-5 : can use apply_patch exclusively; agent prompts differ for gpt-5
* o4-mini | o4-mini : allowed apply_patch and prefers JSON notebook representation
* claude-3.5-sonnet | claude-3.5-sonnet : prefers instructions in user message and after history

### Family Name variations
* GPT family | gpt (excl. gpt-4o) : supports apply_patch, prefers JSON notebook representation
* Claude / Anthropic | claude / Anthropic : supports multi_replace/replace_string, can use replace_string exclusively, MCP image_url disallowed
* Gemini | gemini : supports replace_string, healing/strong-replace hints required, cannot accept image_url in requests. Supports Gemini 3 thought signatures (requires `google` provider).
* Grok | grok-code : supports replace_string and can use replace_string exclusively


## Naming Convention

Use lowercase provider identifiers that match the service name for consistency:
- ✅ `"id": "openai"`
- ✅ `"id": "anthropic"`
- ❌ `"id": "OpenAI"`

## ConfigId for Variants

Use descriptive `configId` values:
- `"thinking"` / `"no-thinking"`
- `"fast"` / `"accurate"`

## Headers for Custom Auth

If a provider uses non-standard authentication, set it in the `headers` object of the provider's configuration.

## Gemini 3 & Thought Signatures

Gemini 3 models (e.g. Gemini 3 Pro) introduce a requirement for preserving "thought signatures" during multi-turn conversations involving function calls.

This extension implements automated handling of these signatures **only when using the `google` provider type**.

To properly support Gemini 3:
1. Use `vercelType: "google"` for your provider configuration.
2. Ensure your model `family` is set to `"gemini"`.

---

# Troubleshooting

## Models Not Appearing

1. Check provider `id` matches exactly in both provider and model config
2. Verify `baseUrl` is correct and accessible
3. Look for errors in VS Code Developer Console (`Help > Toggle Developer Tools`)

## Authentication Errors

1. Verify API key is set: Run "Set Multi-Provider Apikey" command
2. Check if provider requires custom headers in its provider configuration.
3. Ensure `baseUrl` includes correct path (usually `/v1`)

## Provider Not Found

1. Confirm `provider` field in your model configuration matches a provider's `id` exactly (case-sensitive).
2. Check Developer Console for warnings about missing providers.
3. Verify JSON syntax is valid (no trailing commas, quotes closed).
4. Remember: Only `baseUrl` and `headers` are inherited from providers.
