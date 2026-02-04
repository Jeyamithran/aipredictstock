
import { ShortInterestResult } from '../types';

const API_KEY = "xDtnX_cc_ywfkjOBF3HuLOEVwzq2qp_E"; // Provided static key
const BASE_URL = "https://api.massive.com/stocks/v1/short-interest";

export interface ShortInterestResponse {
    status: string;
    request_id: string;
    results: ShortInterestResult[];
    next_url?: string;
}

export const getShortInterest = async (ticker: string, limit: number = 10): Promise<ShortInterestResult[]> => {
    try {
        const url = `${BASE_URL}?ticker=${ticker}&limit=${limit}&sort=settlement_date.desc&apiKey=${API_KEY}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        const data: ShortInterestResponse = await response.json();

        if (data.status !== 'OK') {
            throw new Error(`API returned status: ${data.status}`);
        }

        return data.results || [];
    } catch (error) {
        console.error("Failed to fetch short interest:", error);
        return [];
    }
};

import { fetchMarketActives } from './fmpService';
import { WATCHLIST_TICKERS, SHORT_SQUEEZE_CANDIDATES } from '../constants';

export const scanMarketForHighShortInterest = async (): Promise<ShortInterestResult[]> => {
    try {
        // 1. Gather Dynamic Tickers (Market Movers)
        // fetchMarketActives returns { gainers, losers, active }
        const { gainers, losers, active } = await fetchMarketActives();

        const movers = [
            ...(active || []).map(s => s.ticker),
            ...(gainers || []).map(s => s.ticker),
            ...(losers || []).map(s => s.ticker)
        ];

        // 2. Combine with Static Candidates
        const allCandidates = new Set([
            ...SHORT_SQUEEZE_CANDIDATES,
            ...WATCHLIST_TICKERS,
            ...movers
        ]);

        // Limit to top 30 to respect rate limits / performance
        // We prioritize Short Squeeze Candidates first, then Gainers (squeeze potential), then Losers, then Actives.
        const prioritizedList = Array.from(allCandidates).slice(0, 30);

        // 3. Batch Fetch Short Interest
        // We do this concurrently.
        const promises = prioritizedList.map(async (ticker) => {
            try {
                const results = await getShortInterest(ticker, 1);
                if (results.length > 0) {
                    return { ...results[0], ticker }; // Ensure ticker is attached
                }
                return null;
            } catch {
                return null;
            }
        });

        const results = await Promise.all(promises);
        const validResults = results.filter((r): r is ShortInterestResult => r !== null);

        // 4. Sort by Days To Cover (descending) as default squeeze metric
        return validResults.sort((a, b) => b.days_to_cover - a.days_to_cover);

    } catch (e) {
        console.error("Market Scan Failed", e);
        return [];
    }
};
