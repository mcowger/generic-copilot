import * as vscode from "vscode";

export class OutputLogger {
	private static _instance: OutputLogger;
	private outputChannel: vscode.OutputChannel;

	private constructor() {
		this.outputChannel = vscode.window.createOutputChannel("Generic Copilot");
	}

	public static getInstance(): OutputLogger {
		if (!this._instance) {
			this._instance = new OutputLogger();
		}
		return this._instance;
	}

	public critical(message: string): void {
		const timestamp = new Date().toISOString();
		this.outputChannel.appendLine(`[${timestamp}] [CRITICAL] ${message}`);
	}

	public warn(message: string): void {
		const timestamp = new Date().toISOString();
		this.outputChannel.appendLine(`[${timestamp}] [WARN] ${message}`);
	}

	public debug(message: string): void {
		const timestamp = new Date().toISOString();
		this.outputChannel.appendLine(`[${timestamp}] [DEBUG] ${message}`);
	}

	public info(message: string): void {
		const timestamp = new Date().toISOString();
		this.outputChannel.appendLine(`[${timestamp}] [INFO] ${message}`);
	}

	public log(message: string): void {
		// just an alias
		this.info(message);
	}

	public error(message: string, error?: any): void {
		const timestamp = new Date().toISOString();
		let errorMessage = message;
		if (error) {
			errorMessage += `: ${error instanceof Error ? error.message : String(error)}`;
		}
		this.outputChannel.appendLine(`[${timestamp}] [ERROR] ${errorMessage}`);
		if (error && error instanceof Error && error.stack) {
			this.outputChannel.appendLine(error.stack);
		}
	}

	public show(): void {
		this.outputChannel.show();
	}

	public get channel(): vscode.OutputChannel {
		return this.outputChannel;
	}
}

export const logger = OutputLogger.getInstance();
