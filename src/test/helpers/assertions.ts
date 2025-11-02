import * as assert from "assert";
import * as vscode from "vscode";

/**
 * Assert that a value is defined (not undefined or null)
 */
export function assertDefined<T>(value: T | undefined | null, message?: string): asserts value is T {
	assert.ok(value !== undefined && value !== null, message || "Value should be defined");
}

/**
 * Assert that an array contains a specific number of elements
 */
export function assertArrayLength<T>(array: T[], expectedLength: number, message?: string): void {
	assert.strictEqual(
		array.length,
		expectedLength,
		message || `Expected array length ${expectedLength}, got ${array.length}`
	);
}

/**
 * Assert that an array contains at least a minimum number of elements
 */
export function assertArrayMinLength<T>(array: T[], minLength: number, message?: string): void {
	assert.ok(array.length >= minLength, message || `Expected array length >= ${minLength}, got ${array.length}`);
}

/**
 * Assert that a value is a text part
 */
export function assertIsTextPart(part: unknown): asserts part is vscode.LanguageModelTextPart {
	assert.ok(part instanceof vscode.LanguageModelTextPart, "Expected LanguageModelTextPart");
}

/**
 * Assert that a value is a tool call part
 */
export function assertIsToolCallPart(part: unknown): asserts part is vscode.LanguageModelToolCallPart {
	assert.ok(part instanceof vscode.LanguageModelToolCallPart, "Expected LanguageModelToolCallPart");
}

/**
 * Assert that a value is a thinking part
 */
export function assertIsThinkingPart(part: unknown): asserts part is vscode.LanguageModelThinkingPart {
	assert.ok(part instanceof vscode.LanguageModelThinkingPart, "Expected LanguageModelThinkingPart");
}

/**
 * Assert that an error is thrown with a specific message pattern
 */
export async function assertThrowsAsync(
	fn: () => Promise<unknown>,
	expectedMessagePattern?: RegExp | string,
	message?: string
): Promise<void> {
	let thrown = false;
	try {
		await fn();
	} catch (error) {
		thrown = true;
		if (expectedMessagePattern) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			if (typeof expectedMessagePattern === "string") {
				assert.ok(
					errorMessage.includes(expectedMessagePattern),
					message || `Expected error message to include "${expectedMessagePattern}", got: ${errorMessage}`
				);
			} else {
				assert.ok(
					expectedMessagePattern.test(errorMessage),
					message || `Expected error message to match ${expectedMessagePattern}, got: ${errorMessage}`
				);
			}
		}
	}
	assert.ok(thrown, message || "Expected function to throw an error");
}

/**
 * Assert that an object has specific properties
 */
export function assertHasProperties<T extends object>(obj: T, properties: (keyof T)[], message?: string): void {
	for (const prop of properties) {
		assert.ok(prop in obj, message || `Expected object to have property "${String(prop)}"`);
	}
}

/**
 * Assert that a value is within a range
 */
export function assertInRange(value: number, min: number, max: number, message?: string): void {
	assert.ok(value >= min && value <= max, message || `Expected ${value} to be between ${min} and ${max}`);
}
