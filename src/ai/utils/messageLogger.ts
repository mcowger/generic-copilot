import {
	LanguageModelChatRequestMessage,
	LanguageModelResponsePart,
	LanguageModelTextPart,
	LanguageModelThinkingPart,
	LanguageModelToolCallPart,
	ProvideLanguageModelChatResponseOptions,
	EventEmitter,
	Event,
} from "vscode";
import { ModelMessage, StreamTextResult, LanguageModelUsage } from "ai";
import { ModelItem } from "../../types";
import { logger } from "../../outputLogger";
/**
 * Types for logging request and response data
 */

/**
 * Represents a request sent to the language model
 */
export interface LoggedRequest {
	type: "request";
	/** Original VS Code messages */
	vscodeMessages: readonly LanguageModelChatRequestMessage[];

	/** Request options */
	vscodeOptions: ProvideLanguageModelChatResponseOptions;

	/** Converted Vercel SDK messages */
	vercelMessages: readonly ModelMessage[];

	/** Converted Vercel SDK messages */
	vercelTools: Record<string, any> | undefined;

	/** Model configuration */
	modelConfig: ModelItem;

	/** Timestamp of the request */
	timestamp?: Date;
}

/**
 * Represents a response received from the language model
 */
export interface LoggedResponse {
	type: "response";
	// /** Vercel SDK streaming response, if applicable */
	vercelStreamingResponse?: StreamTextResult<Record<string, any>, never>;

	textParts?: LanguageModelTextPart[];
	thinkingParts?: LanguageModelThinkingPart[];
	toolCallParts?: LanguageModelToolCallPart[];

	// /** Token usage information from the Vercel AI SDK */
	usage?: LanguageModelUsage;

	// /** Timestamp when response started */
	timestamp?: Date;
}

/**
 * Represents a complete interaction with the language model
 */
export interface LoggedInteraction {
	/** Unique identifier for this interaction */
	id: string;
	/** The request data */
	request?: LoggedRequest;
	/** The response data */
	response?: LoggedResponse;
}

/**
 * Singleton class for logging provider client interactions
 */
export class MessageLogger {
	private static instance: MessageLogger;
	private logs: LoggedInteraction[] = [];
	private maxEntries = 100;

	private _onDidLogUpdate = new EventEmitter<void>();
	public readonly onDidLogUpdate: Event<void> = this._onDidLogUpdate.event;

	/**
	 * Private constructor to enforce singleton pattern
	 */
	private constructor() {}

	public addRequestResponse(incoming: LoggedRequest | LoggedResponse, id?: string): string {
		logger.debug(`Adding request/response log with ID "${id ?? "new"}"`);
		if (!id) {
			id = MessageLogger.generateId();
		}
		let log: LoggedInteraction = { id };
		let maybeLog: LoggedInteraction | undefined = this.logs.find((log) => log.id === id);
		if (maybeLog) {
			log = maybeLog;
		} else {
			log = { id } as LoggedInteraction;
		}
		if (incoming.type === "request") {
			log.request = incoming;
			log.request!.timestamp = new Date();
		} else if (incoming.type === "response") {
			log.response = incoming;
			log.response!.timestamp = new Date();
		}

		// Add to the beginning of the array (most recent first)
		// If it's a new log (not found in existing logs), unshift it
		if (!maybeLog && !this.logs.some((l) => l.id === log.id)) {
			this.logs.unshift(log);
		}

		// Trim to maximum entries
		if (this.logs.length > this.maxEntries) {
			this.logs = this.logs.slice(0, this.maxEntries);
		}

		this._onDidLogUpdate.fire();
		return log.id;
	}

	/**
	 * Get the singleton instance
	 */
	public static getInstance(): MessageLogger {
		if (!MessageLogger.instance) {
			MessageLogger.instance = new MessageLogger();
		}
		return MessageLogger.instance;
	}

	/**
	 * Get all logged interactions
	 */
	public get(): LoggedInteraction[] {
		return [...this.logs];
	}

	/**
	 * Get a specific interaction by ID
	 */
	public getById(id: string): LoggedInteraction | undefined {
		return this.logs.find((log) => log.id === id);
	}

	/**
	 * Clear all logs
	 */
	public clear(): void {
		this.logs = [];
		this._onDidLogUpdate.fire();
	}

	/**
	 * Get the current log count
	 */
	public getCount(): number {
		return this.logs.length;
	}

	/**
	 * Generate a unique ID for an interaction
	 */
	private static generateId(): string {
		const d = new Date();
		const hhmmss = d.toTimeString().slice(0, 8); // "HH:MM:SS"

		// Use milliseconds as deterministic suffix
		const ms = d.getMilliseconds(); // 0-999
		const suffix = ms.toString(36).padStart(2, "0"); // 2 chars base36

		return `${hhmmss}-${suffix}`;
	}
}
