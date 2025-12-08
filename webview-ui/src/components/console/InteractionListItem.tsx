import React from 'react';

export interface ListItemProps {
    log: { id: string; request?: any; response?: any };
    selected?: boolean;
    onSelect?: (id: string) => void;
}

export const InteractionListItem: React.FC<ListItemProps> = ({ log, selected, onSelect }) => {
    const ts = log.request?.timestamp ?? undefined;
    let timeStr = '';
    if (ts != null) {
        const n = Number(ts);
        let d: Date | null = null;
        if (!isNaN(n)) d = new Date(n);
        else {
            const parsed = Date.parse(String(ts));
            if (!isNaN(parsed)) d = new Date(parsed);
        }
        if (d && !isNaN(d.getTime())) timeStr = d.toLocaleTimeString();
    }

    if (!timeStr && typeof log.id === 'string') {
        const m = log.id.match(/^(\d{1,2}:\d{2}:\d{2})/);
        if (m) {
            const today = new Date();
            const dt = new Date(`${today.toDateString()} ${m[1]}`);
            if (!isNaN(dt.getTime())) timeStr = dt.toLocaleTimeString();
        }
    }

    const msgCount = log.request?.messageCount ?? log.request?.messages?.length ?? 0;
    const toolsCount = log.request?.toolsCount ?? 0;

    const shortTime = timeStr ? timeStr.replace(/:\d{2}\s*/, '') : '';
    const shortMsgs = `${msgCount}${msgCount !== 1 ? 'm' : 'm'}`;
    const shortTools = `${toolsCount}t`;

    return (
        <li
            key={log.id}
            className={"interaction-list-item" + (selected ? ' selected' : '')}
            onClick={() => onSelect?.(log.id)}
        >
            <div className="interaction-list-title">{log.id}</div>
            <div className="interaction-list-meta">
                <span className="meta-left">{log.request?.modelSlug || log.request?.modelId || '—'}</span>
                <span className="meta-right">{shortTime ? shortTime + ' · ' : ''}{shortMsgs} · {shortTools}</span>
            </div>
        </li>
    );
};

export default InteractionListItem;
