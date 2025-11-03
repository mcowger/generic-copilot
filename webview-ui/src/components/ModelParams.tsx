/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import type { ModelParameters } from '../../../src/types';
import { tryParseJson, prettyJson, parseFloatOrNull, parseFloatOrUndef, parseIntOrUndef } from '../utils';

export interface ModelParamsProps {
    value: ModelParameters;
    onChange: (next: ModelParameters) => void;
}

const ModelParamsForm: React.FC<ModelParamsProps> = ({ value, onChange }) => {
    const update = (field: keyof ModelParameters | string, v: any) => {
        const next: any = { ...(value || ({} as ModelParameters)) };
        if (v === '' || (typeof v === 'number' && Number.isNaN(v))) {
            delete next[field];
        } else {
            next[field] = v;
        }
        onChange(next as ModelParameters);
    };

    return (
        <div className="collapsible-content">
            <h4>
                Model parameters <small>(sent to provider)</small>
            </h4>
            <div className="form-group">
                <em>
                    Model parameters are sent to the model provider in the request body. Use <code>extra</code> for
                    provider-specific unknown keys (raw JSON). Fields set to <code>null</code> will be omitted from the request
                    to allow provider defaults.
                </em>
            </div>

            <div className="form-group">
                <label>Max Tokens</label>
                <input
                    type="number"
                    value={value?.max_tokens ?? ''}
                    onChange={(e) => update('max_tokens', parseIntOrUndef(e.target.value))}
                />
            </div>

            <div className="form-group">
                <label>Max Completion Tokens</label>
                <input
                    type="number"
                    value={value?.max_completion_tokens ?? ''}
                    onChange={(e) => update('max_completion_tokens', parseIntOrUndef(e.target.value))}
                />
            </div>

            <div className="form-group">
                <label>Temperature (0-2)</label>
                <input
                    type="number"
                    step={0.1}
                    value={value?.temperature ?? ''}
                    onChange={(e) => update('temperature', parseFloatOrNull(e.target.value))}
                />
            </div>

            <div className="form-group">
                <label>Top P (0-1)</label>
                <input
                    type="number"
                    step={0.1}
                    value={value?.top_p ?? ''}
                    onChange={(e) => update('top_p', parseFloatOrNull(e.target.value))}
                />
            </div>

            <div className="form-group">
                <label>Top K</label>
                <input
                    type="number"
                    value={value?.top_k ?? ''}
                    onChange={(e) => update('top_k', parseIntOrUndef(e.target.value))}
                />
            </div>

            <div className="form-group">
                <label>Min P</label>
                <input
                    type="number"
                    step={0.01}
                    value={value?.min_p ?? ''}
                    onChange={(e) => update('min_p', parseFloatOrUndef(e.target.value))}
                />
            </div>

            <div className="form-group">
                <label>Frequency Penalty</label>
                <input
                    type="number"
                    step={0.1}
                    value={value?.frequency_penalty ?? ''}
                    onChange={(e) => update('frequency_penalty', parseFloatOrUndef(e.target.value))}
                />
            </div>

            <div className="form-group">
                <label>Presence Penalty</label>
                <input
                    type="number"
                    step={0.1}
                    value={value?.presence_penalty ?? ''}
                    onChange={(e) => update('presence_penalty', parseFloatOrUndef(e.target.value))}
                />
            </div>

            <div className="form-group">
                <label>Repetition Penalty</label>
                <input
                    type="number"
                    step={0.1}
                    value={value?.repetition_penalty ?? ''}
                    onChange={(e) => update('repetition_penalty', parseFloatOrUndef(e.target.value))}
                />
            </div>

            <div className="form-group">
                <label>Thinking Budget</label>
                <input
                    type="number"
                    value={value?.thinking_budget ?? ''}
                    onChange={(e) => update('thinking_budget', parseIntOrUndef(e.target.value))}
                />
            </div>

            <div className="form-group">
                <label>Thinking (JSON)</label>
                <textarea
                    rows={3}
                    placeholder='{"type":"enabled"}'
                    value={prettyJson(value?.thinking)}
                    onChange={(e) => update('thinking', tryParseJson(e.target.value))}
                />
            </div>

            <div className="form-group">
                <label>Enable Thinking</label>
                <label className="checkbox-label">
                    <input
                        type="checkbox"
                        checked={!!value?.enable_thinking}
                        onChange={(e) => update('enable_thinking', e.target.checked)}
                    />
                    Enable thinking features for this model
                </label>
            </div>

            <div className="form-group">
                <label>Reasoning (JSON)</label>
                <textarea
                    rows={3}
                    placeholder='{"enabled":true,"effort":"high"}'
                    value={prettyJson(value?.reasoning)}
                    onChange={(e) => update('reasoning', tryParseJson(e.target.value))}
                />
            </div>

            <div className="form-group">
                <label>Reasoning Effort</label>
                <input
                    type="text"
                    value={value?.reasoning_effort ?? ''}
                    onChange={(e) => update('reasoning_effort', e.target.value)}
                />
            </div>

            <div className="form-group">
                <label>Extra (JSON)</label>
                <textarea
                    rows={4}
                    placeholder='{"custom_param":"value"}'
                    value={prettyJson(value?.extra)}
                    onChange={(e) => update('extra', tryParseJson(e.target.value))}
                />
            </div>
        </div>
    );
};

export default ModelParamsForm;
