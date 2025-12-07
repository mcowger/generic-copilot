import {
	LanguageModelChatRequestMessage,
	LanguageModelResponsePart,
	LanguageModelTextPart,
	LanguageModelThinkingPart,
	LanguageModelToolCallPart,
	ProvideLanguageModelChatResponseOptions,
} from "vscode";
import { ModelMessage, StreamTextResult } from "ai";
import { ModelItem } from "../../types";

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
	vercelMessages: ModelMessage[];

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

	/**
	 * Private constructor to enforce singleton pattern
	 */
	private constructor() {}

	public addRequestResponse(incoming: LoggedRequest | LoggedResponse, id?: string): string {
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
		this.logs.unshift(log);

		// Trim to maximum entries
		if (this.logs.length > this.maxEntries) {
			this.logs = this.logs.slice(0, this.maxEntries);
		}
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
		return `interaction_${Date.now()}_${Math.random().toString(36)}`;
	}
}
