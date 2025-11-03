import React from 'react';
import type { ProviderConfig, ModelProperties, ModelParameters } from '../../../src/types';
import { prettyJson, tryParseJson, parseFloatOrUndef, parseIntOrUndef } from '../utils';

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
      <div className="item-header">
        <h3>Provider {index + 1}</h3>
        <div className="item-actions">
          <button className="secondary" onClick={onRemove}>Remove</button>
        </div>
      </div>

      <div className="form-group">
        <label>Key (required) *</label>
        <input
          type="text"
          value={provider.key ?? ''}
          placeholder="e.g., openai, anthropic"
          onChange={(e) => updateField('key', e.target.value)}
        />
        <div className="error" style={{ display: provider.key ? 'none' : 'block' }}>Key is required</div>
      </div>

      <div className="form-group">
        <label>Display Name</label>
        <input
          type="text"
          value={provider.displayName ?? ''}
          onChange={(e) => updateField('displayName', e.target.value)}
        />
      </div>

      <div className="form-group">
        <label>Base URL (required) *</label>
        <input
          type="text"
          value={provider.baseUrl ?? ''}
          placeholder="e.g., https://api.openai.com/v1"
          onChange={(e) => updateField('baseUrl', e.target.value)}
        />
        <div className="error" style={{ display: provider.baseUrl ? 'none' : 'block' }}>Base URL is required</div>
      </div>

      <div className="form-group">
        <label>Headers (JSON)</label>
        <textarea
          rows={3}
          placeholder='{"X-Custom-Header":"value"}'
          value={prettyJson(provider.headers)}
          onChange={(e) => updateHeaders(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={!!provider.defaults}
            onChange={(e) => toggleDefaults(e.target.checked)}
          />
          Configure Default Parameters
        </label>
      </div>

      {provider.defaults && (
        <div className="collapsible-content">
          <div className="form-group">
            <label>Context Length</label>
            <input
              type="number"
              value={propDefaults.context_length ?? ''}
              onChange={(e) => updateDefault('model_properties', 'context_length', parseIntOrUndef(e.target.value))}
            />
          </div>
          <div className="form-group">
            <label>Max Tokens</label>
            <input
              type="number"
              value={paramDefaults.max_tokens ?? ''}
              onChange={(e) => updateDefault('model_parameters', 'max_tokens', parseIntOrUndef(e.target.value))}
            />
          </div>
          <div className="form-group">
            <label>Temperature (0-2)</label>
            <input
              type="number"
              step={0.1}
              value={paramDefaults.temperature ?? ''}
              onChange={(e) => updateDefault('model_parameters', 'temperature', parseFloatOrUndef(e.target.value) ?? '')}
            />
          </div>
          <div className="form-group">
            <label>Top P (0-1)</label>
            <input
              type="number"
              step={0.1}
              value={paramDefaults.top_p ?? ''}
              onChange={(e) => updateDefault('model_parameters', 'top_p', parseFloatOrUndef(e.target.value) ?? '')}
            />
          </div>
          <div className="form-group">
            <label>Family</label>
            <input
              type="text"
              placeholder="e.g., gpt-4, claude-3, gemini"
              value={propDefaults.family ?? ''}
              onChange={(e) => updateDefault('model_properties', 'family', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={!!propDefaults.vision}
                onChange={(e) => updateDefault('model_properties', 'vision', e.target.checked)}
              />
              Vision Support
            </label>
          </div>
        </div>
      )}
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
        <button className="add-button" onClick={addProvider}>+ Add Provider</button>
        <div className="empty-state">No providers configured. Click "Add Provider" to get started.</div>
      </div>
    );
  }

  return (
    <div>
      <button className="add-button" onClick={addProvider}>+ Add Provider</button>
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
