import React from 'react';
import Request from './Request';
import Response from './Response';

export interface InteractionType {
    id: string;
    request?: any;
    response?: any;
}

export interface InteractionProps {
    interaction: InteractionType;
}

export const Interaction: React.FC<InteractionProps> = ({ interaction }) => {
    return (
        <div className="interaction" key={interaction.id}>
            <div className="interaction-header">Interaction: {interaction.id}</div>

            {interaction.request && <Request request={interaction.request} />}
            {interaction.response && <Response response={interaction.response} />}
        </div>
    );
};

export default Interaction;
