/**
 * Generic cache for storing metadata that needs to be preserved across operations.
 *
 * Primary use case: Storing provider-specific metadata (like Google's thoughtSignature)
 * that VSCode doesn't persist on LanguageModelToolCallPart instances.
 *
 * Supports persistence via vscode.Memento (workspaceState) to preserve cache
 * across extension restarts.
 */

import type { JSONValue } from "ai";
import type { Memento } from "vscode";
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
 * Serialized cache data for persistence.
 * Stored as an array of key-value pairs to preserve insertion order for FIFO eviction.
 */
interface SerializedCache {
	entries: Array<[string, unknown]>;
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
	private dirty: boolean = false;

	constructor(maxSize: number = 1000) {
		this.cache = new Map();
		this.maxSize = maxSize;
	}

	/**
	 * Load cache data from a serialized representation.
	 * @param data The serialized cache data
	 */
	public loadFromSerialized(data: SerializedCache): void {
		this.cache.clear();
		if (data?.entries && Array.isArray(data.entries)) {
			for (const [key, value] of data.entries) {
				// Only load up to maxSize entries
				if (this.cache.size >= this.maxSize) {
					break;
				}
				this.cache.set(key, value);
			}
			logger.info(`MetadataCache: Loaded ${this.cache.size} entries from storage`);
		}
		this.dirty = false;
	}

	/**
	 * Serialize cache data for persistence.
	 * @returns The serialized cache data
	 */
	public toSerialized(): SerializedCache {
		return {
			entries: Array.from(this.cache.entries()),
		};
	}

	/**
	 * Check if the cache has been modified since last load/save.
	 */
	public isDirty(): boolean {
		return this.dirty;
	}

	/**
	 * Mark the cache as clean (after saving).
	 */
	public markClean(): void {
		this.dirty = false;
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
		this.dirty = true;
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
		const result = this.cache.delete(key);
		if (result) {
			this.dirty = true;
		}
		return result;
	}

	/**
	 * Clear all cached entries
	 */
	public clear(): void {
		if (this.cache.size > 0) {
			this.dirty = true;
		}
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
 * Storage key prefix for persisted caches in workspaceState.
 */
const CACHE_STORAGE_PREFIX = "generic-copilot.cache.";

/**
 * Storage key for the index of persisted cache names.
 */
const CACHE_INDEX_KEY = "generic-copilot.cache.__index__";

/**
 * Registry of named cache instances with optional persistence support.
 *
 * To enable persistence:
 * 1. Call CacheRegistry.initialize(workspaceState) during extension activation
 * 2. Call CacheRegistry.persistAll() during extension deactivation
 *
 * Without initialization, the cache operates in memory-only mode.
 *
 * The registry automatically restores all previously persisted caches on initialization.
 * New caches can be marked for persistence using markForPersistence().
 */
export class CacheRegistry {
	private static caches: Map<string, MetadataCache> = new Map();
	private static memento: Memento | undefined;
	private static persistentCacheNames: Set<string> = new Set();

	/**
	 * Initialize the cache registry with a VS Code Memento for persistence.
	 * Call this during extension activation.
	 *
	 * Automatically restores all previously persisted caches and marks them for future persistence.
	 *
	 * @param memento The workspaceState Memento from ExtensionContext
	 * @param defaultCacheNames Names of caches to always persist (merged with previously persisted caches)
	 */
	public static initialize(memento: Memento, defaultCacheNames: string[] = ["toolCallMetadata"]): void {
		CacheRegistry.memento = memento;

		// Load the index of previously persisted cache names
		const persistedIndex = memento.get<string[]>(CACHE_INDEX_KEY, []);

		// Merge default caches with previously persisted caches
		CacheRegistry.persistentCacheNames = new Set([...defaultCacheNames, ...persistedIndex]);

		logger.info(
			`CacheRegistry: Initialized with persistence for caches: ${Array.from(CacheRegistry.persistentCacheNames).join(", ")}`
		);

		// Restore all persisted caches
		for (const name of CacheRegistry.persistentCacheNames) {
			CacheRegistry.restoreCache(name);
		}
	}

	/**
	 * Restore a cache from persistent storage.
	 * @param name The name of the cache to restore
	 */
	private static restoreCache(name: string): void {
		if (!CacheRegistry.memento) {
			return;
		}

		const storageKey = CACHE_STORAGE_PREFIX + name;
		const serialized = CacheRegistry.memento.get<SerializedCache>(storageKey);

		if (serialized) {
			const cache = CacheRegistry.getCache(name);
			cache.loadFromSerialized(serialized);
			logger.debug(`CacheRegistry: Restored cache "${name}" from storage`);
		}
	}

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
	 * Mark a cache for persistence.
	 * Call this when creating a new cache that should survive restarts.
	 *
	 * @param name The name of the cache to mark for persistence
	 */
	public static markForPersistence(name: string): void {
		CacheRegistry.persistentCacheNames.add(name);
		logger.debug(`CacheRegistry: Marked cache "${name}" for persistence`);
	}

	/**
	 * Persist a specific cache to storage.
	 * @param name The name of the cache to persist
	 */
	public static async persistCache(name: string): Promise<void> {
		if (!CacheRegistry.memento) {
			logger.debug(`CacheRegistry: No memento configured, skipping persist for "${name}"`);
			return;
		}

		if (!CacheRegistry.persistentCacheNames.has(name)) {
			logger.debug(`CacheRegistry: Cache "${name}" is not marked for persistence`);
			return;
		}

		const cache = CacheRegistry.caches.get(name);
		if (!cache) {
			return;
		}

		if (!cache.isDirty()) {
			logger.debug(`CacheRegistry: Cache "${name}" is clean, skipping persist`);
			return;
		}

		const storageKey = CACHE_STORAGE_PREFIX + name;
		const serialized = cache.toSerialized();
		await CacheRegistry.memento.update(storageKey, serialized);
		cache.markClean();
		logger.info(`CacheRegistry: Persisted cache "${name}" with ${cache.size()} entries`);
	}

	/**
	 * Persist all registered persistent caches to storage.
	 * Call this during extension deactivation.
	 */
	public static async persistAll(): Promise<void> {
		if (!CacheRegistry.memento) {
			logger.debug("CacheRegistry: No memento configured, skipping persistAll");
			return;
		}

		// Persist the index of cache names first
		await CacheRegistry.memento.update(CACHE_INDEX_KEY, Array.from(CacheRegistry.persistentCacheNames));

		const promises: Promise<void>[] = [];
		for (const name of CacheRegistry.persistentCacheNames) {
			promises.push(CacheRegistry.persistCache(name));
		}
		await Promise.all(promises);
		logger.info("CacheRegistry: Persisted all caches");
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

	/**
	 * Check if persistence is configured.
	 */
	public static isPersistenceEnabled(): boolean {
		return CacheRegistry.memento !== undefined;
	}
}
