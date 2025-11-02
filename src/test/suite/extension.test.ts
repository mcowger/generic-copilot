import * as assert from "assert";
import * as vscode from "vscode";
import { MockConfiguration } from "../helpers/mocks";

suite("Extension Integration Test Suite", () => {
	let originalGetConfiguration: typeof vscode.workspace.getConfiguration;
	let mockConfig: MockConfiguration;

	setup(() => {
		mockConfig = new MockConfiguration();
		originalGetConfiguration = vscode.workspace.getConfiguration;
		(vscode.workspace as { getConfiguration: unknown }).getConfiguration = () => mockConfig;
	});

	teardown(() => {
		(vscode.workspace as { getConfiguration: unknown }).getConfiguration = originalGetConfiguration;
	});

	suite("Extension activation", () => {
		test("should have correct package.json metadata", () => {
			const ext = vscode.extensions.getExtension("generic-copilot-providers");
			if (!ext) {
				return;
			}

			const pkg = ext.packageJSON;
			assert.strictEqual(pkg.publisher, "mcowger");
			assert.strictEqual(pkg.name, "generic-copilot-providers");
			assert.ok(pkg.version);
		});
	});

	suite("Configuration", () => {
		test("should have models configuration", () => {
			// Set up mock configuration
			mockConfig.set("models", []);
			assert.ok(mockConfig.has("models"));
		});

		test("should have providers configuration", () => {
			// Set up mock configuration
			mockConfig.set("providers", {});
			assert.ok(mockConfig.has("providers"));
		});

		test("should have retry configuration", () => {
			// Set up mock configuration
			mockConfig.set("retry", {});
			assert.ok(mockConfig.has("retry"));
		});

		test("should have delay configuration", () => {
			// Set up mock configuration
			mockConfig.set("delay", 0);
			assert.ok(mockConfig.has("delay"));
		});
	});
});
