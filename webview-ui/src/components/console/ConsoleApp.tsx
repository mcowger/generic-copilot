import React, { useEffect, useState } from 'react';

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
                        <div className="interaction" key={log.id}>
                            <div className="interaction-header">Interaction: {log.id}</div>

                            {log.request && (
                                <div className="section">
                                    <div className="section-title">Request</div>
                                    <div className="metadata">Model: {log.request.modelId} ({log.request.modelSlug})</div>
                                    <div className="metadata">Time: {new Date(log.request.timestamp).toLocaleString()}</div>
                                    <div className="metadata">Messages: {log.request.messageCount}, Tools: {log.request.toolsCount}</div>

                                    {log.request.messages.map((msg: any, idx: number) => (
                                        <div className="message" key={idx}><span className="role">{msg.role}:</span>&nbsp;{msg.content}</div>
                                    ))}
                                </div>
                            )}

                            {log.response && (
                                <div className="section">
                                    <div className="section-title">Response</div>
                                    <div className="metadata">Time: {new Date(log.response.timestamp).toLocaleString()}</div>
                                    <div className="metadata">Text parts: {log.response.textPartsCount}, Thinking: {log.response.thinkingPartsCount}, Tool calls: {log.response.toolCallsCount}</div>

                                    {log.response.thinkingContent && (
                                        <div className="message"><span className="role">Thinking:</span>&nbsp;{log.response.thinkingContent}</div>
                                    )}

                                    {log.response.textContent && (
                                        <div className="message"><span className="role">Response:</span>&nbsp;{log.response.textContent}</div>
                                    )}

                                    {log.response.toolCalls.map((tc: any, idx: number) => (
                                        <div className="tool-call" key={idx}><strong>{tc.name}</strong> ({tc.id})<br /><pre>{JSON.stringify(tc.input, null, 2)}</pre></div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default ConsoleApp;
