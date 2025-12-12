/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import {
  VscodeCheckbox,
  VscodeSingleSelect,
  VscodeOption,
  VscodeFormHelper,
  VscodeDivider,
} from '@vscode-elements/react-elements';

export interface SettingsProps {
  enableExperimentalFeatures: boolean;
  logLevel: string;
  onChange: (settings: { enableExperimentalFeatures: boolean; logLevel: string }) => void;
}

export const Settings: React.FC<SettingsProps> = ({ 
  enableExperimentalFeatures, 
  logLevel, 
  onChange 
}) => {
  const handleExperimentalChange = (e: any) => {
    onChange({
      enableExperimentalFeatures: e.target.checked,
      logLevel,
    });
  };

  const handleLogLevelChange = (e: any) => {
    onChange({
      enableExperimentalFeatures,
      logLevel: e.target.value,
    });
  };

  return (
    <div style={{ padding: '16px 0' }}>
      <h2>Extension Settings</h2>
      <p style={{ marginBottom: '20px', color: 'var(--vscode-descriptionForeground)' }}>
        These settings control the general behavior of the Generic Copilot extension.
        Changes are saved to your VS Code settings.
      </p>

      <VscodeDivider style={{ margin: '20px 0' }} />

      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
          Experimental Features
        </label>
        <VscodeCheckbox
          checked={enableExperimentalFeatures}
          onChange={handleExperimentalChange}
        >
          Enable experimental features
        </VscodeCheckbox>
        <VscodeFormHelper>
          Enable this to access experimental features that are still in development.
          This is a sample checkbox setting for demonstration purposes.
        </VscodeFormHelper>
      </div>

      <VscodeDivider style={{ margin: '20px 0' }} />

      <div style={{ marginBottom: '24px' }}>
        <label htmlFor="log-level-select" style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
          Log Level
        </label>
        <VscodeSingleSelect
          id="log-level-select"
          value={logLevel}
          onChange={handleLogLevelChange}
        >
          <VscodeOption value="error">Error</VscodeOption>
          <VscodeOption value="warn">Warning</VscodeOption>
          <VscodeOption value="info">Info</VscodeOption>
          <VscodeOption value="debug">Debug</VscodeOption>
        </VscodeSingleSelect>
        <VscodeFormHelper>
          Set the logging level for the extension. Higher levels include all lower levels.
          This is a sample dropdown setting for demonstration purposes.
        </VscodeFormHelper>
      </div>

      <VscodeDivider style={{ margin: '20px 0' }} />

      <div style={{ 
        padding: '12px', 
        background: 'var(--vscode-textCodeBlock-background)',
        borderRadius: '4px',
        marginTop: '20px'
      }}>
        <p style={{ margin: 0, fontSize: '0.9em' }}>
          💡 <strong>Tip:</strong> These simple settings can also be edited directly in VS Code's Settings UI 
          (search for "Generic Copilot") or in settings.json.
        </p>
      </div>
    </div>
  );
};
