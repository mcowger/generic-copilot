import React, { useEffect, useState } from 'react';
import Interaction from './Interaction';

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

            <div id="content">
                {logs.length === 0 ? (
                    <div className="empty-state">No interactions logged yet.</div>
                ) : (
                    logs.map((log) => (
                        <Interaction interaction={log} key={log.id} />
                    ))
                )}
            </div>
        </div>
    );
};

export default ConsoleApp;
