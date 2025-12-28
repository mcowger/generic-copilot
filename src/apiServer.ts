import * as vscode from "vscode";
import express, { Request, Response } from "express";
import { Server } from "http";
import { generateText } from "ai";
import { logger } from "./outputLogger";
import { ProviderClientFactory } from "./ai/providerClientFactory";
import { ModelItem, ProviderConfig, ProviderModelConfig } from "./types";
import { getExecutionDataForModel, getModelItemFromString } from "./utils";

// Dynamic import for superjson (ESM module)
let superjson: any;

async function getSuperjson() {
	if (!superjson) {
		superjson = await import("superjson");
	}
	return superjson;
}

export class ApiServer {
	private app: express.Application;
	private server: Server | null = null;
	private port: number = 3000; // Default port
	private secrets: vscode.SecretStorage;

	constructor(secrets: vscode.SecretStorage) {
		this.secrets = secrets;
		this.app = express();
		this.app.use(express.json());
		this.setupRoutes();
	}

	private setupRoutes(): void {
		// Health check endpoint
		this.app.get("/health", (_req: Request, res: Response) => {
			res.json({ status: "ok", service: "generic-copilot-api" });
		});

		// Main AI SDK endpoint
		this.app.post("/v1/ai-sdk", async (req: Request, res: Response) => {
			try {
				await this.handleAiSdkRequest(req, res);
			} catch (error) {
				logger.error("Error handling /v1/ai-sdk request", error);
				res.status(500).json({
					error: "Internal server error",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		});
	}

	/**
	 * Handle POST requests to /v1/ai-sdk endpoint
	 * Deserializes Vercel AI SDK generateText() parameters, executes the request,
	 * and returns serialized results
	 */
	private async handleAiSdkRequest(req: Request, res: Response): Promise<void> {
		logger.info("Received request to /v1/ai-sdk endpoint");

		// Get superjson dynamically
		const sj = await getSuperjson();

		// Deserialize the request body using superjson
		const serializedInput = req.body;
		if (!serializedInput) {
			logger.warn("Missing request body in /v1/ai-sdk request");
			res.status(400).json({ error: "Request body is required" });
			return;
		}

		let deserializedInput: any;
		try {
			deserializedInput = sj.default.deserialize(serializedInput);
			logger.debug("Successfully deserialized request input");
		} catch (error) {
			logger.error("Failed to deserialize request input", error);
			res.status(400).json({
				error: "Invalid request format",
				message: "Failed to deserialize superjson input",
			});
			return;
		}

		// Validate required fields
		if (!deserializedInput.modelId) {
			logger.warn("Missing modelId in deserialized input");
			res.status(400).json({ error: "modelId is required in the input" });
			return;
		}

		try {
			// Get model configuration
			const modelItem = getModelItemFromString(deserializedInput.modelId);
			logger.debug(`Retrieved model configuration for model: ${deserializedInput.modelId}`);

			// Get execution data (provider config, API key)
			const executionData = await getExecutionDataForModel(modelItem, this.secrets);
			logger.debug(`Retrieved execution data for provider: ${executionData.providerConfig.id}`);

			// Get provider client
			const client = ProviderClientFactory.getClient(executionData);
			const languageModel = client.getLanguageModel(modelItem.slug);
			logger.debug(`Got language model for slug: ${modelItem.slug}`);

			// Prepare generateText parameters
			const generateTextParams: any = {
				model: languageModel,
				...deserializedInput,
			};

			// Remove modelId from params as it's not a Vercel AI SDK parameter
			delete generateTextParams.modelId;

			// Execute generateText
			logger.info(`Executing generateText for model: ${deserializedInput.modelId}`);
			const result = await generateText(generateTextParams);
			logger.info("generateText completed successfully");

			// Serialize the result using superjson
			const serializedResult = sj.default.serialize(result);
			logger.debug("Successfully serialized result");

			// Return the serialized result
			res.json(serializedResult);
		} catch (error) {
			logger.error("Error executing generateText", error);
			res.status(500).json({
				error: "Failed to execute AI request",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Start the HTTP server
	 */
	public start(port?: number): Promise<void> {
		if (port) {
			this.port = port;
		}

		return new Promise((resolve, reject) => {
			try {
				this.server = this.app.listen(this.port, () => {
					logger.info(`API server started on port ${this.port}`);
					resolve();
				});

				this.server.on("error", (error: Error) => {
					logger.error("API server error", error);
					reject(error);
				});
			} catch (error) {
				logger.error("Failed to start API server", error);
				reject(error);
			}
		});
	}

	/**
	 * Stop the HTTP server
	 */
	public stop(): Promise<void> {
		return new Promise((resolve) => {
			if (this.server) {
				this.server.close(() => {
					logger.info("API server stopped");
					this.server = null;
					resolve();
				});
			} else {
				resolve();
			}
		});
	}

	/**
	 * Check if the server is running
	 */
	public isRunning(): boolean {
		return this.server !== null;
	}

	/**
	 * Get the current port
	 */
	public getPort(): number {
		return this.port;
	}
}
