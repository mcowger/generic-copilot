import * as vscode from "vscode";
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
				localResourceRoots: [vscode.Uri.joinPath(extensionUri, "out")],
			}
		);

		ConfigurationPanel.currentPanel = new ConfigurationPanel(panel, extensionUri);
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._extensionUri = extensionUri;

		this._update();

		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		this._panel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.command) {
					case "save":
						await this._saveConfiguration(message.providers, message.models);
						return;
					case "load":
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
			const config = vscode.workspace.getConfiguration();
			await config.update("generic-copilot.providers", providers, vscode.ConfigurationTarget.Global);
			await config.update("generic-copilot.models", models, vscode.ConfigurationTarget.Global);

			vscode.window.showInformationMessage("Configuration saved successfully!");

			// Send the updated configuration back to the webview
			await this._sendConfiguration();
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to save configuration: ${error}`);
		}
	}

	private async _sendConfiguration() {
		const config = vscode.workspace.getConfiguration();
		const providers = config.get<ProviderConfig[]>("generic-copilot.providers", []);
		const models = config.get<ModelItem[]>("generic-copilot.models", []);

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

	private _update() {
		const webview = this._panel.webview;
		this._panel.webview.html = this._getHtmlForWebview(webview);
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const nonce = getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Generic Copilot Configuration</title>
	<style>
		body {
			padding: 20px;
			color: var(--vscode-foreground);
			font-family: var(--vscode-font-family);
		}
		
		h1, h2 {
			margin-top: 0;
		}
		
		.section {
			margin-bottom: 30px;
		}
		
		.item-list {
			margin-bottom: 20px;
		}
		
		.item {
			background-color: var(--vscode-editor-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 4px;
			padding: 15px;
			margin-bottom: 10px;
		}
		
		.item-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 10px;
		}
		
		.item-header h3 {
			margin: 0;
			font-size: 1.1em;
		}
		
		.item-actions {
			display: flex;
			gap: 5px;
		}
		
		button {
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 6px 14px;
			cursor: pointer;
			border-radius: 2px;
		}
		
		button:hover {
			background-color: var(--vscode-button-hoverBackground);
		}
		
		button.secondary {
			background-color: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}
		
		button.secondary:hover {
			background-color: var(--vscode-button-secondaryHoverBackground);
		}
		
		.form-group {
			margin-bottom: 12px;
		}
		
		label {
			display: block;
			margin-bottom: 4px;
			font-weight: 500;
		}
		
		input[type="text"],
		input[type="number"],
		select,
		textarea {
			width: 100%;
			padding: 6px;
			background-color: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border);
			border-radius: 2px;
			box-sizing: border-box;
		}
		
		input[type="checkbox"] {
			margin-right: 5px;
		}
		
		.checkbox-label {
			display: flex;
			align-items: center;
		}
		
		.add-button {
			margin-bottom: 15px;
		}
		
		.save-section {
			position: sticky;
			bottom: 0;
			background-color: var(--vscode-editor-background);
			padding: 15px 0;
			border-top: 1px solid var(--vscode-panel-border);
		}
		
		.empty-state {
			padding: 20px;
			text-align: center;
			color: var(--vscode-descriptionForeground);
			background-color: var(--vscode-editor-background);
			border: 1px dashed var(--vscode-panel-border);
			border-radius: 4px;
		}
		
		.collapsible-content {
			margin-top: 10px;
		}
		
		.error {
			color: var(--vscode-errorForeground);
			font-size: 0.9em;
			margin-top: 4px;
		}
	</style>
</head>
<body>
	<h1>Generic Copilot Configuration</h1>
	
	<div class="section">
		<h2>Providers</h2>
		<button class="add-button" onclick="addProvider()">+ Add Provider</button>
		<div id="providers-list" class="item-list"></div>
	</div>
	
	<div class="section">
		<h2>Models</h2>
		<button class="add-button" onclick="addModel()">+ Add Model</button>
		<div id="models-list" class="item-list"></div>
	</div>
	
	<div class="save-section">
		<button onclick="saveConfiguration()">Save Configuration</button>
	</div>

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		
		let providers = [];
		let models = [];
		
		// Request initial configuration
		vscode.postMessage({ command: 'load' });
		
		// Listen for messages from the extension
		window.addEventListener('message', event => {
			const message = event.data;
			switch (message.command) {
				case 'loadConfiguration':
					providers = message.providers || [];
					models = message.models || [];
					renderProviders();
					renderModels();
					break;
			}
		});
		
		function addProvider() {
			const newProvider = {
				key: '',
				baseUrl: '',
				displayName: '',
				defaults: {}
			};
			providers.push(newProvider);
			renderProviders();
		}
		
		function removeProvider(index) {
			providers.splice(index, 1);
			renderProviders();
		}
		
		function addModel() {
			const newModel = {
				id: '',
				provider: '',
				owned_by: ''
			};
			models.push(newModel);
			renderModels();
		}
		
		function removeModel(index) {
			models.splice(index, 1);
			renderModels();
		}
		
		function renderProviders() {
			const container = document.getElementById('providers-list');
			
			if (providers.length === 0) {
				container.innerHTML = '<div class="empty-state">No providers configured. Click "Add Provider" to get started.</div>';
				return;
			}
			
			container.innerHTML = providers.map((provider, index) => {
				let defaultsHtml = '';
				if (provider.defaults) {
					defaultsHtml = '<div class="collapsible-content">' +
						'<div class="form-group">' +
							'<label>Context Length</label>' +
							'<input type="number" value="' + (provider.defaults.context_length || '') + '" ' +
								'onchange="updateProviderDefault(' + index + ', ' + "'context_length'" + ', parseInt(this.value))">' +
						'</div>' +
						'<div class="form-group">' +
							'<label>Max Tokens</label>' +
							'<input type="number" value="' + (provider.defaults.max_tokens || '') + '" ' +
								'onchange="updateProviderDefault(' + index + ', ' + "'max_tokens'" + ', parseInt(this.value))">' +
						'</div>' +
						'<div class="form-group">' +
							'<label>Temperature (0-2)</label>' +
							'<input type="number" step="0.1" value="' + (provider.defaults.temperature != null ? provider.defaults.temperature : '') + '" ' +
								'onchange="updateProviderDefault(' + index + ', ' + "'temperature'" + ', parseFloat(this.value))">' +
						'</div>' +
						'<div class="form-group">' +
							'<label>Top P (0-1)</label>' +
							'<input type="number" step="0.1" value="' + (provider.defaults.top_p != null ? provider.defaults.top_p : '') + '" ' +
								'onchange="updateProviderDefault(' + index + ', ' + "'top_p'" + ', parseFloat(this.value))">' +
						'</div>' +
						'<div class="form-group">' +
							'<label>Family</label>' +
							'<input type="text" value="' + (provider.defaults.family || '') + '" ' +
								'onchange="updateProviderDefault(' + index + ', ' + "'family'" + ', this.value)" ' +
								'placeholder="e.g., gpt-4, claude-3, gemini">' +
						'</div>' +
						'<div class="form-group">' +
							'<label class="checkbox-label">' +
								'<input type="checkbox" ' + (provider.defaults.vision ? 'checked' : '') + ' ' +
									'onchange="updateProviderDefault(' + index + ', ' + "'vision'" + ', this.checked)">' +
								'Vision Support' +
							'</label>' +
						'</div>' +
					'</div>';
				}
				
				return '<div class="item">' +
					'<div class="item-header">' +
						'<h3>Provider ' + (index + 1) + '</h3>' +
						'<div class="item-actions">' +
							'<button class="secondary" onclick="removeProvider(' + index + ')">Remove</button>' +
						'</div>' +
					'</div>' +
					'<div class="form-group">' +
						'<label>Key (required) *</label>' +
						'<input type="text" value="' + (provider.key || '') + '" ' +
							'onchange="updateProvider(' + index + ', ' + "'key'" + ', this.value)" ' +
							'placeholder="e.g., openai, anthropic">' +
						'<div class="error" style="display: ' + (!provider.key ? 'block' : 'none') + '">Key is required</div>' +
					'</div>' +
					'<div class="form-group">' +
						'<label>Display Name</label>' +
						'<input type="text" value="' + (provider.displayName || '') + '" ' +
							'onchange="updateProvider(' + index + ', ' + "'displayName'" + ', this.value)">' +
					'</div>' +
					'<div class="form-group">' +
						'<label>Base URL (required) *</label>' +
						'<input type="text" value="' + (provider.baseUrl || '') + '" ' +
							'onchange="updateProvider(' + index + ', ' + "'baseUrl'" + ', this.value)" ' +
							'placeholder="e.g., https://api.openai.com/v1">' +
						'<div class="error" style="display: ' + (!provider.baseUrl ? 'block' : 'none') + '">Base URL is required</div>' +
					'</div>' +
					'<div class="form-group">' +
						'<label>Headers (JSON)</label>' +
						'<textarea rows="3" ' +
							'onchange="updateProviderHeaders(' + index + ', this.value)" ' +
							"placeholder='" + '{"X-Custom-Header": "value"}' + "'>" + (provider.headers ? JSON.stringify(provider.headers, null, 2) : '') + '</textarea>' +
					'</div>' +
					'<div class="form-group">' +
						'<label class="checkbox-label">' +
							'<input type="checkbox" ' + (provider.defaults ? 'checked' : '') + ' ' +
								'onchange="toggleProviderDefaults(' + index + ', this.checked)">' +
							'Configure Default Parameters' +
						'</label>' +
					'</div>' +
					defaultsHtml +
				'</div>';
			}).join('');
		}
		
		function renderModels() {
			const container = document.getElementById('models-list');
			
			if (models.length === 0) {
				container.innerHTML = '<div class="empty-state">No models configured. Click "Add Model" to get started.</div>';
				return;
			}
			
			const providerOptions = providers.map(p => 
				'<option value="' + p.key + '">' + (p.displayName || p.key) + '</option>'
			).join('');
			
			container.innerHTML = models.map((model, index) => {
				return '<div class="item">' +
					'<div class="item-header">' +
						'<h3>Model ' + (index + 1) + '</h3>' +
						'<div class="item-actions">' +
							'<button class="secondary" onclick="removeModel(' + index + ')">Remove</button>' +
						'</div>' +
					'</div>' +
					'<div class="form-group">' +
						'<label>Model ID (required) *</label>' +
						'<input type="text" value="' + (model.id || '') + '" ' +
							'onchange="updateModel(' + index + ', ' + "'id'" + ', this.value)" ' +
							'placeholder="e.g., gpt-4, claude-3-opus">' +
						'<div class="error" style="display: ' + (!model.id ? 'block' : 'none') + '">Model ID is required</div>' +
					'</div>' +
					'<div class="form-group">' +
						'<label>Display Name</label>' +
						'<input type="text" value="' + (model.displayName || '') + '" ' +
							'onchange="updateModel(' + index + ', ' + "'displayName'" + ', this.value)" ' +
							'placeholder="Optional human-readable name">' +
					'</div>' +
					'<div class="form-group">' +
						'<label>Provider</label>' +
						'<select onchange="updateModel(' + index + ', ' + "'provider'" + ', this.value)">' +
							'<option value="">Select a provider</option>' +
							providerOptions +
						'</select>' +
					'</div>' +
					'<div class="form-group">' +
						'<label>Owned By</label>' +
						'<input type="text" value="' + (model.owned_by || '') + '" ' +
							'onchange="updateModel(' + index + ', ' + "'owned_by'" + ', this.value)" ' +
							'placeholder="e.g., openai, anthropic">' +
					'</div>' +
					'<div class="form-group">' +
						'<label>Config ID</label>' +
						'<input type="text" value="' + (model.configId || '') + '" ' +
							'onchange="updateModel(' + index + ', ' + "'configId'" + ', this.value)" ' +
							'placeholder="Optional: e.g., thinking, fast">' +
					'</div>' +
					'<div class="form-group">' +
						'<label>Base URL (override)</label>' +
						'<input type="text" value="' + (model.baseUrl || '') + '" ' +
							'onchange="updateModel(' + index + ', ' + "'baseUrl'" + ', this.value)" ' +
							'placeholder="Leave empty to use provider base URL">' +
					'</div>' +
					'<div class="form-group">' +
						'<label>Family</label>' +
						'<input type="text" value="' + (model.family || '') + '" ' +
							'onchange="updateModel(' + index + ', ' + "'family'" + ', this.value)" ' +
							'placeholder="e.g., gpt-4, claude-3, gemini">' +
					'</div>' +
					'<div class="form-group">' +
						'<label>Context Length</label>' +
						'<input type="number" value="' + (model.context_length || '') + '" ' +
							'onchange="updateModel(' + index + ', ' + "'context_length'" + ', parseInt(this.value))">' +
					'</div>' +
					'<div class="form-group">' +
						'<label>Max Tokens</label>' +
						'<input type="number" value="' + (model.max_tokens || '') + '" ' +
							'onchange="updateModel(' + index + ', ' + "'max_tokens'" + ', parseInt(this.value))">' +
					'</div>' +
					'<div class="form-group">' +
						'<label>Temperature (0-2)</label>' +
						'<input type="number" step="0.1" value="' + (model.temperature != null ? model.temperature : '') + '" ' +
							'onchange="updateModel(' + index + ', ' + "'temperature'" + ', this.value === ' + "''"+' ? null : parseFloat(this.value))">' +
					'</div>' +
					'<div class="form-group">' +
						'<label>Top P (0-1)</label>' +
						'<input type="number" step="0.1" value="' + (model.top_p != null ? model.top_p : '') + '" ' +
							'onchange="updateModel(' + index + ', ' + "'top_p'" + ', this.value === ' + "''"+' ? null : parseFloat(this.value))">' +
					'</div>' +
					'<div class="form-group">' +
						'<label class="checkbox-label">' +
							'<input type="checkbox" ' + (model.vision ? 'checked' : '') + ' ' +
								'onchange="updateModel(' + index + ', ' + "'vision'" + ', this.checked)">' +
							'Vision Support' +
						'</label>' +
					'</div>' +
				'</div>';
			}).join('');
			
			// Set selected provider values
			models.forEach((model, index) => {
				if (model.provider) {
					const select = document.querySelectorAll('select')[index];
					if (select) {
						select.value = model.provider;
					}
				}
			});
		}
		
		function updateProvider(index, field, value) {
			providers[index][field] = value;
		}
		
		function updateProviderHeaders(index, value) {
			try {
				if (value.trim() === '') {
					delete providers[index].headers;
				} else {
					providers[index].headers = JSON.parse(value);
				}
			} catch (e) {
				// Invalid JSON, keep the old value or ignore
				console.error('Invalid JSON for headers:', e);
			}
		}
		
		function updateProviderDefault(index, field, value) {
			if (!providers[index].defaults) {
				providers[index].defaults = {};
			}
			if (value === '' || (typeof value === 'number' && isNaN(value))) {
				delete providers[index].defaults[field];
			} else {
				providers[index].defaults[field] = value;
			}
		}
		
		function toggleProviderDefaults(index, enabled) {
			if (enabled) {
				providers[index].defaults = {};
			} else {
				delete providers[index].defaults;
			}
			renderProviders();
		}
		
		function updateModel(index, field, value) {
			if (value === '' || (typeof value === 'number' && isNaN(value))) {
				delete models[index][field];
			} else {
				models[index][field] = value;
			}
		}
		
		function saveConfiguration() {
			// Validate providers
			const invalidProviders = providers.filter(p => !p.key || !p.baseUrl);
			if (invalidProviders.length > 0) {
				alert('Please fill in required fields (key and baseUrl) for all providers.');
				return;
			}
			
			// Validate models
			const invalidModels = models.filter(m => !m.id);
			if (invalidModels.length > 0) {
				alert('Please fill in required field (id) for all models.');
				return;
			}
			
			// Clean up empty defaults
			const cleanProviders = providers.map(p => {
				const cleaned = { ...p };
				if (cleaned.defaults && Object.keys(cleaned.defaults).length === 0) {
					delete cleaned.defaults;
				}
				return cleaned;
			});
			
			vscode.postMessage({
				command: 'save',
				providers: cleanProviders,
				models: models
			});
		}
	</script>
</body>
</html>`;
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
