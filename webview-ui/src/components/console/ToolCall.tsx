import React from 'react';

export function stringifyContent(c: unknown): string {
    if (typeof c === 'string') return c;
    if (c === undefined || c === null) return '';
    if (Array.isArray(c)) {
        return c
            .map((item) => (typeof item === 'string' ? item : JSON.stringify(item, null, 2)))
            .join('\n');
    }
    try {
        return JSON.stringify(c, null, 2);
    } catch {
        return String(c);
    }
}

export interface ToolCallProps {
    name?: string;
    id?: string;
    input?: any;
}

export const ToolCall: React.FC<ToolCallProps> = ({ name, id, input }) => {
    const inputStr = input ? stringifyContent(input) : '';

    return (
        <div className="message tool-call">
            <span className="role role--tool-call">Tool Call: {name ?? '(tool)'}{id ? ` (${id})` : ''}:</span>&nbsp;
            <span className="content">{inputStr ? <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{inputStr}</pre> : ''}</span>
        </div>
    );
};

export default ToolCall;
