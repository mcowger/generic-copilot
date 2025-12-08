import * as vscode from "vscode";
import { TextDecoder } from "util";
import { MessageLogger, LoggedInteraction } from "./ai/utils/messageLogger";
import { convertToolResultToString } from "./ai/utils/conversion";

export class ConsoleViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "generic-copilot.consoleView";
	private _view?: vscode.WebviewView;

	constructor(private readonly _extensionUri: vscode.Uri) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				this._extensionUri,
				vscode.Uri.joinPath(this._extensionUri, "webview-ui"),
				vscode.Uri.joinPath(this._extensionUri, "webview-ui", "dist"),
			],
		};

		// load the react template asynchronously (returns a Promise<string>)
		this._getHtmlForWebview(webviewView.webview).then((html) => (webviewView.webview.html = html));

		webviewView.webview.onDidReceiveMessage((data) => {
			switch (data.type) {
				case "refresh":
					this._refreshData();
					break;
				case "clear":
					MessageLogger.getInstance().clear();
					this._refreshData();
					break;
			}
		});

		const loggerSubscription = MessageLogger.getInstance().onDidLogUpdate(() => {
			this._refreshData();
		});

		webviewView.onDidDispose(() => {
			loggerSubscription.dispose();
		});

		this._refreshData();
	}

	private _refreshData() {
		if (this._view) {
			const logger = MessageLogger.getInstance();
			const logs = logger.get();
			this._view.webview.postMessage({
				type: "update",
				data: this._serializeLogs(logs),
			});
		}
	}

	private _serializeLogs(logs: LoggedInteraction[]): any[] {
		return logs.map((log) => ({
			id: log.id,
			request: log.request
				? {
						timestamp: log.request.timestamp?.toISOString(),
						modelId: log.request.modelConfig.id,
						modelSlug: log.request.modelConfig.slug,
						messageCount: log.request.vscodeMessages.length,
						toolsCount: log.request.vercelTools ? Object.keys(log.request.vercelTools).length : 0,
						messages: log.request.vscodeMessages.map((msg: any) => ({
							role: msg.role,
							// If content is already a raw string, just use it
							content: typeof msg.content === 'string'
								? msg.content
								: // Otherwise it's an array of parts (text parts, tool results, etc.) — preserve structured parts when possible
								  msg.content.map((part: any) => {
									  if (typeof part === 'string') return part;

									  // Standard text parts used by many language model APIs — return raw text
									  if (part.value) return part.value;
									  if (part.text) return part.text;

									  // Tool result parts often expose a `content` property (which may be an array)
									  if (part.content) {
										  // If the tool returned multiple content items filter out cache-control metadata
										  let content = part.content;
										  if (Array.isArray(content)) {
											  content = content.filter((c: any) => !(c && c.mimeType === 'cache_control'));
										  }

										  // Return a structured tool-result object instead of a string so the front-end can render it specially
										  return {
											  type: 'tool-result',
											  toolCallId: part.callId ?? part.toolCallId ?? undefined,
											  output: content,
										  };
									  }

									  // Tool call parts (calls _to_ tools, not results) -- include name and input if present
									  if (part.name || part.input || part.callId || part.toolCallId) {
										  const name = part.name ?? part.toolName ?? '(tool)';
										  const id = part.callId ?? part.toolCallId ?? part.callId ?? '';
										  const input = part.input ?? part.args ?? part.input ?? undefined;
										  const inputStr = input ? JSON.stringify(input, null, 2) : '';
										  // Keep previous string format for tool-calls in requests for now
										  return `[tool-call] ${name}${id ? ` (${id})` : ''}${inputStr ? ` -> ${inputStr}` : ''}`;
									  }

									  // Unknown non-text content — preserve if serializable
									  try {
										  return JSON.parse(JSON.stringify(part));
									  } catch (err) {
										  return '[non-text content]';
									  }
								  }),
						})),
				  }
				: undefined,
			response: log.response
				? {
						timestamp: log.response.timestamp?.toISOString(),
						textPartsCount: log.response.textParts?.length ?? 0,
						thinkingPartsCount: log.response.thinkingParts?.length ?? 0,
						toolCallsCount: log.response.toolCallParts?.length ?? 0,
						textContent: log.response.textParts?.map((p) => p.value).join("") ?? "",
						thinkingContent: log.response.thinkingParts?.map((p) => p.value).join("") ?? "",
						toolCalls:
							log.response.toolCallParts?.map((tc) => ({
								id: tc.callId,
								name: tc.name,
								input: tc.input,
							})) ?? [],
				  }
				: undefined,
		}));
	}

	private async _getHtmlForWebview(webview: vscode.Webview) {
		const nonce = getNonce();
		const assetsRoot = vscode.Uri.joinPath(this._extensionUri, "webview-ui");
		const templatePath = vscode.Uri.joinPath(assetsRoot, "console.html");
		const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, "console.css"));
		const bundleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "webview-ui", "dist", "main.js"));

		const raw = await vscode.workspace.fs.readFile(templatePath);
		const html = new TextDecoder("utf-8").decode(raw);
		return html
			.replaceAll("%CSP_SOURCE%", webview.cspSource)
			.replaceAll("%NONCE%", nonce)
			.replace("%CSS_URI%", cssUri.toString())
			.replace("%SCRIPT_URI%", bundleUri.toString())
	}
}

function getNonce() {
	let text = "";
	const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
