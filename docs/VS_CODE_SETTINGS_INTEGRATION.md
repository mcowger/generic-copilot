# VS Code Settings Integration Implementation

This document describes the VS Code settings integration implemented for the generic-copilot extension.

## Overview

The extension now properly integrates with VS Code's settings system, providing:
1. Support for editing complex arrays (providers and models) via settings.json
2. Example simple settings (checkbox and dropdown) that can be adapted for future use
3. A new Settings tab in the configuration GUI

## Changes Made

### 1. package.json Configuration Schema Updates

#### Complex Array Settings
Both `generic-copilot.providers` and `generic-copilot.models` now include:
- `editPresentation: "multilineText"` - This tells VS Code to display these as multiline text in the Settings UI
- Updated descriptions mentioning "Use the Configuration GUI or edit in settings.json"
- VS Code automatically provides an "Edit in settings.json" link for complex object arrays

#### New Simple Settings (Examples for Adaptation)

**Checkbox Setting:**
```json
"generic-copilot.enableExperimentalFeatures": {
  "type": "boolean",
  "default": false,
  "description": "Enable experimental features (example checkbox setting)."
}
```

**Dropdown Setting:**
```json
"generic-copilot.logLevel": {
  "type": "string",
  "enum": ["error", "warn", "info", "debug"],
  "default": "info",
  "description": "Set the logging level for the extension (example dropdown setting).",
  "enumDescriptions": [
    "Show only errors",
    "Show warnings and errors",
    "Show informational messages, warnings, and errors",
    "Show all messages including debug information"
  ]
}
```

### 2. New Settings Component (webview-ui/src/components/Settings.tsx)

A new React component that displays simple settings in the configuration panel:
- Renders checkbox using `VscodeCheckbox`
- Renders dropdown using `VscodeSingleSelect` with `VscodeOption` items
- Includes form helpers with descriptions
- Provides a tip about editing in VS Code Settings UI

### 3. App.tsx Updates

Updated to handle the new settings:
- Added state for `enableExperimentalFeatures` and `logLevel`
- Added new "Settings" tab to the tabs component
- Updated the `InMessage` interface to include the new settings
- Modified `onSave` to include the new settings in save messages
- Added `handleSettingsChange` callback for the Settings component
- Settings are loaded from VS Code configuration on startup
- Settings are saved to VS Code configuration when "Save Configuration" is clicked

### 4. configurationPanel.ts Updates

Backend support for the new settings:
- `_saveConfiguration` now accepts and saves the new settings
- `_sendConfiguration` now loads and sends the new settings to the webview
- Settings are stored in VS Code's global configuration

## How Users Access Settings

### Via VS Code Settings UI
1. Open VS Code Settings (Cmd/Ctrl + ,)
2. Search for "Generic Copilot"
3. See all settings including:
   - **Enable Experimental Features** (checkbox)
   - **Log Level** (dropdown)
   - **Generic Copilot: Providers** (shows "Edit in settings.json" link)
   - **Generic Copilot: Models** (shows "Edit in settings.json" link)

### Via Configuration GUI
1. Run command: "GenericCopilot: Open Configuration GUI"
2. Navigate to the "Settings" tab
3. Toggle checkbox and select dropdown values
4. Click "Save Configuration" to persist changes

### Via settings.json
1. Open settings.json (Cmd/Ctrl + Shift + P → "Preferences: Open Settings (JSON)")
2. Edit any setting directly:
```json
{
  "generic-copilot.enableExperimentalFeatures": true,
  "generic-copilot.logLevel": "debug",
  "generic-copilot.providers": [
    {
      "id": "openai",
      "vercelType": "openai",
      "displayName": "OpenAI"
    }
  ],
  "generic-copilot.models": [
    {
      "id": "gpt-4",
      "slug": "gpt-4",
      "provider": "openai",
      "model_properties": {
        "context_length": 128000
      },
      "model_parameters": {
        "temperature": 0.7
      }
    }
  ]
}
```

Or click "Open settings.json" button in the Configuration GUI.

## Adapting the Example Settings

### To Add a New Checkbox Setting

1. **Add to package.json:**
```json
"generic-copilot.myNewCheckbox": {
  "type": "boolean",
  "default": false,
  "description": "Description of what this checkbox controls."
}
```

