import React, { useEffect, useState } from 'react';
import InteractionListItem from './InteractionListItem';

export interface LogMessageShort {
    id: string;
    request?: any;
    response?: any;
}

export interface InteractionListProps {
    logs: LogMessageShort[];
    onSelectionChange?: (id: string | null) => void;
}

const toTime = (item: LogMessageShort) => {
    const t = item.request?.timestamp;
    if (t != null) {
        const n = Number(t);
        if (!isNaN(n)) return n;
        const parsed = Date.parse(String(t));
        if (!isNaN(parsed)) return parsed;
    }

    if (typeof item.id === 'string') {
        const m = item.id.match(/^(\d{1,2}:\d{2}:\d{2})/);
        if (m) {
            const today = new Date();
            const dt = new Date(`${today.toDateString()} ${m[1]}`);
            if (!isNaN(dt.getTime())) return dt.getTime();
        }
    }

    return 0;
};

export const InteractionList: React.FC<InteractionListProps> = ({ logs = [], onSelectionChange }) => {
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // keep selection in sync with logs; pick newest when nothing selected
    const orderedLogs = (() => {
        if (!logs || logs.length === 0) return logs.slice();
        const first = toTime(logs[0]);
        const last = toTime(logs[logs.length - 1]);
        if (first === 0 && last === 0) return logs.slice().reverse();
        if (first <= last) return logs.slice().reverse();
        return logs.slice();
    })();

    useEffect(() => {
        if (!logs || logs.length === 0) {
            setSelectedId(null);
            onSelectionChange?.(null);
            return;
        }

        const found = logs.find((l) => l.id === selectedId);
        if (!found) {
            const pick = orderedLogs[0]?.id ?? null;
            setSelectedId(pick);
            onSelectionChange?.(pick ?? null);
        }
    }, [logs]);

    useEffect(() => {
        onSelectionChange?.(selectedId ?? null);
    }, [selectedId]);

    return (
        <div className="left-panel">
            <div className="section-title">Interactions</div>

            {orderedLogs.length === 0 ? (
                <div className="empty-state">No interactions logged yet.</div>
            ) : (
                <ul className="interaction-list">
                    {orderedLogs.map((log) => (
                        <InteractionListItem key={log.id} log={log} selected={selectedId === log.id} onSelect={(id) => setSelectedId(id)} />
                    ))}
                </ul>
            )}
        </div>
    );
};

export default InteractionList;
