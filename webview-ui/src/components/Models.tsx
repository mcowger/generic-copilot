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
} from '@vscode-elements/react-elements';

export interface ModelsProps {
    providers: ProviderConfig[];
    models: ModelItem[];
    onChange: (models: ModelItem[]) => void;
}

const ensureProps = (m: Partial<ModelItem>): ModelItem => {
    if ((m as any).model_properties && (m as any).model_parameters) {
        return m as ModelItem;
    }
    // migrate flat -> grouped
    const flat: any = m;
    const model_properties: ModelProperties = {
        id: flat?.id ?? '',
        provider: flat?.provider,
        configId: flat?.configId,
        owned_by: flat?.owned_by,
        baseUrl: flat?.baseUrl,
        displayName: flat?.displayName,
        family: flat?.family,
        context_length: flat?.context_length,
        vision: flat?.vision,
        headers: flat?.headers,
        architecture: flat?.architecture,
    } as unknown as ModelProperties;
    const model_parameters: ModelParameters = {
        max_tokens: flat?.max_tokens,
        max_completion_tokens: flat?.max_completion_tokens,
        temperature: flat?.temperature ?? undefined,
        top_p: flat?.top_p ?? undefined,
        top_k: flat?.top_k,
        min_p: flat?.min_p,
        frequency_penalty: flat?.frequency_penalty,
        presence_penalty: flat?.presence_penalty,
        repetition_penalty: flat?.repetition_penalty,
        thinking_budget: flat?.thinking_budget,
        thinking: flat?.thinking,
        reasoning: flat?.reasoning,
        reasoning_effort: flat?.reasoning_effort,
        extra: flat?.extra,
    } as unknown as ModelParameters;
    return { model_properties, model_parameters } as ModelItem;
};

const ModelItemCard: React.FC<{
    value: ModelItem;
    index: number;
    providers: ProviderConfig[];
    onUpdate: (next: ModelItem) => void;
    onRemove: () => void;
}> = ({ value, index, providers, onUpdate, onRemove }) => {
    const updateProps = (p: ModelProperties) => onUpdate({ ...value, model_properties: p });
    const updateParams = (p: ModelParameters) => onUpdate({ ...value, model_parameters: p });

    return (
        <div className="item">
            <VscodeCollapsible heading={`Model ${index + 1}${value?.model_properties?.id ? ` – ${value.model_properties.id}` : ''}`} alwaysShowHeaderActions>
                <VscodeButton onClick={onRemove} secondary slot="actions">
                    Remove
                </VscodeButton>
                <VscodeTabs>
                    <VscodeTabHeader slot="header">Properties</VscodeTabHeader>
                    <VscodeTabHeader slot="header">Parameters</VscodeTabHeader>
                    <VscodeTabPanel>
                        <ModelPropertiesForm value={value.model_properties} providers={providers} onChange={updateProps} />
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
        const base: ModelItem = { model_properties: { id: '', provider: '', owned_by: '' }, model_parameters: {} } as any;
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
                <VscodeButton onClick={addModel}>+ Add Model</VscodeButton>
                <div className="empty-state">No models configured. Click "Add Model" to get started.</div>
            </div>
        );
    }

    return (
        <div>
            <VscodeButton onClick={addModel} secondary>
                + Add Model
            </VscodeButton>
            <div className="item-list">
                {models.map((m, i) => (
                    <ModelItemCard
                        key={i}
                        value={ensureProps(m)}
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
