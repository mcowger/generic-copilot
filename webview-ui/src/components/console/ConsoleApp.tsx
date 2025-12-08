import React, { useEffect, useState } from 'react';
import Interaction from './Interaction';
import InteractionListItem from './InteractionListItem';
import InteractionList from './InteractionList';

declare function acquireVsCodeApi(): {
    postMessage: (message: any) => void;
    setState: (state: any) => void;
    getState: () => any;
};

interface LogMessage {
    id: string;
    request?: any;
    response?: any;
}

export const ConsoleApp: React.FC = () => {
    const [logs, setLogs] = useState<LogMessage[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const vscode = (() => {
        try { return acquireVsCodeApi(); } catch { return undefined; }
    })();

    useEffect(() => {
        const handle = (ev: MessageEvent) => {
            const message = ev.data;
            if (message.type === 'update') {
                setLogs(message.data || []);
            }
        };

        window.addEventListener('message', handle);

        // request initial data
        vscode?.postMessage({ type: 'refresh' });

        return () => window.removeEventListener('message', handle);
    }, [vscode]);

    // order newest-first for display and default selection
    // Determine a comparable timestamp for each log using request.timestamp if present
    // or parsing an HH:MM:SS prefix from the id (e.g. "18:51:15-xx"). Then decide whether
    // the incoming array is already newest-first and flip only if needed.
    const toTime = (item: LogMessage) => {
        const t = item.request?.timestamp;
        if (t != null) {
            const n = Number(t);
            if (!isNaN(n)) return n;
            const parsed = Date.parse(String(t));
            if (!isNaN(parsed)) return parsed;
        }

        // try parse id prefix HH:MM:SS
        if (typeof item.id === 'string') {
            const m = item.id.match(/^(\d{1,2}:\d{2}:\d{2})/);
            if (m) {
                const today = new Date();
                const dt = new Date(`${today.toDateString()} ${m[1]}`);
                if (!isNaN(dt.getTime())) return dt.getTime();
            }
        }

        return 0;
    };

    const orderedLogs = (() => {
        if (!logs || logs.length === 0) return logs.slice();

        // If first is older than last, then array is oldest->newest, so reverse it
        const first = toTime(logs[0]);
        const last = toTime(logs[logs.length - 1]);
        if (first === 0 && last === 0) {
            // unknown timestamps — assume array is oldest-first and reverse
            return logs.slice().reverse();
        }

        if (first <= last) {
            // first is older or equal → array is oldest-first
            return logs.slice().reverse();
        }

        // otherwise array is already newest-first
        return logs.slice();
    })();

    // keep selection in sync with logs; auto-select the newest item when available
    useEffect(() => {
        if (!logs || logs.length === 0) {
            setSelectedId(null);
            return;
        }

        // if the currently selected id is not in the new logs, select the newest
        const found = logs.find((l) => l.id === selectedId);
        if (!found) setSelectedId(orderedLogs[0]?.id ?? null);
    }, [logs]);

    function refresh() {
        vscode?.postMessage({ type: 'refresh' });
    }

    function clearAll() {
        if (confirm('Clear all logged interactions?')) {
            vscode?.postMessage({ type: 'clear' });
        }
    }

    function escapeHtml(text: string) {
        const el = document.createElement('div');
        el.textContent = text;
        return el.innerHTML;
    }

    return (
        <div style={{ padding: 10, color: 'var(--vscode-foreground)' }}>
            <div style={{ marginBottom: 10, display: 'flex', gap: 8 }}>
                <button onClick={refresh}>Refresh</button>
                <button onClick={clearAll}>Clear All</button>
            </div>

            <div id="content" className="console-container">
                <InteractionList logs={logs} onSelectionChange={(id) => setSelectedId(id)} />

                <div className="right-panel">
                    {selectedId == null ? (
                        <div className="empty-state">Select an interaction to view details</div>
                    ) : (
                        (() => {
                            const selected = logs.find((l) => l.id === selectedId);
                            if (!selected) return <div className="empty-state">Interaction not found</div>;
                            return <Interaction interaction={selected} key={selected.id} />;
                        })()
                    )}
                </div>
            </div>
        </div>
    );
};

export default ConsoleApp;