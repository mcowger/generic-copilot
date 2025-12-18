/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import type { ProviderConfig } from '../../../src/types';
import { prettyJson, tryParseJson, } from '../utils';
import {
  VscodeTextfield,
  VscodeTextarea,
  VscodeButton,
  VscodeDivider,
  VscodeFormHelper,
  VscodeCollapsible,
  VscodeSingleSelect,
  VscodeOption,
} from '@vscode-elements/react-elements';

export interface ProvidersProps {
  providers: ProviderConfig[];
  onChange: (providers: ProviderConfig[]) => void;
}

const vercelTypes: ProviderConfig['vercelType'][] = ['openai-compatible', 'openai', 'openrouter', 'google', 'claude-code', 'deepseek', 'anthropic'];

const ProviderItem: React.FC<{
  provider: ProviderConfig;
  index: number;
  onUpdate: (next: ProviderConfig) => void;
  onRemove: () => void;
}> = ({ provider, index, onUpdate, onRemove }) => {
  const updateField = (field: 'id' | 'displayName' | 'baseUrl' | 'vercelType', value: string) => {
    const next: ProviderConfig = { ...provider };
    const v = value === '' ? '' : value;
    if (field === 'id') { next.id = v; }
    if (field === 'displayName') { next.displayName = v || undefined; }
    if (field === 'baseUrl') { next.baseUrl = v; }
    if (field === 'vercelType') { next.vercelType = v as ProviderConfig['vercelType']; }
    onUpdate(next);
  };

  const updateHeaders = (text: string) => {
    const parsed = tryParseJson<Record<string, string>>(text);
    if (parsed === undefined) {
      const next = { ...provider };
      delete next.headers;
      onUpdate(next);
    } else if (typeof parsed === 'string') {
      // keep raw string by storing nothing and letting textarea show text
      // No-op to avoid data loss; we can't store string in headers typed as Record
      onUpdate({ ...provider, headers: provider.headers });
    } else {
      onUpdate({ ...provider, headers: parsed });
    }
  };

  const updateProviderSpecificOptions = (text: string) => {
    const parsed = tryParseJson<Record<string, unknown>>(text);
    if (parsed === undefined) {
      const next = { ...provider };
      delete next.providerSpecificOptions;
      onUpdate(next);
    } else if (typeof parsed === 'string') {
      // keep raw string by storing nothing and letting textarea show text
      // No-op to avoid data loss; we can't store string in providerSpecificOptions typed as Record
      onUpdate({ ...provider, providerSpecificOptions: provider.providerSpecificOptions });
    } else {
      onUpdate({ ...provider, providerSpecificOptions: parsed });
    }
  };

  return (
    <div className="item">
      <VscodeCollapsible heading={`Provider ${index + 1}${provider.displayName ? ` – ${provider.displayName}` : ''}`} alwaysShowHeaderActions>
        <VscodeButton onClick={onRemove} secondary slot="actions">
          Remove
        </VscodeButton>
        <div className="form-field">
          <VscodeFormHelper>Identifier</VscodeFormHelper>
          <VscodeTextfield
            type="text"
            value={(provider.id as unknown as string) ?? ''}
            placeholder="e.g., openai, anthropic"
            onInput={(e: any) => updateField('id', e.currentTarget.value)}
          >
          </VscodeTextfield>
          <VscodeFormHelper style={{ color: 'var(--vscode-errorForeground)', display: provider.id ? 'none' : 'block' }}>
            Identifier is required.  Used for referencing this provider in models.
          </VscodeFormHelper>
        </div>

        <div className="form-field">
          <VscodeFormHelper>Vercel Type (required) *</VscodeFormHelper>
          <VscodeSingleSelect
            value={provider.vercelType ?? ''}
            onChange={(e: any) => updateField('vercelType', e.currentTarget.value)}
          >
            <VscodeOption value="" disabled>Select a type</VscodeOption>
            {vercelTypes.map((t) => (
              <VscodeOption key={t} value={t}>{t}</VscodeOption>
            ))}
          </VscodeSingleSelect>
          <VscodeFormHelper style={{ color: 'var(--vscode-errorForeground)', display: provider.vercelType ? 'none' : 'block' }}>
            Vercel Type is required!
          </VscodeFormHelper>
        </div>

        <div className="form-field">
          <VscodeFormHelper>Display Name</VscodeFormHelper>
          <VscodeTextfield
            type="text"
            value={(provider.displayName as unknown as string) ?? ''}
            onInput={(e: any) => updateField('displayName', e.currentTarget.value)}
          >
          </VscodeTextfield>
        </div>

        <div className="form-field">
          <VscodeFormHelper>Base URL (optional override)</VscodeFormHelper>
          <VscodeTextfield
            type="text"
            value={(provider.baseUrl as unknown as string) ?? ''}
            placeholder="e.g., https://api.openai.com/v1"
            onInput={(e: any) => updateField('baseUrl', e.currentTarget.value)}
          >
          </VscodeTextfield>
        </div>

        <div className="form-field">
          <VscodeFormHelper>Headers (JSON)</VscodeFormHelper>
          <VscodeTextarea
            rows={3 as any}
            placeholder='{"X-Custom-Header":"value"}'
            value={prettyJson(provider.headers)}
            onInput={(e: any) => updateHeaders(e.currentTarget.value)}
          >
          </VscodeTextarea>
          <VscodeFormHelper>Custom headers for this provider (JSON object)</VscodeFormHelper>
        </div>

        <div className="form-field">
          <VscodeFormHelper>Provider-Specific Options (JSON)</VscodeFormHelper>
          <VscodeTextarea
            rows={3 as any}
            placeholder='{"pathToClaudeCodeExecutable":"/path/to/claude","permissionMode":"bypassPermissions"}'
            value={prettyJson(provider.providerSpecificOptions)}
            onInput={(e: any) => updateProviderSpecificOptions(e.currentTarget.value)}
          >
          </VscodeTextarea>
          <VscodeFormHelper>Provider-specific configuration options (JSON object). Used for provider-specific settings like claude-code paths or permission modes.</VscodeFormHelper>
        </div>


      </VscodeCollapsible>
      <VscodeDivider></VscodeDivider>
    </div>

  );
};

export const Providers: React.FC<ProvidersProps> = ({ providers, onChange }) => {
  const addProvider = () => {
    const next: ProviderConfig = { id: '', baseUrl: '', displayName: '', vercelType: 'openai-compatible' } as ProviderConfig;
    onChange([...(providers ?? []), next]);
  };

  const updateAt = (i: number, nextItem: ProviderConfig) => {
    const next = providers.slice();
    next[i] = nextItem;
    onChange(next);
  };

  const removeAt = (i: number) => {
    const next = providers.slice();
    next.splice(i, 1);
    onChange(next);
  };

  if (!providers || providers.length === 0) {
    return (
      <div>
        <VscodeButton onClick={addProvider} secondary style={{ marginTop: '12px', marginBottom: '12px' }}>
          + Add Provider
        </VscodeButton>
        <div className="empty-state">No providers configured. Click "Add Provider" to get started.</div>
      </div>
    );
  }

  return (
    <div>
      <VscodeButton onClick={addProvider} secondary style={{ marginTop: '12px', marginBottom: '12px' }}>
        + Add Provider
      </VscodeButton>
      <div className="item-list">
        {providers.map((p, i) => (
          <ProviderItem
            key={i}
            provider={p}
            index={i}
            onUpdate={(np) => updateAt(i, np)}
            onRemove={() => removeAt(i)}
          />
        ))}
      </div>
    </div>
  );
};

export default Providers;
