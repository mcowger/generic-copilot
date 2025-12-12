# Visual Guide: VS Code Settings Integration

## Configuration GUI - Settings Tab

The new Settings tab displays simple, user-friendly settings:

```
┌─────────────────────────────────────────────────────────────┐
│ Generic Copilot Configuration                               │
├─────────────────────────────────────────────────────────────┤
│ [Providers] [Models] [Settings]                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Extension Settings                                           │
│ These settings control the general behavior of the          │
│ Generic Copilot extension. Changes are saved to your        │
│ VS Code settings.                                            │
│                                                              │
│ ─────────────────────────────────────────────────────────── │
│                                                              │
│ Experimental Features                                        │
│ ☐ Enable experimental features                              │
│   Enable this to access experimental features that are      │
│   still in development. This is a sample checkbox setting   │
│   for demonstration purposes.                                │
│                                                              │
│ ─────────────────────────────────────────────────────────── │
│                                                              │
│ Log Level                                                    │
│ [Info             ▼]                                         │
│   Set the logging level for the extension. Higher levels    │
│   include all lower levels. This is a sample dropdown       │
│   setting for demonstration purposes.                        │
│                                                              │
│ ─────────────────────────────────────────────────────────── │
│                                                              │
│ 💡 Tip: These simple settings can also be edited directly   │
│    in VS Code's Settings UI (search for "Generic Copilot")  │
│    or in settings.json.                                      │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│ [Save Configuration] [Open settings.json]                   │
└─────────────────────────────────────────────────────────────┘
```

## VS Code Settings UI

When users open VS Code Settings and search for "Generic Copilot":

```
┌─────────────────────────────────────────────────────────────┐
│ Search settings: Generic Copilot                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ GENERIC COMPATIBLE COPILOT                                   │
│                                                              │
│ Delay                                                        │
│ Fixed delay in milliseconds between consecutive requests.   │
│ Default is 0 (no delay).                                     │
│ [0                                                      ]    │
│                                                              │
│ Enable Experimental Features                                 │
│ Enable experimental features (example checkbox setting).     │
│ ☐ Enable                                                     │
│                                                              │
│ Log Level                                                    │
│ Set the logging level for the extension (example dropdown   │
│ setting).                                                    │
│ [Info             ▼]                                         │
│                                                              │
│ Models                                                       │
│ A list of model configurations. Use the Configuration GUI   │
│ or edit in settings.json.                                    │
│ [Edit in settings.json]                                      │
│                                                              │
│ Providers                                                    │
│ A list of provider configurations. Models can reference     │
│ providers to inherit baseUrl. Use the Configuration GUI or  │
│ edit in settings.json.                                       │
│ [Edit in settings.json]                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## settings.json Editing

When users click "Edit in settings.json" for providers or models:

```json
{
  "generic-copilot.enableExperimentalFeatures": false,
  "generic-copilot.logLevel": "info",
  "generic-copilot.providers": [
    {
      "id": "openai",
      "vercelType": "openai",
      "displayName": "OpenAI",
      "baseUrl": "https://api.openai.com/v1"
    },
    {
      "id": "anthropic",
      "vercelType": "openai-compatible",
      "displayName": "Anthropic",
      "baseUrl": "https://api.anthropic.com/v1"
    }
  ],
  "generic-copilot.models": [
    {
      "id": "gpt-4-turbo",
      "slug": "gpt-4-turbo-preview",
      "provider": "openai",
      "displayName": "GPT-4 Turbo",
      "use_for_autocomplete": false,
      "retries": 3,
      "model_properties": {
        "context_length": 128000,
        "owned_by": "openai",
        "family": "gpt-4"
      },
      "model_parameters": {
        "temperature": 0.7
      }
    }
  ]
}
```

## Integration Points

### 1. Package.json Configuration Schema
- Defines all settings with types, defaults, and descriptions
- Uses `editPresentation: "multilineText"` for complex arrays
- Provides `enum` and `enumDescriptions` for dropdowns

### 2. Configuration Panel (Backend)
- `configurationPanel.ts` handles communication between webview and VS Code
- Loads settings from VS Code configuration
- Saves settings to VS Code configuration
- Supports both simple and complex settings

### 3. React Webview (Frontend)
- `App.tsx` manages state for all settings
- `Settings.tsx` component displays simple settings
- Form components from `@vscode-elements/react-elements`
- Real-time updates synchronized with VS Code settings

### 4. Settings Access Paths

```
User Intent: Configure Extension
        │
        ├─→ VS Code Settings UI
        │   ├─→ Simple settings: Direct editing
        │   └─→ Complex arrays: "Edit in settings.json" link
        │
        ├─→ Configuration GUI Command
        │   ├─→ Providers tab (array editing)
        │   ├─→ Models tab (array editing)
        │   ├─→ Settings tab (simple settings)
        │   └─→ "Open settings.json" button
        │
        └─→ settings.json Direct Edit
            └─→ Full manual control
```

## Benefits

1. **Multiple Access Points**: Users can edit settings through UI, GUI, or JSON
2. **Type Safety**: Schema validation ensures correct data types
3. **User-Friendly**: Simple settings in UI, complex in GUI or JSON
4. **Discoverable**: Settings appear in VS Code's standard settings search
5. **Consistent**: Same settings accessible from multiple interfaces
6. **Extensible**: Easy pattern to add new settings following examples
