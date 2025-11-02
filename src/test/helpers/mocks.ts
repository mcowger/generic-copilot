import * as vscode from "vscode";

/**
 * Mock secret storage for testing
 */
export class MockSecretStorage implements vscode.SecretStorage {
	private storage = new Map<string, string>();

	async get(key: string): Promise<string | undefined> {
		return this.storage.get(key);
	}

	async store(key: string, value: string): Promise<void> {
		this.storage.set(key, value);
	}

	async delete(key: string): Promise<void> {
		this.storage.delete(key);
	}

	keys(): Thenable<string[]> {
		return Promise.resolve(Array.from(this.storage.keys()));
	}

	onDidChange: vscode.Event<vscode.SecretStorageChangeEvent> =
		new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event;

	clear(): void {
		this.storage.clear();
	}

	has(key: string): boolean {
		return this.storage.has(key);
	}

	getAll(): Map<string, string> {
		return new Map(this.storage);
	}
}

/**
 * Mock cancellation token for testing
 */
export class MockCancellationToken implements vscode.CancellationToken {
	private _isCancellationRequested = false;
	private _emitter = new vscode.EventEmitter<void>();

	get isCancellationRequested(): boolean {
		return this._isCancellationRequested;
	}

	get onCancellationRequested(): vscode.Event<void> {
		return this._emitter.event;
	}

	cancel(): void {
		this._isCancellationRequested = true;
		this._emitter.fire();
	}
}

/**
 * Mock progress reporter for testing
 */
export class MockProgress<T> implements vscode.Progress<T> {
	public reported: T[] = [];

	report(value: T): void {
		this.reported.push(value);
	}

	clear(): void {
		this.reported = [];
	}
}

/**
 * Create mock fetch responses for testing
 */
export function createMockStreamingResponse(chunks: string[]): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		async start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(encoder.encode(chunk));
			}
			controller.close();
		},
	});

	return new Response(stream, {
		status: 200,
		headers: { "Content-Type": "text/event-stream" },
	});
}

/**
 * Create a mock error response
 */
export function createMockErrorResponse(status: number, statusText: string, body?: string): Response {
	return new Response(body || statusText, {
		status,
		statusText,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * Mock fetch function for controlled testing
 */
export class MockFetch {
	private responses: Response[] = [];
	private callCount = 0;

	addResponse(response: Response): void {
		this.responses.push(response);
	}

	async fetch(_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> {
		const response = this.responses[this.callCount] || this.responses[this.responses.length - 1];
		this.callCount++;

		if (!response) {
			throw new Error("No mock response configured");
		}

		return response;
	}

	getCallCount(): number {
		return this.callCount;
	}

	reset(): void {
		this.responses = [];
		this.callCount = 0;
	}
}

/**
 * Create mock VS Code LanguageModelChatRequestMessage
 */
export function createMockChatMessage(
	role: vscode.LanguageModelChatMessageRole,
	parts: (vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart | vscode.LanguageModelToolResultPart)[]
): vscode.LanguageModelChatRequestMessage {
	return {
		role,
		name: "",
		content: parts,
	};
}

/**
 * Create mock configuration
 */
export class MockConfiguration implements vscode.WorkspaceConfiguration {
	private config = new Map<string, unknown>();

	get<T>(section: string, defaultValue?: T): T {
		return (this.config.get(section) as T) ?? (defaultValue as T);
	}

	has(section: string): boolean {
		return this.config.has(section);
	}

	inspect<T>(
		_section: string
	): { key: string; defaultValue?: T; globalValue?: T; workspaceValue?: T; workspaceFolderValue?: T } | undefined {
		return undefined;
	}

	update(section: string, value: unknown): Thenable<void> {
		this.config.set(section, value);
		return Promise.resolve();
	}

	set(section: string, value: unknown): void {
		this.config.set(section, value);
	}

	clear(): void {
		this.config.clear();
	}

	readonly [key: string]: unknown;
}
