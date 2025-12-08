# Adding New Vercel AI Providers to Generic Copilot

This document outlines all the steps required to add a new Vercel AI provider type to the Generic Copilot extension.

## Overview

The extension currently supports three provider types: `openrouter`, `openai`, and `openai-compatible`. To add a new provider type, you'll need to make changes across multiple files in the codebase.

## Required Changes

### 1. Update the Type Definition

**File**: `src/types.ts`

The `VercelType` union type needs to be extended to include your new provider type:

```typescript
// Line 42
export type VercelType = "openrouter" | "openai" | "openai-compatible" | "your-provider-type";
```

### 2. Update the Provider Client Factory

**File**: `src/ai/providerClientFactory.ts`

Add the following changes:

```typescript
// Import statements (add your provider client)
import { YourProviderProviderClient } from './providers/your-provider';

// Switch statement (add your case)
switch (providerModelConfig.providerConfig.vercelType as VercelType) {
  case 'openrouter':
    client = new OpenRouterProviderClient(providerModelConfig.providerConfig, providerModelConfig.apiKey);
    break;
  case 'openai':
    client = new OpenAIProviderClient(providerModelConfig.providerConfig, providerModelConfig.apiKey);
    break;
  case 'openai-compatible':
    client = new OpenAICompatibleProviderClient(providerModelConfig.providerConfig, providerModelConfig.apiKey);
    break;
  case 'your-provider-type':
    client = new YourProviderProviderClient(providerModelConfig.providerConfig, providerModelConfig.apiKey);
    break;
  default:
    throw new Error(`Unsupported provider type: ${providerModelConfig.providerConfig.vercelType}`);
}
```

### 3. Create Provider Client Implementation

**File**: `src/ai/providers/your-provider.ts` (new file)

Create a new provider client class that extends `ProviderClient`:

```typescript
import {ProviderConfig } from "../../types";
import { createYourProvider } from "@ai-sdk/your-provider-package";
import { ProviderClient } from "../providerClient";

export class YourProviderProviderClient extends ProviderClient {
	constructor(config: ProviderConfig, apiKey: string) {
		super(
			"your-provider-type",
			config,
			createYourProvider({
				apiKey: apiKey,
				...(config.baseUrl && { baseURL: config.baseUrl }),
				...(config.headers && { headers: config.headers }),
			} as YourProviderSettings)
		);
	}
}
```

### 4. Update Webview UI Components

**File**: `webview-ui/src/components/Providers.tsx`

Add your provider type to the dropdown options:

```typescript
// Line 21
const vercelTypes: ProviderConfig['vercelType'][] = ['openai-compatible', 'openai', 'openrouter', 'your-provider-type'];
```

### 5. Update Package Configuration

**File**: `package.json`

Update the JSON schema to include any provider-specific configuration if needed. The current schema already supports any `vercelType` value through validation in the code, but you may want to update documentation.

### 6. Update Documentation

**File**: `README.md`

Update the configuration guide to include your provider type in the table of supported provider types:

```markdown
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | Yes | The provider type. Must be one of `openai`, `openai-compatible`, `openrouter`, or `your-provider-type`. |
```

### 7. Add Dependencies (if needed)

Install any required packages for your provider:

```bash
npm install @ai-sdk/your-provider-package
```

## Implementation Pattern Summary

Adding a new provider follows this pattern:

1. **Type Definition**: Add to `VercelType` union in `types.ts`
2. **Factory Pattern**: Add case to switch statement in `providerClientFactory.ts`
3. **Client Implementation**: Create new provider client class extending `ProviderClient`
4. **UI Integration**: Add to dropdown options in webview
5. **Documentation**: Update README with new provider type
6. **Dependencies**: Install necessary AI SDK packages

## Example: Adding Google Provider

Here's a concrete example of adding a Google provider:

1. **Update `types.ts`**:
   ```typescript
   export type VercelType = "openrouter" | "openai" | "openai-compatible" | "google";
   ```

2. **Update `providerClientFactory.ts`**:
   ```typescript
   import { GoogleProviderClient } from './providers/google';

   // Add case:
   case 'google':
     client = new GoogleProviderClient(providerModelConfig.providerConfig, providerModelConfig.apiKey);
     break;
   ```

3. **Create `src/ai/providers/google.ts`**:
   ```typescript
   import {ProviderConfig } from "../../types";
   import { google } from "@ai-sdk/google";
   import { ProviderClient } from "../providerClient";

   export class GoogleProviderClient extends ProviderClient {
     constructor(config: ProviderConfig, apiKey: string) {
       super(
         "google",
         config,
         google({
           apiKey: apiKey,
           ...(config.baseUrl && { baseURL: config.baseUrl }),
           ...(config.headers && { headers: config.headers }),
         })
       );
     }
   }
   ```

4. **Update `webview-ui/src/components/Providers.tsx`**:
   ```typescript
   const vercelTypes: ProviderConfig['vercelType'][] = ['openai-compatible', 'openai', 'openrouter', 'google'];
   ```

5. **Install dependency**:
   ```bash
   npm install @ai-sdk/google
   ```

## Testing

After implementing a new provider:

1. Test the configuration UI to ensure your provider appears in the dropdown
2. Create a provider configuration with the new type
3. Test model inference with a model using the new provider
4. Verify API calls are correctly routed to your provider's endpoints
5. Test error handling for invalid configurations

## Notes

- Provider types should be lowercase and use hyphens for multi-word names (e.g., "your-provider")
- The `ProviderClient` base class handles common functionality like message conversion
- Each provider client implementation should handle provider-specific API requirements
- Always install the appropriate AI SDK package for your provider
- The webview UI automatically validates that a `vercelType` is selected for each provider