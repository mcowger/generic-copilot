/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ModelItem, ProviderConfig, ModelProperties, ModelParameters } from '../../src/types';
import { Providers } from './components/Providers';
import { Models } from './components/Models';
import { VscodeButton, VscodeTabs, VscodeTabHeader, VscodeTabPanel } from '@vscode-elements/react-elements';

declare function acquireVsCodeApi(): {
    postMessage: (message: any) => void;
    setState: (state: any) => void;
    getState: () => any;
};


interface InMessage { command: 'loadConfiguration'; providers: ProviderConfig[]; models: any[] }

const toGrouped = (m: any): ModelItem => {
    const mp: ModelProperties = m?.model_properties ?? {
        owned_by: m?.owned_by,
        family: m?.family,
        context_length: m?.context_length,
    };

    const par: ModelParameters = m?.model_parameters ?? {
        temperature: m?.temperature ?? undefined,
        extra: m?.extra,
    };

    return {
        id: m?.id ?? '',
        displayName: m?.displayName,
        provider: m?.provider ?? '',
        slug: m?.slug ?? '',
        use_for_autocomplete: m?.use_for_autocomplete,
        model_properties: mp,
        model_parameters: par,
    } as ModelItem;
};

const cleanProviderDefaults = (p: ProviderConfig): ProviderConfig => {
    return p;
};

const App: React.FC = () => {
    const vscode = useMemo(() => {
        try { return acquireVsCodeApi(); } catch { return undefined; }
    }, []);

    const [providers, setProviders] = useState<ProviderConfig[]>([]);
    const [models, setModels] = useState<ModelItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const handler = (ev: MessageEvent<InMessage>) => {
            const msg = ev.data;
            if (!msg) { return; }
            if (msg.command === 'loadConfiguration') {
                setProviders(msg.providers || []);
                setModels((msg.models || []).map(toGrouped));
                setLoading(false);
            }
        };
        window.addEventListener('message', handler);
        vscode?.postMessage({ command: 'load' });
        return () => window.removeEventListener('message', handler);
    }, [vscode]);

    const onSave = useCallback(() => {
        // Validate providers
        const invalidProviders = providers.filter((p) => !p.id || !p.vercelType);
        if (invalidProviders.length > 0) {
            alert('Please fill in required fields (identifier and vercel type) for all providers.');
            return;
        }
        // Validate models
        const invalidModels = models.filter((m) => !(m && m.id && m.slug));
        if (invalidModels.length > 0) {
            alert('Please fill in required fields (id and slug) for all models.');
            return;
        }

        const cleanedProviders = providers.map(cleanProviderDefaults);
        vscode?.postMessage({ command: 'save', providers: cleanedProviders, models });
    }, [providers, models, vscode]);

    const openSettings = useCallback(() => {
        vscode?.postMessage({ command: 'openSettings' });
    }, [vscode]);

    return (
        <div className="p-5" style={{ color: 'var(--vscode-foreground)', fontFamily: 'var(--vscode-font-family)' }}>
            <h1>Generic Copilot Configuration</h1>

            <VscodeTabs>
                <VscodeTabHeader slot="header">Providers</VscodeTabHeader>
                <VscodeTabHeader slot="header">Models</VscodeTabHeader>
                <VscodeTabPanel>
                    <div className="section">
                        <Providers providers={providers} onChange={setProviders} />
                    </div>
                </VscodeTabPanel>
                <VscodeTabPanel>
                    <div className="section">
                        <Models providers={providers} models={models} onChange={setModels} />
                    </div>
                </VscodeTabPanel>
            </VscodeTabs>

            <div
                className="sticky-actions"
                style={{
                    position: 'sticky',
                    bottom: 0,
                    background: 'var(--vscode-editor-background)',
                    borderTop: '1px solid var(--vscode-dropdown-border)',
                    padding: '12px 0',
                    zIndex: 10,
                }}
            >
                <div className="save-section" style={{ display: 'flex', gap: 8 }}>
                    <VscodeButton onClick={onSave} disabled={loading}>
                        Save Configuration
                    </VscodeButton>
                    <VscodeButton onClick={openSettings} secondary>
                        Open settings.json
                    </VscodeButton>
                </div>
            </div>
            {loading && <div className="empty-state">Loading configuration…</div>}
        </div>
    );
};

export default App;
