/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import type { ModelItem, ProviderConfig, ModelProperties, ModelParameters } from '../../../src/types';
import ModelPropertiesForm from './ModelProperties';
import ModelParamsForm from './ModelParams';
import {
    VscodeButton,
    VscodeTabs,
    VscodeTabHeader,
    VscodeDivider,
    VscodeTabPanel,
    VscodeCollapsible,
    VscodeFormHelper,
    VscodeTextfield,
    VscodeSingleSelect,
    VscodeOption,
    VscodeCheckbox,
} from '@vscode-elements/react-elements';

export interface ModelsProps {
    providers: ProviderConfig[];
    models: ModelItem[];
    onChange: (models: ModelItem[]) => void;
}

const ModelItemCard: React.FC<{
    value: ModelItem;
    index: number;
    providers: ProviderConfig[];
    onUpdate: (next: ModelItem) => void;
    onRemove: () => void;
}> = ({ value, index, providers, onUpdate, onRemove }) => {
    const updateField = (field: keyof ModelItem | keyof ModelProperties, v: any) => {
        const next: any = { ...value };
        if (['id', 'slug', 'displayName', 'provider', 'use_for_autocomplete', 'retries'].includes(field as string)) {
            if (v === '' || v === undefined) {
                delete next[field];
            } else {
                next[field] = v;
            }
        } else {
            const nextProps = { ...value.model_properties };
            if (v === undefined) {
                delete nextProps[field as keyof ModelProperties];
            } else {
                nextProps[field as keyof ModelProperties] = v;
            }
            next.model_properties = nextProps;
        }
        onUpdate(next as ModelItem);
    };
    const updateParams = (p: ModelParameters) => onUpdate({ ...value, model_parameters: p });
    const props: ModelProperties = {
        ...value.model_properties,
    } as any;

    return (
        <div className="item">
            <VscodeCollapsible heading={`Model ${index + 1}${value?.id ? ` – ${value.id}` : ''}`} alwaysShowHeaderActions>
                <VscodeButton onClick={onRemove} secondary slot="actions">
                    Remove
                </VscodeButton>
                <VscodeTabs>
                    <VscodeTabHeader slot="header">Properties</VscodeTabHeader>
                    <VscodeTabHeader slot="header">Parameters</VscodeTabHeader>
                    <VscodeTabPanel>
                        <div className="collapsible-content">
                            <div className="form-field">
                                <VscodeFormHelper>Model ID (required) *</VscodeFormHelper>
                                <VscodeTextfield
                                    type="text"
                                    placeholder="e.g., gpt-4, claude-3-opus"
                                    value={value?.id ?? ''}
                                    onInput={(e: any) => updateField('id', e.currentTarget.value)}
                                >
                                </VscodeTextfield>
                                <VscodeFormHelper style={{ color: 'var(--vscode-errorForeground)', display: value?.id ? 'none' : 'block' }}>
                                    Model ID is required
                                </VscodeFormHelper>
                            </div>
                            <div className="form-field">
                                <VscodeFormHelper>Model Slug(required, sent to provider) *</VscodeFormHelper>
                                <VscodeTextfield
                                    type="text"
                                    placeholder="e.g., gpt-4, claude-3-opus"
                                    value={value?.slug ?? ''}
                                    onInput={(e: any) => updateField('slug', e.currentTarget.value)}
                                >
                                </VscodeTextfield>
                                <VscodeFormHelper style={{ color: 'var(--vscode-errorForeground)', display: value?.slug ? 'none' : 'block' }}>
                                    Model Slug is required
                                </VscodeFormHelper>
                            </div>
                            <div className="form-field">
                                <VscodeFormHelper>Display Name</VscodeFormHelper>
                                <VscodeTextfield
                                    type="text"
                                    placeholder="Optional human-readable name"
                                    value={value?.displayName ?? ''}
                                    onInput={(e: any) => updateField('displayName', e.currentTarget.value)}
                                >
                                </VscodeTextfield>
                            </div>

                            <div className="form-field">
                                <VscodeFormHelper>Provider</VscodeFormHelper>
                                <VscodeSingleSelect
                                    value={value?.provider || ''}
                                    onChange={(e: any) => updateField('provider', e.currentTarget.value)}
                                >
                                    <VscodeOption value="" disabled>
                                        Select a provider
                                    </VscodeOption>
                                    {providers.map((p) => (
                                        <VscodeOption key={p.id} value={p.id}>
                                            {p.displayName || p.id }
                                        </VscodeOption>
                                    ))}
                                </VscodeSingleSelect>
                                <VscodeFormHelper>Select a provider to inherit baseUrl and defaults (optional)</VscodeFormHelper>
                            </div>
                            <div className="form-field">
                                <VscodeCheckbox
                                    checked={value?.use_for_autocomplete ?? false}
                                    onChange={(e: any) => updateField('use_for_autocomplete', e.currentTarget.checked)}
                                >
                                    Use for Autocomplete
                                </VscodeCheckbox>
                                <VscodeFormHelper>Use this model for code completion.  Only a single model may have this box selected.  If multiple are selected, behavior is undefined</VscodeFormHelper>
                            </div>
                            <div className="form-field">
                                <VscodeFormHelper>Retries</VscodeFormHelper>
                                <VscodeTextfield
                                    type="text"
                                    placeholder="3"
                                    value={value?.retries?.toString() ?? ''}
                                    onInput={(e: any) => {
                                        const val = e.currentTarget.value;
                                        updateField('retries', val === '' ? undefined : Number(val));
                                    }}
                                >
                                </VscodeTextfield>
                                <VscodeFormHelper>Number of retries for failed requests (optional, default 3)</VscodeFormHelper>
                            </div>
                            <VscodeDivider></VscodeDivider>
                            <ModelPropertiesForm value={props} providers={providers} onChange={updateField} />
                        </div>
                    </VscodeTabPanel>
                    <VscodeTabPanel>
                        <ModelParamsForm value={value.model_parameters} onChange={updateParams} />
                    </VscodeTabPanel>
                </VscodeTabs>
            </VscodeCollapsible>
            <VscodeDivider></VscodeDivider>
        </div>
    );
};


export const Models: React.FC<ModelsProps> = ({ providers, models, onChange }) => {
    const addModel = () => {
        const base: ModelItem = { id: '', slug: '', provider: '', model_properties: {}, model_parameters: {} };
        onChange([...(models ?? []), base]);
    };

    const updateAt = (i: number, nextItem: ModelItem) => {
        const next = models.slice();
        next[i] = nextItem;
        onChange(next);
    };

    const removeAt = (i: number) => {
        const next = models.slice();
        next.splice(i, 1);
        onChange(next);
    };

    if (!models || models.length === 0) {
        return (
            <div>
                <VscodeButton onClick={addModel} style={{ marginTop: '12px', marginBottom: '12px' }}>+ Add Model</VscodeButton>
                <div className="empty-state">No models configured. Click "Add Model" to get started.</div>
            </div>
        );
    }

    return (
        <div>
            <VscodeButton onClick={addModel} secondary style={{ marginTop: '12px', marginBottom: '12px' }}>
                + Add Model
            </VscodeButton>
            <div className="item-list">
                {models.map((m, i) => (
                    <ModelItemCard
                        key={i}
                        value={m}
                        index={i}
                        providers={providers}
                        onUpdate={(nm) => updateAt(i, nm)}
                        onRemove={() => removeAt(i)}
                    />
                ))}
            </div>
        </div>
    );
};

export default Models;
