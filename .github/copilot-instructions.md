# Generic Copilot - Instructions for GitHub Copilot

## Project Overview

`generic-copilot` is a Visual Studio Code extension that integrates any Vercel AI SDK-compatible LLM provider into GitHub Copilot Chat. The extension acts as a `languageModelChatProvider`, allowing users to leverage frontier open LLMs like Qwen3 Coder, Kimi K2, DeepSeek V3.1, GLM 4.5, and more within VS Code.

**Key Features:**
- Acts as a `languageModelChatProvider` using VS Code Language Model API
- Supports multiple providers (OpenAI, OpenRouter, Google, etc.) via Vercel AI SDK
- Includes a React-based Webview for configuration and monitoring
- Uses VS Code Secret Storage for secure API key management
- Provider-first configuration with shared settings inheritance
- Configurable retries and custom parameters per model
- Supports autocompletion and inline suggestions

## Tech Stack

- **Runtime**: Node.js (VS Code Extension Host)
- **Language**: TypeScript (Strict mode enabled)
- **Frameworks & APIs**:
  - VS Code Extension API with proposed APIs (`chatProvider`, `languageModel*`)
  - Vercel AI SDK (`@ai-sdk/openai`, `@ai-sdk/google`, `ai`)
  - React for UI components (`webview-ui`)
- **Package Manager**: npm
- **Build Tools**: TypeScript compiler, esbuild

## Development Workflow

### Installation
The project has two distinct parts requiring separate dependency installation:
1. **Root (Extension)**: Run `npm install` in the project root
2. **Webview (UI)**: Run `npm install` in `webview-ui/`

**Tip**: Use the `shell: Prepare Env` task in VS Code to automate both installations.

### Build & Development Commands
- `npm run compile:all` - Compiles both extension and webview
- `npm run watch:extension` - Watches `src/` for changes and recompiles
- `npm run watch:webview` - Watches `webview-ui/` for changes
- `npm run package` - Packages the extension into a `.vsix` file

### Debugging & Testing
- The extension implements a dev-time auto-restart watcher in `src/extension.ts` that reloads the window when `out/` changes
- Use built-in VS Code debugging tools rather than terminal commands for file verification

## Coding Conventions

### 🛑 Logging (CRITICAL)
**NEVER** use `console.log`, `console.info`, `console.error`, or `print` statements.

**ALWAYS** use the `OutputLogger` singleton from `src/outputLogger.ts`:
```typescript
import { logger } from "./outputLogger";

logger.info("Message");
logger.debug("Debug info");
logger.warn("Warning");
logger.error("Error message", errorObj);
```

### Error Handling
- Catch errors explicitly in all async operations
- Log errors using `logger.error()`, always passing the error object to capture stack traces
- Use `vscode.window.showErrorMessage` ONLY when immediate user action is required
- Don't show error messages for internal/expected errors

### TypeScript Standards
- Strict mode is enabled - maintain type safety
- Use explicit types for function parameters and return values
- Prefer interfaces over type aliases for object shapes
- Use `unknown` over `any` when type is uncertain

### VS Code API Usage
- This extension relies on **Proposed APIs** - ensure `enabledApiProposals` in `package.json` matches APIs used
- Use `vscode.workspace.getConfiguration("generic-copilot")` to access settings
- Use `vscode.secrets` for storing sensitive data like API keys
- Never store API keys in plain text or configuration files

### Code Organization
**Key Files:**
- `src/extension.ts` - Entry point; registers providers and commands
- `src/ai/` - Vercel AI SDK integration
  - `providerClientFactory.ts` - Instantiates correct client based on config
  - `providers/` - Provider-specific implementations (e.g., `google.ts`, `openai.ts`)
- `src/configurationPanel.ts` - Handles Webview panel creation and message passing
- `webview-ui/` - Standalone React application; builds to `out/webview-ui/`

### Metadata Cache (Important)
- Cache lives in `src/ai/utils/metadataCache.ts`, accessed via `CacheRegistry.getCache(name)`
- Cache stores `unknown` type - **always cast on get/set** to expected shape (e.g., `as ToolCallMetadata`)
- Use named caches per concern (e.g., `toolCallMetadata`, `yourFeatureName`) to avoid cross-contamination
- Don't reuse cache names across unrelated features
- Cache has size limit with FIFO eviction
- Don't store large payloads or secrets
- Cache is for transient provider metadata (e.g., Google `thoughtSignature`)

## Adding New Features

### Adding New Providers
1. Create a new client in `src/ai/providers/` implementing `ProviderClient` interface
2. Update `src/ai/providerClientFactory.ts` to handle the new `vercelType`
3. Update `package.json` configuration schema to allow the new provider type
4. Update `webview-ui` components if specific UI handling is needed

### Modifying Configuration Data Models
When adding properties to `ModelItem` or `ProviderConfig` in `src/types.ts`:
1. Update type definitions in `src/types.ts`
2. Update configuration schema in `package.json` under `contributes.configuration`
3. **CRITICAL**: Update the `toGrouped` function in `webview-ui/src/App.tsx` to map the new property (the Webview doesn't auto-ingest new fields)
4. Update relevant React components (`webview-ui/src/components/Models.tsx` or `Providers.tsx`) to display and edit the field

### Testing Changes
- Manually verify all changes by running the extension in debug mode
- Test provider configurations through the GUI
- Verify API key storage and retrieval work correctly
- Test model selection and chat functionality

## Documentation

- [README.md](../README.md) - Main documentation with quick start guide
- [AGENTS.md](../AGENTS.md) - Detailed instructions for AI coding agents
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines
- [CONFIGURATION.md](../docs/CONFIGURATION.md) - Configuration documentation
- [PROVIDERS.md](../PROVIDERS.md) - Provider-specific information

## Security Best Practices

- Never commit API keys or secrets to the repository
- Always use `vscode.secrets` for sensitive data storage
- Validate all user inputs, especially URLs and configuration values
- Use the metadata cache only for non-sensitive transient data
- Review and follow secure coding practices for VS Code extensions

---

**Note**: This extension uses proposed VS Code APIs. Ensure compatibility with the target VS Code version and keep `enabledApiProposals` synchronized with actual usage.
