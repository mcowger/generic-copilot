import React from 'react';
import Message from './Message';

export interface ToolCall {
    name?: string;
    id?: string;
    input?: any;
}

export interface ResponseType {
    timestamp?: string | number;
    textPartsCount?: number;
    thinkingPartsCount?: number;
    toolCallsCount?: number;
    thinkingContent?: string;
    textContent?: string;
    toolCalls?: ToolCall[];
}

export interface ResponseProps {
    response: ResponseType;
}

export const Response: React.FC<ResponseProps> = ({ response }) => {
    if (!response) return null;

    const time = response.timestamp != null ? new Date(response.timestamp as string | number).toLocaleString() : 'Unknown';

    return (
        <div className="section">
            <div className="section-title">Response</div>
            <div className="metadata">Time: {time}</div>
            <div className="metadata">Text parts: {response.textPartsCount}, Thinking: {response.thinkingPartsCount}, Tool calls: {response.toolCallsCount}</div>

            {response.thinkingContent && (
                <Message role="Thinking" content={response.thinkingContent} />
            )}

            {response.textContent && (
                <Message role="Response" content={response.textContent} />
            )}

            {response.toolCalls?.map((tc, idx) => (
                <div className="tool-call" key={idx}>
                    <strong>{tc.name}</strong> ({tc.id})
                    <br />
                    <pre>{JSON.stringify(tc.input, null, 2)}</pre>
                </div>
            ))}
        </div>
    );
};

export default Response;
