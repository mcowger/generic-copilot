/**
 * Generic cache for storing metadata that needs to be preserved across operations.
 *
 * Primary use case: Storing provider-specific metadata (like Google's thoughtSignature)
 * that VSCode doesn't persist on LanguageModelToolCallPart instances.
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
 * Generic cache with a size limit for storing arbitrary data.
 *
 * Memory management: The cache enforces a maximum size limit to prevent unbounded growth.
 * When the limit is reached, the oldest entry is evicted (FIFO).
 *
 * Callers should cast values on get() as needed, e.g.:
 *   cache.get(key) as MyType
 */
export class MetadataCache {
	private cache: Map<string, unknown>;
	private readonly maxSize: number;

	constructor(maxSize: number = 1000) {
		this.cache = new Map();
		this.maxSize = maxSize;
	}

	/**
	 * Store a value in the cache
	 * @param key The unique key to store the value under
	 * @param value The value to store
	 */
	public set(key: string, value: unknown): void {
		logger.debug(`MetadataCache: setting key "${key}"`);
		// Enforce size limit to prevent memory issues
		if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
			// Remove oldest entry (first entry in the Map)
			const firstKey = this.cache.keys().next().value;
			if (firstKey) {
				this.cache.delete(firstKey);
			}
		}
		this.cache.set(key, value);
	}

	/**
	 * Retrieve a value from the cache
	 * @param key The key to look up
	 * @returns The stored value, or undefined if not found
	 */
	public get(key: string): unknown {
		return this.cache.get(key);
	}

	/**
	 * Check if a key exists in the cache
	 * @param key The key to check
	 * @returns True if the key exists
	 */
	public has(key: string): boolean {
		return this.cache.has(key);
	}

	/**
	 * Remove a value from the cache
	 * @param key The key to remove
	 * @returns True if the key was found and removed
	 */
	public delete(key: string): boolean {
		return this.cache.delete(key);
	}

	/**
	 * Clear all cached entries
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

/**
 * Registry of named cache instances.
 */

export class CacheRegistry {
	private static caches: Map<string, MetadataCache> = new Map();

	/**
	 * Get or create a named cache instance.
	 * @param name Unique name for this cache
	 * @param maxSize Maximum number of entries (only used when creating)
	 */
	public static getCache(name: string, maxSize: number = 1000): MetadataCache {
		if (!CacheRegistry.caches.has(name)) {
			CacheRegistry.caches.set(name, new MetadataCache(maxSize));
		}
		return CacheRegistry.caches.get(name)!;
	}

	/**
	 * Clear a specific cache by name
	 */
	public static clearCache(name: string): void {
		CacheRegistry.caches.get(name)?.clear();
	}

	/**
	 * Clear all caches
	 */
	public static clearAll(): void {
		for (const cache of CacheRegistry.caches.values()) {
			cache.clear();
		}
	}
}
