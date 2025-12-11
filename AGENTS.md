# AGENTS.md

> **Purpose**: This file provides context, instructions, and rules for AI coding agents working on the `generic-copilot` project. Agents **MUST** read and follow these guidelines.

## 1. Project Overview

`generic-copilot` is a Visual Studio Code extension that integrates any Vercel AI SDK-compatible LLM provider into GitHub Copilot Chat. It leverages the VS Code Language Model API to act as a chat provider.

**Key Features:**
*   Acts as a `languageModelChatProvider`.
*   Supports multiple providers (OpenAI, OpenRouter, Google, etc.) via Vercel AI SDK.
*   Includes a React-based Webview for configuration and monitoring (`webview-ui`).
*   Uses VS Code Secret Storage for API keys.

## 2. Tech Stack & Dependencies

*   **Runtime**: Node.js (VS Code Extension Host).
*   **Language**: TypeScript (Strict mode).
*   **Frameworks**:
    *   **VS Code Extension API**: Uses proposed APIs (`chatProvider`, `languageModel*`).
    *   **Vercel AI SDK**: Core AI logic (`@ai-sdk/openai`, `@ai-sdk/google`, `ai`).
    *   **React**: Used in `webview-ui` for the configuration panel.
*   **Package Manager**: `npm`.

## 3. Development Workflow

### Installation
The project has two distinct parts that need dependency installation:
1.  **Root (Extension)**: Run `npm install` in the project root.
2.  **Webview (UI)**: Run `npm install` in `webview-ui/`.

**Helper Task**: The `shell: Prepare Env` task in VS Code automates this.

### Build Scripts (`package.json`)
*   `npm run compile:all`: Compiles both the extension and the webview.
*   `npm run watch:extension`: Watches `src/` for changes and recompiles.
*   `npm run watch:webview`: Watches `webview-ui/` for changes.
*   `npm run package`: Packages the extension into a `.vsix` file.
*   Do not run terminal commands to verify files - use built in tools where possible.

### Debugging

*   **Reloading**: The extension implements a dev-time auto-restart watcher in `src/extension.ts` that reloads the window when `out/` changes.

## 4. Coding Conventions & Rules

### 🛑 Logging (CRITICAL)
*   **NEVER** use `console.log`, `console.info`, `console.error` or `print`.
*   **ALWAYS** use the `OutputLogger` singleton from `src/outputLogger.ts`.
    *   Import: `import { logger } from "./outputLogger";` (or relative path).
    *   Usage:
        *   `logger.info("Message")`
        *   `logger.debug("Debug info")`
        *   `logger.warn("Warning")`
        *   `logger.error("Error message", errorObj)`

### Error Handling
*   Catch errors explicitly.
*   Log errors using `logger.error()`, passing the error object to capture the stack trace.
*   Show user-facing errors using `vscode.window.showErrorMessage` ONLY if immediate user action is required.

### VS Code API Usage
*   This extension relies on **Proposed APIs**. Ensure `enabledApiProposals` in `package.json` matches the APIs used.
*   Use `vscode.workspace.getConfiguration("generic-copilot")` to access settings.
*   Use `vscode.secrets` for storing sensitive data like API keys.

### Architecture
*   **`src/extension.ts`**: Entry point. Registers providers and commands.
*   **`src/ai/`**: Contains Vercel AI SDK integration.
    *   `providerClientFactory.ts`: Instantiates the correct client based on config.
    *   `providers/`: specific implementations (e.g., `google.ts`, `openai.ts`).
*   **`src/configurationPanel.ts`**: Handles the Webview panel creation and message passing.
*   **`webview-ui/`**: Standalone React application. Builds to `out/webview-ui/`.

### Metadata Cache (important)
*   The cache lives in `src/ai/utils/metadataCache.ts` and is accessed via `CacheRegistry.getCache(name)`.
*   The cache stores `unknown`; **always cast on get/set** to the shape you expect (e.g., `as ToolCallMetadata`). Do not widen the cache type globally.
*   Use named caches per concern (e.g., `toolCallMetadata`, `yourFeatureName`) to avoid cross-contamination. Avoid reusing names across unrelated features.
*   The cache has a size limit (FIFO eviction). Do not store large payloads or secrets; it is meant for transient provider metadata (e.g., Google `thoughtSignature`).
*   If you add a new metadata type, define or import a small interface for it near the usage site and cast explicitly when reading/writing the cache.

## 5. Adding New Providers
1.  Create a new client in `src/ai/providers/` implementing `ProviderClient`.
2.  Update `src/ai/providerClientFactory.ts` to handle the new `vercelType`.
3.  Update `package.json` configuration schema to allow the new type.
4.  Update `webview-ui` components if specific UI handling is needed.

## 6. Modifying Data Models (Configuration)
When adding new properties to `ModelItem` or `ProviderConfig` in `src/types.ts`:
1.  **Update Type Definitions**: Add the property to the interface in `src/types.ts`.
2.  **Update Configuration Schema**: Add the property to `package.json` under `contributes.configuration`.
3.  **Update Webview Data Mapping**:
    *   **CRITICAL**: You **MUST** update the `toGrouped` function in `webview-ui/src/App.tsx` to include the new property. The Webview does not automatically ingest new fields; they must be explicitly mapped.
4.  **Update UI Components**: Update the relevant React components (e.g., `webview-ui/src/components/Models.tsx` or `Providers.tsx`) to display and edit the new field.

---
**Failure to follow these rules, especially regarding logging and build processes, will result in rejected code.**
