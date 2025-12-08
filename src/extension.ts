import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { ChatModelProvider } from "./provider";
import type { ProviderConfig } from "./types";
import { ConfigurationPanel } from "./configurationPanel";
import { initStatusBar } from "./statusBar";
import { ConsoleViewProvider } from "./consoleView";
import { parseApiKeys } from "./utils";

function setupDevAutoRestart(context: vscode.ExtensionContext) {
	if (context.extensionMode !== vscode.ExtensionMode.Development) {
		return;
	}

	const outDir = path.join(context.extensionPath, "out");
	if (!fs.existsSync(outDir)) {
		return;
	}

	let restartTimeout: NodeJS.Timeout | undefined;
	const scheduleRestart = () => {
		console.debug(`generic-copilot: file changed, scheduling restart`);
		if (restartTimeout) {
			clearTimeout(restartTimeout);
		}
		restartTimeout = setTimeout(async () => {
			console.debug(`generic-copilot: Reloading extension host window`);
			restartTimeout = undefined;
			await vscode.commands.executeCommand("workbench.action.reloadWindow");
			console.log("generic-copilot: window reload triggered");
		}, 100);
	};

	// Watch the out directory for changes.  Sigh.
	try {
		const watcher = fs.watch(outDir, { recursive: true }, (_eventType, filename) => {
			if (filename?.endsWith(".js") || filename?.endsWith(".js.map")) {
				scheduleRestart();
			}
		});
		context.subscriptions.push({ dispose: () => watcher.close() });
	} catch (e) {
		console.error("Failed to set up dev auto-restart watcher:", e);
	}
}

