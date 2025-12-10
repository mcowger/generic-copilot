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
    // Token usage data from Vercel AI SDK
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
        reasoningTokens?: number;
        cachedInputTokens?: number;
    };
    // Performance metrics
    durationMs?: number;
    tokensPerSecond?: number;
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
            {response.usage && (
                <div className="metadata">
                    Tokens: {response.usage.totalTokens ?? 0}
                    (Input: {response.usage.inputTokens ?? 0},
                     Output: {response.usage.outputTokens ?? 0}
                     {response.usage.reasoningTokens ? `, Reasoning: ${response.usage.reasoningTokens}` : ""}
                     {response.usage.cachedInputTokens ? `, Cached: ${response.usage.cachedInputTokens}` : ""})
                </div>
            )}
            {response.durationMs !== undefined && (
                <div className="metadata">
                    Duration: {(response.durationMs / 1000).toFixed(1)}s | Rate: {response.tokensPerSecond ?? 0} tokens/s
                </div>
            )}

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
