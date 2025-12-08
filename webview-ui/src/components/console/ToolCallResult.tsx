import React from 'react';
import { stringifyContent } from './ToolCall';

export interface ToolCallResultProps {
    name?: string;
    id?: string;
    output?: any;
}

export const ToolCallResult: React.FC<ToolCallResultProps> = ({ name, id, output }) => {
    const outStr = output ? stringifyContent(output) : '';

    return (
        <div className="message tool-call-result">
            <span className="role role--tool-call-result">Tool Result: {name ?? '(tool)'}{id ? ` (${id})` : ''}:</span>&nbsp;
            <span className="content">{outStr ? <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{outStr}</pre> : ''}</span>
        </div>
    );
};

export default ToolCallResult;
