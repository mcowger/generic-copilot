/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import type { ModelParameters } from '../../../src/types';
import { tryParseJson, prettyJson, parseFloatOrNull, parseIntOrUndef } from '../utils';
import {
    VscodeTextfield,
    VscodeTextarea,
    VscodeFormHelper,
    VscodeSingleSelect,
    VscodeOption,
} from '@vscode-elements/react-elements';

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


            <div className="form-field">
                <VscodeFormHelper>Max Tokens</VscodeFormHelper>
                <VscodeTextfield
                    type="number"
                    value={(value?.max_tokens as unknown as string) ?? ''}
                    onInput={(e: any) => update('max_tokens', parseIntOrUndef(e.currentTarget.value))}
                >
                </VscodeTextfield>
            </div>

            <div className="form-field">
                <VscodeFormHelper>Max Completion Tokens (GPT-5)</VscodeFormHelper>
                <VscodeTextfield
                    type="number"
                    value={(value?.max_completion_tokens as unknown as string) ?? ''}
                    onInput={(e: any) => update('max_completion_tokens', parseIntOrUndef(e.currentTarget.value))}
                >
                </VscodeTextfield>
            </div>

            <div className="form-field">
                <VscodeFormHelper>Temperature (0-2)</VscodeFormHelper>
                <VscodeTextfield
                    type="number"
                    step={0.1}
                    value={(value?.temperature as unknown as string) ?? ''}
                    onInput={(e: any) => update('temperature', parseFloatOrNull(e.currentTarget.value))}
                >
                </VscodeTextfield>
                <VscodeFormHelper>Range 0–2. Set null to omit from request.</VscodeFormHelper>
            </div>

            <div className="form-field">
                <VscodeFormHelper>Thinking Budget (Anthropic Style)</VscodeFormHelper>
                <VscodeTextfield
                    type="number"
                    value={(value?.thinking_budget as unknown as string) ?? ''}
                    onInput={(e: any) => update('thinking_budget', parseIntOrUndef(e.currentTarget.value))}
                >
                </VscodeTextfield>
            </div>

            <div className="form-field">
                <VscodeFormHelper>Thinking (Z.ai Style)</VscodeFormHelper>
                <VscodeTextarea
                    rows={3 as any}
                    placeholder='{"type":"enabled"}'
                    value={prettyJson(value?.thinking)}
                    onInput={(e: any) => update('thinking', tryParseJson(e.currentTarget.value))}
                >
                </VscodeTextarea>
                <VscodeFormHelper>Set to {"{"}"type":"enabled"{"}"}  to enable</VscodeFormHelper>
            </div>

            <div className="form-field">
                <VscodeFormHelper>Reasoning (OpenRouter Style)</VscodeFormHelper>
                <VscodeTextarea
                    rows={3 as any}
                    placeholder='{"enabled":true,"effort":"high"}'
                    value={prettyJson(value?.reasoning)}
                    onInput={(e: any) => update('reasoning', tryParseJson(e.currentTarget.value))}
                >
                </VscodeTextarea>
            </div>

            <div className="form-field">
                <VscodeFormHelper>Reasoning Effort (GPT-5 Only)</VscodeFormHelper>
                <VscodeSingleSelect
                    value={(value?.reasoning_effort as unknown as string) ?? ''}
                    onInput={(e: any) => {
                        const val = e.currentTarget.value;
                        update('reasoning_effort', val === '' ? null : val);
                    }}
                >
                    <VscodeOption value="">Not set (null)</VscodeOption>
                    <VscodeOption value="minimal">Minimal</VscodeOption>
                    <VscodeOption value="low">Low</VscodeOption>
                    <VscodeOption value="medium">Medium</VscodeOption>
                    <VscodeOption value="high">High</VscodeOption>
                </VscodeSingleSelect>
            </div>

            <div className="form-field">
                <VscodeFormHelper>Custom Params (JSON)</VscodeFormHelper>
                <VscodeTextarea
                    rows={4 as any}
                    placeholder='{"custom_param":"value"}'
                    value={prettyJson(value?.extra)}
                    onInput={(e: any) => update('extra', tryParseJson(e.currentTarget.value))}
                >
                </VscodeTextarea>
                <VscodeFormHelper>Provider-specific parameters (JSON object)</VscodeFormHelper>
            </div>
        </div>
    );
};

export default ModelParamsForm;