2. **Add to Settings.tsx:**
```tsx
// In the props interface
export interface SettingsProps {
  myNewCheckbox: boolean;
  // ... other props
  onChange: (settings: { myNewCheckbox: boolean; /* ... */ }) => void;
}

// In the component
<VscodeCheckbox
  checked={myNewCheckbox}
  onChange={(e: any) => onChange({ ...otherSettings, myNewCheckbox: e.target.checked })}
>
  My new checkbox label
</VscodeCheckbox>
```

3. **Update App.tsx:**
```tsx
// Add state
const [myNewCheckbox, setMyNewCheckbox] = useState(false);

// Load from config
setMyNewCheckbox(msg.myNewCheckbox ?? false);

// Include in save
vscode?.postMessage({ 
  command: 'save', 
  myNewCheckbox,
  // ... other settings
});
```

4. **Update configurationPanel.ts:**
```ts
// In _saveConfiguration
if (myNewCheckbox !== undefined) {
  await config.update("generic-copilot.myNewCheckbox", myNewCheckbox, vscode.ConfigurationTarget.Global);
}

// In _sendConfiguration
const myNewCheckbox = config.get<boolean>("generic-copilot.myNewCheckbox", false);
this._panel.webview.postMessage({
  myNewCheckbox,
  // ... other settings
});
```

### To Add a New Dropdown Setting

1. **Add to package.json:**
```json
"generic-copilot.myNewDropdown": {
  "type": "string",
  "enum": ["option1", "option2", "option3"],
  "default": "option1",
  "description": "Description of what this dropdown controls.",
  "enumDescriptions": [
    "Description of option 1",
    "Description of option 2",
    "Description of option 3"
  ]
}
```

2. **Add to Settings.tsx:**
```tsx
// In the props interface
export interface SettingsProps {
  myNewDropdown: string;
  // ... other props
  onChange: (settings: { myNewDropdown: string; /* ... */ }) => void;
}

// In the component
<VscodeSingleSelect
  value={myNewDropdown}
  onChange={(e: any) => onChange({ ...otherSettings, myNewDropdown: e.target.value })}
>
  <VscodeOption value="option1">Option 1</VscodeOption>
  <VscodeOption value="option2">Option 2</VscodeOption>
  <VscodeOption value="option3">Option 3</VscodeOption>
</VscodeSingleSelect>
```

3. Follow the same pattern as checkbox for App.tsx and configurationPanel.ts

## Technical Notes

### editPresentation Values
- `"multilineText"` - Displays as a multiline text area (used for our complex arrays)
- `"singlelineText"` - Displays as a single line text input
- `"ignore"` - Hides the setting from the Settings UI entirely

### Configuration Target
All settings are saved with `vscode.ConfigurationTarget.Global`, which means they apply across all workspaces. You can also use:
- `vscode.ConfigurationTarget.Workspace` - Workspace-specific settings
- `vscode.ConfigurationTarget.WorkspaceFolder` - Folder-specific settings (multi-root workspaces)

### VS Code Settings UI Behavior
- Boolean settings automatically render as checkboxes
- String settings with `enum` automatically render as dropdowns
- Array settings with complex object items automatically show "Edit in settings.json" link
- The `editPresentation` attribute provides additional control over how settings are displayed

## Testing the Implementation

To test the implementation:

1. **Build the extension:**
   ```bash
   npm run compile:all
   ```

2. **Package the extension (optional):**
   ```bash
   npm run package
   ```

3. **In VS Code:**
   - Open Settings (Cmd/Ctrl + ,)
   - Search for "Generic Copilot"
   - Verify that:
     - "Enable Experimental Features" appears as a checkbox
     - "Log Level" appears as a dropdown with 4 options
     - "Providers" and "Models" show "Edit in settings.json" links

4. **Test Configuration GUI:**
   - Run "GenericCopilot: Open Configuration GUI" command
   - Navigate to Settings tab
   - Toggle checkbox and change dropdown
   - Click "Save Configuration"
   - Verify changes persist in VS Code Settings

5. **Test settings.json editing:**
   - Click "Open settings.json" button in Configuration GUI
   - Manually edit any setting
   - Reopen Configuration GUI and verify changes are reflected
