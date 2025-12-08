/**
 * Cache for storing provider-specific metadata (like Google's thoughtSignature)
 * that needs to be preserved across conversation turns.
 *
 * This is necessary because VSCode doesn't persist custom properties on
 * LanguageModelToolCallPart instances when they're sent back in conversation history.
 */

import type { JSONValue } from "ai";
import { logger } from "../../outputLogger";
/**
 * Metadata associated with a tool call.
 * Contains provider-specific information that must be preserved across turns.
 *
 * @example
 * // Google's thoughtSignature for Gemini-3 models
 * {
 *   providerMetadata: {
 *     google: {
 *       thoughtSignature: "abc123..."
 *     }
 *   }
 * }
 */
export interface ToolCallMetadata {
	providerMetadata?: Record<string, Record<string, JSONValue>>;
}

/**
 * Singleton class for caching tool call metadata across conversation turns.
 *
 * Memory management: The cache maintains metadata for the lifetime of tool calls
 * in the conversation history. Entries persist across multiple conversions since
 * the same assistant messages are sent repeatedly as part of conversation context.
 * The cache enforces a maximum size limit to prevent unbounded growth.
 */
export class MetadataCache {
	private static instance: MetadataCache;
	private cache: Map<string, ToolCallMetadata>;
	private readonly maxSize: number = 1000; // Safety limit to prevent unbounded growth

	private constructor() {
		this.cache = new Map();
	}

	/**
	 * Get the singleton instance
	 */
	public static getInstance(): MetadataCache {
		if (!MetadataCache.instance) {
			MetadataCache.instance = new MetadataCache();
		}
		return MetadataCache.instance;
	}

	/**
	 * Store metadata for a tool call
	 * @param toolCallId The unique identifier for the tool call
	 * @param metadata The metadata to store
	 */
	public set(toolCallId: string, metadata: ToolCallMetadata): void {
		logger.debug(`Setting metadata for toolCallId "${toolCallId}"`);
		// Enforce size limit to prevent memory issues
		if (this.cache.size >= this.maxSize) {
			// Remove oldest entry (first entry in the Map)
			const firstKey = this.cache.keys().next().value;
			if (firstKey) {
				this.cache.delete(firstKey);
			}
		}
		this.cache.set(toolCallId, metadata);
	}

	/**
	 * Retrieve metadata for a tool call
	 * @param toolCallId The unique identifier for the tool call
	 * @returns The stored metadata, or undefined if not found
	 */
	public get(toolCallId: string): ToolCallMetadata | undefined {
		return this.cache.get(toolCallId);
	}

	/**
	 * Remove metadata for a tool call
	 * @param toolCallId The unique identifier for the tool call
	 */
	public delete(toolCallId: string): void {
		this.cache.delete(toolCallId);
	}

	/**
	 * Clear all cached metadata
	 */
	public clear(): void {
		this.cache.clear();
	}

	/**
	 * Get the number of cached entries
	 */
	public size(): number {
		return this.cache.size;
	}
}
