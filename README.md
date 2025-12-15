# Generic Provider for Copilot

![Splash Image](/docs/images/splash.jpg)

Use frontier open LLMs like Qwen3 Coder, Kimi K2, DeepSeek V3.1, GLM 4.5 and more in VS Code with GitHub Copilot Chat powered by any Vercel AI-SDK compatible provider 🔥

## Thanks

Heavily inspired (and then extended) by https://github.com/JohnnyZ93/oai-compatible-copilot

## Contributions & PRs

...[are most welcome!](https://github.com/mcowger/generic-copilot)

## ✨ Features

- **Configuration GUI**: Intuitive webview-based interface for managing providers and models with validation and error handling.  Access this with the quick picker entry "GenericCopilot: Open Configuration GUI"
- **Provider-First Configuration**: Define providers once with shared settings (baseUrl, headers, API keys) that are automatically inherited by models
- **Multiple Provider Support**: Manage API keys for unlimited providers with automatic per-provider API key storage using vscode secret storage.
- **Flexible Headers & parameters**: Set custom parameters for any model.
- **Supports Autocompletion and Inline Suggestions**: Configure a model with the 'Use For Autocomplete' option, and it will be used to provide suggestions.
- **Configurable Retries**: Set the number of retries for failed requests on a per-model basis (default: 3).

---

## Requirements

- **VS Code**: 1.105.0 or higher
- **Dependency**: GitHub Copilot Chat extension
- **API Keys**: compatible provider API keys

- **Supported Vercel AI SDK Providers**: This extension currently supports the following provider types: `openai`, `openai-compatible`, `openrouter`, `google`, `deepseek`, and `claude-code` (experimental).

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

Repeat for each provider. Keys are stored securely in VS Code's secret storage as `generic-copilot.apiKey.<provider-id>`.

### 3. Use in Copilot Chat

1. Open GitHub Copilot Chat
2. Click the model picker
3. Select **"Manage Models..."**
4. Choose **"Generic Compatible"** provider
5. Select the models you want to enable
6. Start chatting!

---

## 📖 Configuration Guide

Detailed configuration instructions, including schema definitions, examples, and advanced settings, can be found in [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

## 📖 Console Guide

Detailed description of the Generic Copilot Console can be found in [docs/CONSOLE.md](docs/CONSOLE.md).


---

## 📄 License

- **License**:
MIT License Copyright (c) 2025