import React from 'react';

export interface MessageProps {
    role: string | number;
    content: string;
}

export const Message: React.FC<MessageProps> = ({ role, content }) => {
    const roleLabel = typeof role === 'number'
        ? (role === 3 ? 'System' : role === 1 ? 'User' : role === 2 ? 'Assistant' : 'Unknown')
        : role;

    return (
        <div className="message">
            <span className="role">{roleLabel}:</span>&nbsp;{content}
        </div>
    );
};

export default Message;