export function activate(context: vscode.ExtensionContext) {
	// Build a descriptive User-Agent to help quantify API usage.  Who knows why.
	const ext = vscode.extensions.getExtension("generic-copilot-providers");
	const extVersion = ext?.packageJSON?.version ?? "unknown";
	const vscodeVersion = vscode.version;
	// Keep UA minimal: only extension version and VS Code version
	const ua = `generic-copilot/${extVersion} VSCode/${vscodeVersion}`;

	const tokenCountStatusBarItem: vscode.StatusBarItem = initStatusBar(context);
	const provider = new ChatModelProvider(context.secrets, ua, tokenCountStatusBarItem, context);
	const providerRegistration = vscode.lm.registerLanguageModelChatProvider("generic-copilot", provider);
	context.subscriptions.push(providerRegistration);

	// Register Console View
	const consoleViewProvider = new ConsoleViewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ConsoleViewProvider.viewType, consoleViewProvider)
	);

	console.debug("GenericCopilot extension activated.");
	// Command to open configuration GUI
	context.subscriptions.push(
		vscode.commands.registerCommand("generic-copilot.openConfiguration", () => {
			ConfigurationPanel.createOrShow(context.extensionUri);
		})
	);

	// Command to refresh model configurations
	// Not sure this fully works.
	context.subscriptions.push(
		vscode.commands.registerCommand("generic-copilot.refresh", async () => {
			try {
				vscode.lm.registerLanguageModelChatProvider("generic-copilot", provider);
				vscode.window.showInformationMessage("GenericCopilot model configurations refreshed.");
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				vscode.window.showErrorMessage(`Failed to refresh GenericCopilot models: ${msg}`);
			}
		})
	);

	// Management command to configure provider-specific API keys
	context.subscriptions.push(
		vscode.commands.registerCommand("generic-copilot.setProviderApikey", async () => {
			// Get provider list from configuration
			const config = vscode.workspace.getConfiguration();
			const configuredProviders = config.get<ProviderConfig[]>("generic-copilot.providers", []);

			// Extract unique providers from models (with resolution) and configured providers

			const providersFromConfig = configuredProviders
				.map((p) => p.id.toLowerCase())
				.filter((p) => p && p.trim() !== "");

			// Combine and deduplicate all providers
			const providers = Array.from(new Set([...providersFromConfig])).sort();

			if (providers.length === 0) {
				vscode.window.showErrorMessage(
					"No providers found in generic-copilot.models or generic-copilot.providers configuration. Please configure providers or models first."
				);
				return;
			}

			// Let user select provider
			const selectedProvider = await vscode.window.showQuickPick(providers, {
				title: "Select Provider",
				placeHolder: "Select a provider to configure API key",
			});

			if (!selectedProvider) {
				return;
			}

			// Get existing API keys for selected provider
			const providerKey = `generic-copilot.apiKey.${selectedProvider}`;
			const existing = await context.secrets.get(providerKey);
			const existingKeys = existing ? parseApiKeys(existing) : [];

			// Show action menu
			const actions = [
				{ label: "Add new API key", action: "add" },
				...(existingKeys.length > 0 ? [{ label: "Remove an API key", action: "remove" }] : []),
				...(existingKeys.length > 0 ? [{ label: "View current API keys", action: "view" }] : []),
				...(existingKeys.length > 0 ? [{ label: "Clear all API keys", action: "clear" }] : []),
			];

			const selectedAction = await vscode.window.showQuickPick(actions, {
				title: `Manage API Keys for ${selectedProvider}`,
				placeHolder: `Current: ${existingKeys.length} key(s)`,
			});

			if (!selectedAction) {
				return;
			}

			switch (selectedAction.action) {
				case "add": {
					const apiKey = await vscode.window.showInputBox({
						title: `Add API Key for ${selectedProvider}`,
						prompt: `Enter a new API key for ${selectedProvider}`,
						ignoreFocusOut: true,
						password: true,
					});

					if (apiKey === undefined) {
						return; // user canceled
					}

					if (!apiKey.trim()) {
						vscode.window.showWarningMessage("API key cannot be empty.");
						return;
					}

					const trimmedKey = apiKey.trim();
					if (existingKeys.includes(trimmedKey)) {
						vscode.window.showWarningMessage("This API key already exists.");
						return;
					}

					const updatedKeys = [...existingKeys, trimmedKey];
					await context.secrets.store(providerKey, JSON.stringify(updatedKeys));
					vscode.window.showInformationMessage(`API key added for ${selectedProvider}. Total: ${updatedKeys.length} key(s).`);
					break;
				}

				case "remove": {
					// Show masked keys for selection
					const maskedKeys = existingKeys.map((key, index) => ({
						label: `Key ${index + 1}: ${key.substring(0, 8)}...${key.substring(key.length - 4)}`,
						index: index,
					}));

					const selectedKey = await vscode.window.showQuickPick(maskedKeys, {
						title: `Remove API Key for ${selectedProvider}`,
						placeHolder: "Select an API key to remove",
					});

					if (!selectedKey) {
						return;
					}

					const updatedKeys = existingKeys.filter((_, idx) => idx !== selectedKey.index);
					if (updatedKeys.length === 0) {
						await context.secrets.delete(providerKey);
						vscode.window.showInformationMessage(`All API keys cleared for ${selectedProvider}.`);
					} else {
						await context.secrets.store(providerKey, JSON.stringify(updatedKeys));
						vscode.window.showInformationMessage(`API key removed for ${selectedProvider}. Remaining: ${updatedKeys.length} key(s).`);
					}
					break;
				}

				case "view": {
					const maskedKeys = existingKeys.map((key, index) => 
						`Key ${index + 1}: ${key.substring(0, 8)}...${key.substring(key.length - 4)}`
					).join('\n');
					vscode.window.showInformationMessage(
						`API Keys for ${selectedProvider} (${existingKeys.length}):\n\n${maskedKeys}`,
						{ modal: true }
					);
					break;
				}

				case "clear": {
					const confirm = await vscode.window.showWarningMessage(
						`Are you sure you want to clear all ${existingKeys.length} API key(s) for ${selectedProvider}?`,
						{ modal: true },
						"Yes, clear all"
					);

					if (confirm === "Yes, clear all") {
						await context.secrets.delete(providerKey);
						vscode.window.showInformationMessage(`All API keys cleared for ${selectedProvider}.`);
					}
					break;
				}
			}
		})
	);

	setupDevAutoRestart(context);
}

export function deactivate() {}
