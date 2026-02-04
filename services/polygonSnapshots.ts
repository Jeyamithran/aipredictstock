import { getPolygonApiKey } from './polygonService';

const BASE_URL = 'https://api.polygon.io/v3';

// Re-defining interface if not exported or specific to this logic
interface OptionContractSnapshot {
    ticker: string;
    day: {
        volume: number;
        volume_weighted_price: number;
        open: number;
        close: number;
        high: number;
        low: number;
    };
    details: {
        contract_type: 'call' | 'put';
        exercise_style: string;
        expiration_date: string;
        shares_per_contract: number;
        strike_price: number;
        ticker: string;
    };
    greeks: {
        delta: number;
        gamma: number;
        theta: number;
        vega: number;
    };
    implied_volatility: number;
    open_interest: number;
    underlying_asset: {
        ticker: string;
        change_to_break_even: number;
        last_updated: number;
        price: number;
    };
    last_quote: {
        ask: number;
        bid: number;
        ask_size: number;
        bid_size: number;
    };
}

/**
 * Fetch a single option contract snapshot to get detailed Greeks, IV, and Quote.
 * Used to validate a trade candidate.
 */
export const fetchOptionSnapshot = async (contractTicker: string): Promise<OptionContractSnapshot | null> => {
    const apiKey = getPolygonApiKey();
    if (!apiKey) throw new Error("Polygon API Key missing");

    // Extract underlying from ticker (e.g. O:SPY251219C00500000 -> SPY)
    // Ticker format: O:{Underlying}{YYMMDD}{Type}{Strike}
    let underlying = "SPY"; // Fallback
    try {
        const cleanTicker = contractTicker.replace('O:', '');
        // RegEx to grab leading letters
        const match = cleanTicker.match(/^([A-Z]+)/);
        if (match) underlying = match[1];
    } catch (e) {
        console.warn("Could not parse underlying from", contractTicker);
    }

    const url = `${BASE_URL}/snapshot/options/${underlying}/${contractTicker}?apiKey=${apiKey}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to fetch snapshot for ${contractTicker}: ${response.statusText}`);
            return null;
        }
        const data = await response.json();
        // Polygon returns { results: { ...snapshot... } }
        return data.results as OptionContractSnapshot;
    } catch (error) {
        console.error("Snapshot fetch error", error);
        return null;
    }
};

/**
 * Scan a specific underlying for Active Options.
 * Returns a list of contracts that meet minimum volume criteria.
 * This is the "Smart Scan" component.
 */
export const fetchUnderlyingChainSnapshot = async (underlyingTicker: string, minVolume: number = 100): Promise<OptionContractSnapshot[]> => {
    const apiKey = getPolygonApiKey();
    if (!apiKey) {
        console.warn("[PolygonSnapshot] No API Key provided");
        return [];
    }

    // Get chain for next 30 days using NY Time to ensure accurate trading day
    const now = new Date();
    const nyTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const nextMonth = new Date(nyTime);
    nextMonth.setDate(nyTime.getDate() + 30);

    // YYYY-MM-DD
    const todayStr = nyTime.toISOString().split('T')[0];
    const dateStr = nextMonth.toISOString().split('T')[0];

    // Initial URL
    let url = `${BASE_URL}/snapshot/options/${underlyingTicker}?apiKey=${apiKey}&expiration_date.gte=${todayStr}&expiration_date.lte=${dateStr}&limit=250`;

    let allResults: OptionContractSnapshot[] = [];
    let page = 0;
    const MAX_PAGES = 12; // Fetch up to 3000 contracts (12 * 250)

    try {
        while (url && page < MAX_PAGES) {
            const response = await fetch(url);

            if (response.status === 429) {
                console.warn(`[PolygonSnapshot] Rate Limit Hit for ${underlyingTicker}. Retrying in 2s...`);
                await new Promise(r => setTimeout(r, 2000));
                // Simple retry of same URL
                const retryResponse = await fetch(url);
                if (!retryResponse.ok) {
                    console.error(`[PolygonSnapshot] Retry failed for ${underlyingTicker}: ${retryResponse.status}`);
                    break;
                }
                const data = await retryResponse.json();
                const results = (data.results || []) as OptionContractSnapshot[];
                allResults.push(...results);
                url = data.next_url ? `${data.next_url}&apiKey=${apiKey}` : '';
                page++;
                continue;
            }

            if (!response.ok) {
                console.error(`[PolygonSnapshot] Fetch failed for ${underlyingTicker}: ${response.status} ${response.statusText}`);
                break;
            }

            const data = await response.json();
            const results = (data.results || []) as OptionContractSnapshot[];
            allResults.push(...results);

            // Pagination for next page
            url = data.next_url ? `${data.next_url}&apiKey=${apiKey}` : '';
            page++;

            // Optimization: If we already have enough liquid contacts, maybe stop?
            // But we want to find anomalies, so better to scan wide.
        }

        console.log(`[PolygonSnapshot] Fetched ${allResults.length} total contracts for ${underlyingTicker}. MinVol: ${minVolume}`);

        // Filter by Volume
        const filtered = allResults.filter(c => (c.day?.volume || 0) >= minVolume);

        if (filtered.length === 0 && allResults.length > 0) {
            console.log(`[PolygonSnapshot] All ${allResults.length} contracts filtered out by minVolume=${minVolume}. MaxVol found: ${Math.max(...allResults.map(r => r.day?.volume || 0))}`);
        }

        return filtered;
    } catch (e) {
        console.error(`[PolygonSnapshot] Exception for ${underlyingTicker}:`, e);
        return [];
    }
};
