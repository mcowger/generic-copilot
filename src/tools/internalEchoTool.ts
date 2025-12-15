import * as vscode from "vscode";
import { logger } from "../outputLogger";

/**
 * Input schema for the internal-echo tool.
 */
interface InternalEchoInput {
	/**
	 * The markdown-formatted string to echo back.
	 */
	content: string;
}

/**
 * The internal-echo tool implementation.
 * 
 * This tool accepts a markdown-formatted string and immediately returns it as a successful result.
 * It is designed to allow the extension to emit messages that look like tool calls without
 * performing any actual work or affecting the context of the application.
 * 
 * The tool's description explicitly indicates it should never be called by the LLM.
 */
export class InternalEchoTool implements vscode.LanguageModelTool<InternalEchoInput> {
	/**
	 * The name of the tool as registered with VS Code.
	 */
	static readonly TOOL_NAME = "internal-echo";

	/**
	 * Invokes the tool with the given input and returns the content as-is.
	 * 
	 * @param options The invocation options containing the input content
	 * @param _token Cancellation token (unused)
	 * @returns A LanguageModelToolResult containing the echoed content
	 */
	async invoke(
		options: vscode.LanguageModelToolInvocationOptions<InternalEchoInput>,
		_token: vscode.CancellationToken
	): Promise<vscode.LanguageModelToolResult> {
		logger.debug(`internal-echo tool invoked with content length: ${options.input.content.length}`);
		
		// Simply return the input content as-is
		return new vscode.LanguageModelToolResult([
			new vscode.LanguageModelTextPart(options.input.content)
		]);
	}

	/**
	 * Optional preparation step before invocation.
	 * Returns a custom progress message.
	 * 
	 * @param _options The preparation options
	 * @param _token Cancellation token (unused)
	 * @returns A prepared invocation with a custom message
	 */
	prepareInvocation(
		_options: vscode.LanguageModelToolInvocationPrepareOptions<InternalEchoInput>,
		_token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		return {
			invocationMessage: "Processing internal message..."
		};
	}
}

/**
 * Gets the information object for registering the internal-echo tool with VS Code.
 * 
 * @returns The LanguageModelToolInformation for the internal-echo tool
 */
export function getInternalEchoToolInfo(): vscode.LanguageModelToolInformation {
	return {
		name: InternalEchoTool.TOOL_NAME,
		description: "INTERNAL USE ONLY - This tool should NEVER be called by language models. It is for internal extension use only.",
		inputSchema: {
			type: "object",
			properties: {
				content: {
					type: "string",
					description: "Markdown-formatted content"
				}
			},
			required: ["content"]
		},
		tags: ["internal"]
	};
}
