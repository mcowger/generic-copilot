# Internal Echo Tool

## Overview

The `internal-echo` tool is a special-purpose tool that allows the extension to emit messages that appear as tool calls in the VS Code UI without affecting the LLM's context or being callable by the LLM.

## Purpose

This tool serves as a mechanism to display information in the chat interface that:
1. Looks like a tool call in the UI
2. Does not perform any actual work
3. Does not affect the conversation context sent to the LLM
4. Cannot be invoked by the LLM itself

## Implementation Details

### Tool Registration

The tool is registered in `src/extension.ts` during extension activation:

```typescript
const internalEchoTool = new InternalEchoTool();
const internalEchoRegistration = vscode.lm.registerTool(InternalEchoTool.TOOL_NAME, internalEchoTool);
```

It's also declared in `package.json` under the `languageModelTools` contribution point, as required by VS Code.

### Tool Behavior

The tool implementation is in `src/tools/internalEchoTool.ts`:

- **Input**: Accepts a single `content` parameter containing a markdown-formatted string
- **Output**: Returns the input string as-is, wrapped in a `LanguageModelToolResult`
- **Description**: Explicitly warns that it should NEVER be called by language models

### Context Exclusion

The tool is excluded from LLM context in `src/ai/utils/conversion.ts`:

1. **LM2VercelTool**: Filters out the internal-echo tool when converting VS Code tools to AI SDK format, ensuring the LLM never sees it as an available tool.

2. **LM2VercelMessage (Assistant messages)**: Skips internal-echo tool calls when converting assistant messages to AI SDK format, preventing them from being included in conversation history.

3. **LM2VercelMessage (User messages)**: Skips internal-echo tool results when converting user messages to AI SDK format, preventing results from being included in conversation history.

## Usage

The internal-echo tool can be invoked programmatically by the extension when it needs to display information that should appear as a tool call in the UI but not affect the LLM's behavior:

```typescript
// Example usage (would be added where needed):
// const result = await vscode.lm.invokeTool(
//   "internal-echo",
//   { content: "## Status Update\n\nProcessing completed successfully." },
//   token
// );
```

## Design Rationale

This design allows the extension to:
- Provide rich formatted feedback to users through the chat interface
- Display status updates or informational messages in a consistent format
- Keep the LLM's context clean and focused on actual tool usage
- Prevent the LLM from accidentally invoking internal-only functionality

## Security Considerations

- The tool description explicitly warns against LLM usage
- The tool is filtered from the list of available tools sent to the LLM
- Tool calls and results are excluded from conversation history
- The tool performs no side effects beyond returning the input content
