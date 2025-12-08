import React from 'react';
import Message from './Message';
import ToolCall from './ToolCall';

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
            <div className="metadata">Text Parts: {response.textPartsCount}, Thinking Parts: {response.thinkingPartsCount}, Tool Calls: {response.toolCallsCount}</div>

            {response.thinkingContent && (
                <Message role="Thinking" content={response.thinkingContent} />
            )}

            {response.textContent && (
                <Message role="Response" content={response.textContent} />
            )}

            {response.toolCalls?.map((tc, idx) => (
                <ToolCall key={idx} name={tc.name} id={tc.id} input={tc.input} />
            ))}
        </div>
    );
};

export default Response;
