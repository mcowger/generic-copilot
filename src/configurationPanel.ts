import * as vscode from "vscode";
import { TextDecoder } from "util";
import type { ModelItem, ProviderConfig } from "./types";

export class ConfigurationPanel {
	public static currentPanel: ConfigurationPanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionUri: vscode.Uri) {
		const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

		if (ConfigurationPanel.currentPanel) {
			ConfigurationPanel.currentPanel._panel.reveal(column);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			"genericCopilotConfig",
			"Generic Copilot Configuration",
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(extensionUri, "out"),
					vscode.Uri.joinPath(extensionUri, "assets"),
					vscode.Uri.joinPath(extensionUri, "webview-ui", "dist"),
				],
			}
		);

		ConfigurationPanel.currentPanel = new ConfigurationPanel(panel, extensionUri);
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._extensionUri = extensionUri;

		console.log("[ConfigurationPanel] Initializing configuration panel");
		this._update();

		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		this._panel.webview.onDidReceiveMessage(
			async (message) => {
				console.log("[ConfigurationPanel] Received message from webview:", message);
				switch (message.command) {
					case "save":
						console.log("[ConfigurationPanel] Handling save command", {
							providersCount: Array.isArray(message.providers) ? message.providers.length : "n/a",
							modelsCount: Array.isArray(message.models) ? message.models.length : "n/a",
						});
						await this._saveConfiguration(message.providers, message.models);
						return;
					case "openSettings":
						console.log("[ConfigurationPanel] Handling openSettings request from webview");
						// Ask VS Code to open the user settings.json editor
						await vscode.commands.executeCommand('workbench.action.openSettingsJson');
						return;
					case "load":
						console.log("[ConfigurationPanel] Handling load command from webview");
						await this._sendConfiguration();
						return;
				}
			},
			null,
			this._disposables
		);
	}

	private async _saveConfiguration(providers: ProviderConfig[], models: ModelItem[]) {
		try {
			console.log("[ConfigurationPanel] _saveConfiguration called", {
				providers,
				models,
			});
			const config = vscode.workspace.getConfiguration();
			await config.update("generic-copilot.providers", providers, vscode.ConfigurationTarget.Global);
			await config.update("generic-copilot.models", models, vscode.ConfigurationTarget.Global);

			vscode.window.showInformationMessage("Configuration saved successfully!");

			// Send the updated configuration back to the webview
			await this._sendConfiguration();
		} catch (error) {
			console.error("[ConfigurationPanel] Failed to save configuration", error);
			vscode.window.showErrorMessage(`Failed to save configuration: ${error}`);
		}
	}

	private async _sendConfiguration() {
		const config = vscode.workspace.getConfiguration();
		const providers = config.get<ProviderConfig[]>("generic-copilot.providers", []);
		const models = config.get<ModelItem[]>("generic-copilot.models", []);

		console.log("[ConfigurationPanel] Sending configuration to webview", {
			providersCount: providers.length,
			modelsCount: models.length,
		});

		this._panel.webview.postMessage({
			command: "loadConfiguration",
			providers,
			models,
		});
	}

	public dispose() {
		ConfigurationPanel.currentPanel = undefined;

		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private async _update() {
		const webview = this._panel.webview;
		this._panel.webview.html = await this._getReactHtml(webview);
	}

	private async _getReactHtml(webview: vscode.Webview) {
		const nonce = getNonce();
		const assetsRoot = vscode.Uri.joinPath(this._extensionUri, "webview-ui");
		const templatePath = vscode.Uri.joinPath(assetsRoot, "config.html");
		const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, "config.css"));
		const bundleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "webview-ui", "dist", "main.js"));

		const raw = await vscode.workspace.fs.readFile(templatePath);
		let html = new TextDecoder("utf-8").decode(raw);
		html = html
			.replaceAll("%CSP_SOURCE%", webview.cspSource)
			.replaceAll("%NONCE%", nonce)
			.replace("%CSS_URI%", cssUri.toString())
			.replace("%SCRIPT_URI%", bundleUri.toString());
		return html;
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
