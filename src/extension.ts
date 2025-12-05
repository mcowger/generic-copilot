import * as vscode from "vscode";
import { ChatModelProvider } from "./provider";
import type { ProviderConfig } from "./types";
import { ConfigurationPanel } from "./configurationPanel";
import { initStatusBar } from "./statusBar";


export function activate(context: vscode.ExtensionContext) {
	// Build a descriptive User-Agent to help quantify API usage
	const ext = vscode.extensions.getExtension("generic-copilot-providers");
	const extVersion = ext?.packageJSON?.version ?? "unknown";
	const vscodeVersion = vscode.version;
	// Keep UA minimal: only extension version and VS Code version
	const ua = `generic-copilot/${extVersion} VSCode/${vscodeVersion}`;

	const tokenCountStatusBarItem: vscode.StatusBarItem = initStatusBar(context);
	const provider = new ChatModelProvider(context.secrets, ua, tokenCountStatusBarItem, context);
	const providerRegistration = vscode.lm.registerLanguageModelChatProvider("generic-copilot", provider);
	context.subscriptions.push(providerRegistration);

	console.debug("GenericCopilot extension activated.");
	// Command to open configuration GUI
	context.subscriptions.push(
		vscode.commands.registerCommand("generic-copilot.openConfiguration", () => {
			ConfigurationPanel.createOrShow(context.extensionUri);
		})
	);


	// Command to refresh model configurations
	context.subscriptions.push(
		vscode.commands.registerCommand("generic-copilot.refresh", async () => {
			try {
				vscode.lm.registerLanguageModelChatProvider("generic-copilot", provider);
				// Also refresh the sidebar
				//sidebarProvider.refresh();
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
				.map((p) => p.key.toLowerCase())
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
				return; // user canceled
			}

			// Get existing API key for selected provider
			const providerKey = `generic-copilot.apiKey.${selectedProvider}`;
			const existing = await context.secrets.get(providerKey);

			// Prompt for API key
			const apiKey = await vscode.window.showInputBox({
				title: `Generic Compatible API Key for ${selectedProvider}`,
				prompt: existing ? `Update API key for ${selectedProvider}` : `Enter API key for ${selectedProvider}`,
				ignoreFocusOut: true,
				password: true,
				value: existing ?? "",
			});

			if (apiKey === undefined) {
				return; // user canceled
			}

			if (!apiKey.trim()) {
				await context.secrets.delete(providerKey);
				vscode.window.showInformationMessage(`API key for ${selectedProvider} cleared.`);
				return;
			}

			await context.secrets.store(providerKey, apiKey.trim());
			vscode.window.showInformationMessage(`API key for ${selectedProvider} saved.`);
		})
	);
}

export function deactivate() {}
