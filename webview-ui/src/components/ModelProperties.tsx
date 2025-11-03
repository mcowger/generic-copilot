/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import type { ModelProperties, ProviderConfig } from '../../../src/types';
import { prettyJson, tryParseJson, parseIntOrUndef } from '../utils';
import {
    VscodeTextfield,
    VscodeTextarea,
    VscodeSingleSelect,
    VscodeOption,
    VscodeFormHelper,
} from '@vscode-elements/react-elements';

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
        <VscodeOption key={p.key} value={p.key}>
            {p.displayName || p.key}
        </VscodeOption>
    ));

    return (
        <div className="collapsible-content">
            <h4>
                Model properties <small>(internal — not sent to provider)</small>
            </h4>
            <div className="form-field">
                <VscodeFormHelper>Model ID (required) *</VscodeFormHelper>
                <VscodeTextfield
                    type="text"
                    placeholder="e.g., gpt-4, claude-3-opus"
                    value={(value?.id as unknown as string) ?? ''}
                    onInput={(e: any) => update('id', e.currentTarget.value)}
                >
                </VscodeTextfield>
                <VscodeFormHelper style={{ color: 'var(--vscode-errorForeground)', display: value?.id ? 'none' : 'block' }}>
                    Model ID is required
                </VscodeFormHelper>
            </div>

            <div className="form-field">
                <VscodeFormHelper>Display Name</VscodeFormHelper>
                <VscodeTextfield
                    type="text"
                    placeholder="Optional human-readable name"
                    value={(value?.displayName as unknown as string) ?? ''}
                    onInput={(e: any) => update('displayName', e.currentTarget.value)}
                >
                </VscodeTextfield>
            </div>

            <div className="form-field">
                <VscodeFormHelper>Provider</VscodeFormHelper>
                <VscodeSingleSelect
                    value={(value?.provider as unknown as string) ?? ''}
                    onInput={(e: any) => update('provider', e.currentTarget.value)}
                >
                    <VscodeOption value="" disabled>
                        Select a provider
                    </VscodeOption>
                    {providerOptions}
                </VscodeSingleSelect>
                <VscodeFormHelper>Select a provider to inherit baseUrl and defaults (optional)</VscodeFormHelper>
            </div>

            <div className="form-field">
                <VscodeFormHelper>Config ID</VscodeFormHelper>
                <VscodeTextfield
                    type="text"
                    placeholder="Optional: e.g., thinking, fast"
                    value={(value?.configId as unknown as string) ?? ''}
                    onInput={(e: any) => update('configId', e.currentTarget.value)}
                >
                </VscodeTextfield>
            </div>

            <div className="form-field">
                <VscodeFormHelper>Headers (JSON)</VscodeFormHelper>
                <VscodeTextarea
                    rows={3 as any}
                    placeholder='{"X-Custom-Header":"value"}'
                    value={prettyJson(value?.headers)}
                    onInput={(e: any) =>
                        update('headers', tryParseJson<Record<string, string>>(e.currentTarget.value))
                    }
                >
                </VscodeTextarea>
                <VscodeFormHelper>Custom headers for this model (JSON object)</VscodeFormHelper>
            </div>

            <div className="form-field">
                <VscodeFormHelper>Context Length</VscodeFormHelper>
                <VscodeTextfield
                    type="number"
                    value={(value?.context_length as unknown as string) ?? ''}
                    onInput={(e: any) => update('context_length', parseIntOrUndef(e.currentTarget.value))}
                >
                </VscodeTextfield>
            </div>

            <div className="form-field">
                <VscodeFormHelper>Family</VscodeFormHelper>
                <VscodeTextfield
                    type="text"
                    placeholder="e.g., gpt-4, claude-3, gemini"
                    value={(value?.family as unknown as string) ?? ''}
                    onInput={(e: any) => update('family', e.currentTarget.value)}
                >
                </VscodeTextfield>
            </div>
        </div>
    );
};

export default ModelPropertiesForm;
