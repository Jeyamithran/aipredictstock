import { BiasResponse, FlowAggregates } from '../types';

const BASE_API = 'http://localhost:3001/api/odte';

export const fetchODTEBias = async (ticker: string): Promise<BiasResponse | null> => {
    try {
        const res = await fetch(`${BASE_API}/${ticker}/bias`);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.error("Failed to fetch Bias:", e);
        return null; // Fallback handled in UI
    }
};

export const fetchODTEFlow = async (ticker: string): Promise<FlowAggregates | null> => {
    try {
        const res = await fetch(`${BASE_API}/${ticker}/flow`);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.error("Failed to fetch Flow:", e);
        return null;
    }
};
