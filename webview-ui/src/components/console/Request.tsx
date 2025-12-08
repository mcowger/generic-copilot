import React from 'react';
import Message from './Message';

export interface RequestType {
    modelId?: string;
    modelSlug?: string;
    timestamp?: string | number;
    messageCount?: number;
    toolsCount?: number;
    messages?: Array<{ role: string; content: string }>;
}

export interface RequestProps {
    request: RequestType;
}

export const Request: React.FC<RequestProps> = ({ request }) => {
    if (!request) return null;

    const time = request.timestamp != null ? new Date(request.timestamp as string | number).toLocaleString() : 'Unknown';

    return (
        <div className="section">
            <div className="section-title">Request</div>
            <div className="metadata">Model: {request.modelId} ({request.modelSlug})</div>
            <div className="metadata">Time: {time}</div>
            <div className="metadata">Messages: {request.messageCount}, Tools: {request.toolsCount}</div>

            {request.messages?.map((msg, idx) => (
                <Message key={idx} role={msg.role} content={msg.content} />
            ))}
        </div>
    );
};

export default Request;
