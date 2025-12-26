/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import type { ModelProperties, ProviderConfig } from '../../../src/types';
import { parseIntOrUndef } from '../utils';
import {
    VscodeTextfield,
    VscodeFormHelper,
    VscodeSingleSelect,
    VscodeOption,
} from '@vscode-elements/react-elements';

export interface ModelPropertiesProps {
    value: ModelProperties;
    providers: ProviderConfig[];
    onChange: (field: keyof ModelProperties, value: any) => void;
}

const ModelPropertiesForm: React.FC<ModelPropertiesProps> = ({ value, onChange }) => {
    const update = (field: keyof ModelProperties, v: any) => {
        if (v === '' || (typeof v === 'number' && Number.isNaN(v))) {
            onChange(field, undefined);
        } else {
            onChange(field, v);
        }
    };

    return (
        <div className="collapsible-content">
            <h4>
                Model properties <small>(internal — not sent to provider)</small>
            </h4>
            {/* Config ID moved to top-level ModelItem; edited in Models.tsx */}

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

            <div className="form-field">
                <VscodeFormHelper>LiteLLM API Type</VscodeFormHelper>
                <VscodeSingleSelect
                    value={(value?.litellm_api_type as unknown as string) ?? ''}
                    onChange={(e: any) => update('litellm_api_type', e.currentTarget.value)}
                >
                    <VscodeOption value="">(Not set)</VscodeOption>
                    <VscodeOption value="anthropic">anthropic</VscodeOption>
                    <VscodeOption value="openai-compatible">openai-compatible</VscodeOption>
                </VscodeSingleSelect>
                <VscodeFormHelper>Required for LiteLLM provider. Specifies which underlying API to use.</VscodeFormHelper>
            </div>
        </div>
    );
};

export default ModelPropertiesForm;
