import React from 'react';
import type { ProviderConfig, ModelProperties, ModelParameters } from '../../../src/types';
import { prettyJson, tryParseJson, parseFloatOrUndef, parseIntOrUndef } from '../utils';
import {
  VscodeTextfield,
  VscodeTextarea,
  VscodeCheckbox,
  VscodeButton,
  VscodeDivider,
  VscodeFormGroup,
  VscodeFormHelper,
  VscodeCollapsible,
} from '@vscode-elements/react-elements';

export interface ProvidersProps {
  providers: ProviderConfig[];
  onChange: (providers: ProviderConfig[]) => void;
}

const ProviderItem: React.FC<{
  provider: ProviderConfig;
  index: number;
  onUpdate: (next: ProviderConfig) => void;
  onRemove: () => void;
}> = ({ provider, index, onUpdate, onRemove }) => {
  const updateField = (field: 'key' | 'displayName' | 'baseUrl', value: string) => {
    const next: ProviderConfig = { ...provider };
    const v = value === '' ? '' : value;
    if (field === 'key') { next.key = v; }
    if (field === 'displayName') { next.displayName = v || undefined; }
    if (field === 'baseUrl') { next.baseUrl = v; }
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

  const toggleDefaults = (enabled: boolean) => {
    if (enabled) {
      onUpdate({ ...provider, defaults: provider.defaults ?? { model_properties: {}, model_parameters: {} } });
    } else {
      const next = { ...provider };
      delete next.defaults;
      onUpdate(next);
    }
  };

  const updateDefault = (
    bucket: 'model_properties' | 'model_parameters',
    field: keyof ModelProperties | keyof ModelParameters | string,
    value: unknown
  ) => {
    const nextDefaults = provider.defaults ?? { model_properties: {}, model_parameters: {} };
    const newDefaults: NonNullable<ProviderConfig['defaults']> = {
      model_properties: { ...(nextDefaults.model_properties ?? {}) },
      model_parameters: { ...(nextDefaults.model_parameters ?? {}) },
    };
    if (bucket === 'model_properties') {
      const target = newDefaults.model_properties as Record<string, unknown>;
      if (value === '' || (typeof value === 'number' && Number.isNaN(value))) {
        delete target[field as string];
      } else {
        target[field as string] = value;
      }
    } else {
      const target = newDefaults.model_parameters as Record<string, unknown>;
      if (value === '' || (typeof value === 'number' && Number.isNaN(value))) {
        delete target[field as string];
      } else {
        target[field as string] = value;
      }
    }
    onUpdate({ ...provider, defaults: newDefaults });
  };

  const propDefaults = (provider.defaults?.model_properties ?? {}) as Partial<ModelProperties>;
  const paramDefaults = (provider.defaults?.model_parameters ?? {}) as Partial<ModelParameters>;

  return (
    <div className="item">
      <VscodeCollapsible heading={`Provider ${index + 1}${provider.displayName ? ` – ${provider.displayName}` : ''}`} alwaysShowHeaderActions>
        <VscodeButton onClick={onRemove} secondary slot="actions">
          Remove
        </VscodeButton>
        <VscodeFormGroup>
          <VscodeTextfield
            type="text"
            value={(provider.key as unknown as string) ?? ''}
            placeholder="e.g., openai, anthropic"
            onInput={(e: any) => updateField('key', e.currentTarget.value)}
          >
            <span slot="label">Key (required) *</span>
          </VscodeTextfield>
          <VscodeFormHelper style={{ color: 'var(--vscode-errorForeground)', display: provider.key ? 'none' : 'block' }}>
            Key is required
          </VscodeFormHelper>
        </VscodeFormGroup>

        <VscodeFormGroup>
          <VscodeTextfield
            type="text"
            value={(provider.displayName as unknown as string) ?? ''}
            onInput={(e: any) => updateField('displayName', e.currentTarget.value)}
          >
            <span slot="label">Display Name</span>
          </VscodeTextfield>
        </VscodeFormGroup>

        <VscodeFormGroup>
          <VscodeTextfield
            type="text"
            value={(provider.baseUrl as unknown as string) ?? ''}
            placeholder="e.g., https://api.openai.com/v1"
            onInput={(e: any) => updateField('baseUrl', e.currentTarget.value)}
          >
            <span slot="label">Base URL (required) *</span>
          </VscodeTextfield>
          <VscodeFormHelper style={{ color: 'var(--vscode-errorForeground)', display: provider.baseUrl ? 'none' : 'block' }}>
            Base URL is required
          </VscodeFormHelper>
        </VscodeFormGroup>

        <VscodeFormGroup>
          <VscodeTextarea
            rows={3 as any}
            placeholder='{"X-Custom-Header":"value"}'
            value={prettyJson(provider.headers)}
            onInput={(e: any) => updateHeaders(e.currentTarget.value)}
          >
            <span slot="label">Headers (JSON)</span>
          </VscodeTextarea>
          <VscodeFormHelper>Custom headers for this provider (JSON object)</VscodeFormHelper>
        </VscodeFormGroup>

        <VscodeFormGroup>
          <VscodeCheckbox
            checked={!!provider.defaults}
            onInput={(e: any) => toggleDefaults((e.currentTarget as any).checked)}
          >
            Configure Default Parameters
          </VscodeCheckbox>
        </VscodeFormGroup>

        {provider.defaults && (
          <div className="collapsible-content">
            <VscodeDivider></VscodeDivider>
            <VscodeFormGroup>
              <VscodeTextfield
                type="number"
                value={(propDefaults.context_length as unknown as string) ?? ''}
                onInput={(e: any) => updateDefault('model_properties', 'context_length', parseIntOrUndef(e.currentTarget.value))}
              >
                <span slot="label">Context Length</span>
              </VscodeTextfield>
            </VscodeFormGroup>
            <VscodeFormGroup>
              <VscodeTextfield
                type="number"
                value={(paramDefaults.max_tokens as unknown as string) ?? ''}
                onInput={(e: any) => updateDefault('model_parameters', 'max_tokens', parseIntOrUndef(e.currentTarget.value))}
              >
                <span slot="label">Max Tokens</span>
              </VscodeTextfield>
            </VscodeFormGroup>
            <VscodeFormGroup>
              <VscodeTextfield
                type="number"
                step={0.1}
                value={(paramDefaults.temperature as unknown as string) ?? ''}
                onInput={(e: any) => updateDefault('model_parameters', 'temperature', parseFloatOrUndef(e.currentTarget.value) ?? '')}
              >
                <span slot="label">Temperature (0-2)</span>
              </VscodeTextfield>
            </VscodeFormGroup>
            <VscodeFormGroup>
              <VscodeTextfield
                type="number"
                step={0.1}
                value={(paramDefaults.top_p as unknown as string) ?? ''}
                onInput={(e: any) => updateDefault('model_parameters', 'top_p', parseFloatOrUndef(e.currentTarget.value) ?? '')}
              >
                <span slot="label">Top P (0-1)</span>
              </VscodeTextfield>
            </VscodeFormGroup>
            <VscodeFormGroup>
              <VscodeTextfield
                type="text"
                placeholder="e.g., gpt-4, claude-3, gemini"
                value={(propDefaults.family as unknown as string) ?? ''}
                onInput={(e: any) => updateDefault('model_properties', 'family', e.currentTarget.value)}
              >
                <span slot="label">Family</span>
              </VscodeTextfield>
            </VscodeFormGroup>
            <VscodeFormGroup>
              <VscodeCheckbox
                checked={!!propDefaults.vision}
                onInput={(e: any) => updateDefault('model_properties', 'vision', (e.currentTarget as any).checked)}
              >
                Vision Support
              </VscodeCheckbox>
            </VscodeFormGroup>
          </div>
        )}
      </VscodeCollapsible>
    </div>
  );
};

export const Providers: React.FC<ProvidersProps> = ({ providers, onChange }) => {
  const addProvider = () => {
    const next: ProviderConfig = { key: '', baseUrl: '', displayName: '', defaults: undefined } as ProviderConfig;
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
        <VscodeButton onClick={addProvider} secondary>
          + Add Provider
        </VscodeButton>
        <div className="empty-state">No providers configured. Click "Add Provider" to get started.</div>
      </div>
    );
  }

  return (
    <div>
      <VscodeButton onClick={addProvider} secondary>
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
