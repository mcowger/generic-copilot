/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import type { ModelProperties, ProviderConfig } from '../../../src/types';
import { prettyJson, tryParseJson, parseIntOrUndef } from '../utils';

export interface ModelPropertiesProps {
    value: ModelProperties;
    providers: ProviderConfig[];
    onChange: (next: ModelProperties) => void;
}

const ModelPropertiesForm: React.FC<ModelPropertiesProps> = ({ value, providers, onChange }) => {
    const update = (field: keyof ModelProperties, v: any) => {
        const next: any = { ...(value || ({} as ModelProperties)) };
        if (v === '' || (typeof v === 'number' && Number.isNaN(v))) {
            delete next[field];
        } else {
            next[field] = v;
        }
        onChange(next as ModelProperties);
    };

    const providerOptions = providers.map((p) => (
        <option key={p.key} value={p.key}>
            {p.displayName || p.key}
        </option>
    ));

    return (
        <div className="collapsible-content">
            <h4>
                Model properties <small>(internal — not sent to provider)</small>
            </h4>
            <div className="form-group">
                <em>
                    Model properties are internal metadata used by the extension and are NOT sent to the model provider.
                </em>
            </div>

            <div className="form-group">
                <label>Model ID (required) *</label>
                <input
                    type="text"
                    placeholder="e.g., gpt-4, claude-3-opus"
                    value={value?.id ?? ''}
                    onChange={(e) => update('id', e.target.value)}
                />
                <div className="error" style={{ display: value?.id ? 'none' : 'block' }}>
                    Model ID is required
                </div>
            </div>

            <div className="form-group">
                <label>Display Name</label>
                <input
                    type="text"
                    placeholder="Optional human-readable name"
                    value={value?.displayName ?? ''}
                    onChange={(e) => update('displayName', e.target.value)}
                />
            </div>

            <div className="form-group">
                <label>Provider</label>
                <select value={value?.provider ?? ''} onChange={(e) => update('provider', e.target.value)}>
                    <option value="">Select a provider</option>
                    {providerOptions}
                </select>
            </div>

            <div className="form-group">
                <label>Owned By</label>
                <input
                    type="text"
                    placeholder="e.g., openai, anthropic"
                    value={value?.owned_by ?? ''}
                    onChange={(e) => update('owned_by', e.target.value)}
                />
            </div>

            <div className="form-group">
                <label>Config ID</label>
                <input
                    type="text"
                    placeholder="Optional: e.g., thinking, fast"
                    value={value?.configId ?? ''}
                    onChange={(e) => update('configId', e.target.value)}
                />
            </div>

            <div className="form-group">
                <label>Base URL (override)</label>
                <input
                    type="text"
                    placeholder="Leave empty to use provider base URL"
                    value={value?.baseUrl ?? ''}
                    onChange={(e) => update('baseUrl', e.target.value)}
                />
            </div>

            <div className="form-group">
                <label>Headers (JSON)</label>
                <textarea
                    rows={3}
                    placeholder='{"X-Custom-Header":"value"}'
                    value={prettyJson(value?.headers)}
                    onChange={(e) => update('headers', tryParseJson<Record<string, string>>(e.target.value))}
                />
            </div>

            <div className="form-group">
                <label>Architecture (JSON)</label>
                <textarea
                    rows={2}
                    placeholder='{"input_modalities":["text","image_url"]}'
                    value={prettyJson(value?.architecture)}
                    onChange={(e) => update('architecture', tryParseJson(e.target.value))}
                />
            </div>

            <div className="form-group">
                <label>Context Length</label>
                <input
                    type="number"
                    value={value?.context_length ?? ''}
                    onChange={(e) => update('context_length', parseIntOrUndef(e.target.value))}
                />
            </div>

            <div className="form-group">
                <label className="checkbox-label">
                    <input
                        type="checkbox"
                        checked={!!value?.vision}
                        onChange={(e) => update('vision', e.target.checked)}
                    />
                    Vision Support
                </label>
            </div>
        </div>
    );
};

export default ModelPropertiesForm;
