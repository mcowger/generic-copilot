# Changelog

## Gemini 3 and earlier Support - v0.12.0

Fully supports Gemini models via the generative language APIs (aka AI Studio, not Vertex, and not via the OpenAI endpoint). Includes support for maintining thought signatures during execution for maximum performance. Tested with dozens of back to back calls, and at least 9 parallel tool calls!

## Interaction Debug Console - v0.11.0

1. Interaction History and Management Pane (Left)
* This pane provides a complete history and management view for all AI interactions.
  * **Interaction List**: Displays a list of all recent interactions, each with:
  * Unique ID: (e.g., 19:35:41-<hash>, 19:35:31-94) for easy reference.
  * **Model Name:** (e.g., hf:MiniMaxAI/MiniMax-M2) identifying which AI model was used.
  * **Timestamp**: (e.g., 7:46 PM) for when the interaction occurred.
  * **Metadata**: (e.g., 25m - 34t) showing the number of messages and tools in the request.
  * **Filtering/Selection**: The ability to select a specific interaction (19:35:31-94 is highlighted) to view its details on the right.

* Control Buttons:
  * **Refresh**: To load the latest interactions. Usually not needed as the list will autoupdate.
  * **Clear All**: To clear the history, useful for starting fresh during a new debugging session.


2. Detailed Interaction View (Right)

This pane provides a comprehensive, structured log of the selected interaction.

* Interaction Metadata: Displays the overall context:
* Interaction ID & Timestamp: (e.g., Interaction: 19:35:31-94 at 7:35:31 PM).
Request Details: Shows the exact input sent to the AI model.
* Model: Confirms the target model (e.g., m2-synthetic (hf:MiniMaxAI/MiniMax-M2)).
Messages, Tools Defined: Displays key parameters of the request, indicating the complexity of the prompt (e.g., 17 Messages, 1 Tools Defined).
* Structured Conversation Log: Breaks down the prompt and response into standard roles:
* System Prompt: The initial instructions guiding the AI's behavior and personality (e.g., "You are an expert AI programming arsaats...").
* User Prompt: The actual request from the user, including <environment_info> which suggests the extension is automatically providing context like open files or selected code.
* Assistant Response: The model's output, which, in this case, demonstrates a tool-use interaction:
* Tool Request: (`Tool Result: (tool) (call_3b4692d3512d48e8b8b7bc71)`:) indicating the AI decided to call an external function/tool.
* Tool Output: The result from the external tool, including a JSON structure and a value containing the generated Markdown (e.g., "3 Facts About Frogs").

## Vercel Based Backend - v0.10.0

Backend Upgrade to Vercel AI SDK
We've upgraded the backend of the AI Chat plugin to use the Vercel AI SDK, bringing several key benefits:

* Access to the best available provider APIs: The SDK ensures your requests always go through the most up-to-date, officially supported endpoints, giving you the latest features, performance, and reliability from each provider.
* Consistency and vendor support: By standardizing on a single SDK, we reduce inconsistencies across providers and simplify troubleshooting, benefiting both users and our development team.
* Extensible provider support: Adding new AI providers is now seamless, allowing us to quickly integrate future models and services without major backend changes.
* OpenAI-compatible support: The SDK includes openai-compatible functionality, enabling connection to any provider that implements the OpenAI API spec—even if it’s not officially supported—offering maximum flexibility and choice.
* This upgrade positions the plugin for easier maintenance, broader provider compatibility, and a more consistent AI experience.

Also squashed bugs:
* Provider dropdowns not saved properly
* Build watcher didn't reliably work for webview