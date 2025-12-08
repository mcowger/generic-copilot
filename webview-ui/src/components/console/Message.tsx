import React, { useState } from 'react';
import { stringifyContent } from './ToolCall';
import ToolCallResult from './ToolCallResult';

export interface MessageProps {
    role: string | number;
    content: string | unknown;
}

export const Message: React.FC<MessageProps> = ({ role, content }) => {
    const roleLabel = typeof role === 'number'
        ? (role === 3 ? 'System' : role === 1 ? 'User' : role === 2 ? 'Assistant' : 'Unknown')
        : role;

    const [expanded, setExpanded] = useState(false);

    const isToolResultPart = (item: unknown) => {
        if (!item || typeof item !== 'object') return false;
        const obj = item as Record<string, any>;
        return (
            obj.type === 'tool-result' ||
            'output' in obj ||
            'toolCallId' in obj ||
            'toolName' in obj ||
            'result' in obj
        );
    };

    // If content is an array, keep parts so we can render tool-result parts inline while preserving surrounding text
    const isArrayContent = Array.isArray(content);

    const arrayParts = isArrayContent ? (content as any[]) : [];

    const hasToolResultParts = isArrayContent ? arrayParts.some(isToolResultPart) : isToolResultPart(content);

    const renderedContent = !hasToolResultParts ? stringifyContent(content) : undefined;

    const PREVIEW_WORDS = 50;
    const words = renderedContent ? (renderedContent.trim().length === 0 ? [] : renderedContent.trim().split(/\s+/)) : [];
    const shouldTruncate = words.length > PREVIEW_WORDS;
    const previewText = shouldTruncate ? words.slice(0, PREVIEW_WORDS).join(' ') : (renderedContent ?? '');

    const makeRoleClass = (label: string | number) => {
        const key = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-');
        return `role role--${key}`;
    };

    return (
        <div className="message">
            <span className={makeRoleClass(roleLabel)}>{roleLabel}:</span>&nbsp;
            {shouldTruncate && (
                <button
                    className="preview-toggle"
                    aria-expanded={expanded}
                    onClick={() => setExpanded((s) => !s)}
                    title={expanded ? 'Collapse' : 'Expand'}
                    style={{
                        marginRight: 8,
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        color: 'inherit',
                        fontSize: '0.9em',
                        verticalAlign: 'middle',
                    }}
                >
                    {expanded ? '▼' : '▶'}
                </button>
            )}

            <span className="content">
                {hasToolResultParts ? (
                    // Render the array parts in sequence, using ToolCallResult for tool-result parts and plain text for others
                    arrayParts.map((part: any, idx: number) =>
                        isToolResultPart(part) ? (
                            <ToolCallResult key={idx} id={part.toolCallId ?? part.callId} output={part.output ?? part.result ?? part.content ?? part.value ?? part.text} />
                        ) : (
                            // Non-tool part: display as text (stringify complex objects), preserve newlines
                            <pre key={idx} style={{ display: 'inline', whiteSpace: 'pre-wrap', margin: 0 }}>
                                {typeof part === 'string' ? part : JSON.stringify(part, null, 2)}
                            </pre>
                        )
                    )
                ) : (
                    shouldTruncate ? (expanded ? renderedContent : previewText + '...') : renderedContent
                )}
            </span>
        </div>
    );
};

export default Message;
