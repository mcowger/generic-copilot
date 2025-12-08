import * as vscode from "vscode";
import { TextDecoder } from "util";
import { MessageLogger, LoggedInteraction } from "./ai/utils/messageLogger";

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
							content:
								typeof msg.content === "string"
									? msg.content
									: msg.content
											.map((part: any) => {
												if (typeof part === "string") return part;
												if (part.value) return part.value;
												if (part.text) return part.text;
												return "[non-text content]";
											})
											.join("\n"),
						})),
				  }
				: undefined,
			response: log.response
				? {
						timestamp: log.response.timestamp?.toISOString(),
						textPartsCount: log.response.textParts?.length ?? 0,
						thinkingPartsCount: log.response.thinkingParts?.length ?? 0,
						toolCallsCount: log.response.toolCallParts?.length ?? 0,
						textContent: log.response.textParts?.map((p) => p.value).join("\n") ?? "",
						thinkingContent: log.response.thinkingParts?.map((p) => p.value).join("\n") ?? "",
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
