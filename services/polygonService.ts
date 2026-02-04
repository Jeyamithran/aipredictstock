
import { calculateSmartSentiment, SentimentLabel } from '../utils/analysis';

export interface OptionContract {
    ticker: string;
    underlying_ticker: string;
    strike_price: number;
    expiration_date: string;
    contract_type: 'call' | 'put';
    details?: {
        volume: number;
        open_interest: number;
        implied_volatility: number;
        bid?: number;
        ask?: number;
        last_price?: number;
        greeks?: {
            delta: number;
            gamma: number;
            theta: number;
            vega: number;
        };
    };
}

export interface OptionsFlowData {
    sentiment: SentimentLabel;
    putCallRatio: number;
    netGamma: number;
    topCalls: OptionContract[];
    topPuts: OptionContract[];
    totalCallVol: number;
    totalPutVol: number;
}

// Internal Interfaces for Polygon API Responses
export interface PolygonSnapshotResult {
    ticker: string;
    underlying_asset: { ticker: string };
    details?: {
        ticker?: string;
        strike_price: number;
        expiration_date: string;
        contract_type: 'call' | 'put';
    };
    day: { volume?: number; close?: number };
    open_interest?: number;
    implied_volatility?: number;
    last_quote?: { bid?: number; ask?: number };
    greeks?: { delta?: number; gamma?: number; theta?: number; vega?: number };
}

interface PolygonTradeResult {
    id: string;
    price: number;
    size: number;
    timestamp: number;
    conditions?: number[];
    exchange?: number;
}

const BASE_URL = 'https://api.polygon.io/v3';

export const getPolygonApiKey = (): string => {
    // Priority: Vite Env -> Window Env -> LocalStorage
    const viteEnv = (import.meta as any).env?.VITE_POLYGON_API_KEY;
    if (viteEnv) return viteEnv;

    if (typeof window !== 'undefined') {
        const winEnv = (window as any).env?.VITE_POLYGON_API_KEY;
        if (winEnv) return winEnv;
        return localStorage.getItem('polygon_api_key') || '';
    }
    return '';
};

export const fetchOptionsChain = async (ticker: string, currentPrice?: number): Promise<OptionContract[]> => {
    if (!ticker) throw new Error("Ticker is required");
    const apiKey = getPolygonApiKey();
    if (!apiKey) throw new Error("Polygon API Key missing");

    // Strategy: Get contracts expiring in the next 14 days
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 14);

    const todayStr = today.toISOString().split('T')[0];
    const dateStr = nextWeek.toISOString().split('T')[0];

    // Endpoint: /v3/snapshot/options/{underlyingAsset}
    let url = `${BASE_URL}/snapshot/options/${ticker}?apiKey=${apiKey}&expiration_date.gte=${todayStr}&expiration_date.lte=${dateStr}&limit=250`;

    // Filter by Strike Price if currentPrice is known to ensure relevance (ATM)
    if (currentPrice) {
        const minStrike = Math.floor(currentPrice * 0.85); // -15%
        const maxStrike = Math.ceil(currentPrice * 1.15);  // +15%
        url += `&strike_price.gte=${minStrike}&strike_price.lte=${maxStrike}`;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 429) throw new Error("Polygon Rate Limit Exceeded");
            throw new Error(`Polygon API Error: ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.results) return [];

        // Map to our interface
        return data.results.map((r: PolygonSnapshotResult) => ({
            ticker: r.details?.ticker || r.ticker,
            underlying_ticker: r.underlying_asset.ticker,
            strike_price: r.details?.strike_price || 0,
            expiration_date: r.details?.expiration_date || '',
            contract_type: r.details?.contract_type || 'call',
            details: {
                volume: r.day.volume || 0,
                open_interest: r.open_interest || 0,
                implied_volatility: r.implied_volatility || 0,
                bid: r.last_quote?.bid || 0,
                ask: r.last_quote?.ask || 0,
                last_price: r.day.close || r.last_quote?.ask || 0,
                greeks: r.greeks ? {
                    delta: r.greeks.delta || 0,
                    gamma: r.greeks.gamma || 0,
                    theta: r.greeks.theta || 0,
                    vega: r.greeks.vega || 0
                } : undefined
            }
        }));

    } catch (error) {
        console.error("Polygon Fetch Error:", error);
        throw error;
    }
};

export const calculateOptionsFlow = (contracts: OptionContract[]): OptionsFlowData => {
    let totalCallVol = 0;
    let totalPutVol = 0;
    let netGamma = 0;

    const calls: OptionContract[] = [];
    const puts: OptionContract[] = [];

    contracts.forEach(c => {
        const vol = c.details?.volume || 0;
        const gamma = c.details?.greeks?.gamma || 0;

        if (c.contract_type === 'call') {
            totalCallVol += vol;
            netGamma += (gamma * vol); // Gamma Exposure proxy
            calls.push(c);
        } else {
            totalPutVol += vol;
            netGamma -= (gamma * vol); // Puts have negative gamma impact usually (dealer short gamma)
            puts.push(c);
        }
    });

    // Sort by Volume
    calls.sort((a, b) => (b.details?.volume || 0) - (a.details?.volume || 0));
    puts.sort((a, b) => (b.details?.volume || 0) - (a.details?.volume || 0));

    const pcr = totalCallVol > 0 ? totalPutVol / totalCallVol : 1;

    // Sentiment Logic
    const analysis = calculateSmartSentiment(totalPutVol, totalCallVol);
    let sentiment = analysis.sentiment;

    // Refine with Gamma
    if (netGamma > 0 && sentiment === 'BULLISH') sentiment = 'BULLISH';
    if (netGamma < 0 && sentiment === 'BEARISH') sentiment = 'BEARISH';

    return {
        sentiment,
        putCallRatio: pcr,
        netGamma,
        topCalls: calls.slice(0, 5),
        topPuts: puts.slice(0, 5),
        totalCallVol,
        totalPutVol
    };
};

export interface TradeIntent {
    aggressionScore: number; // -1 (Net Sell) to 1 (Net Buy)
    isHedge: boolean;
    flowType: 'BLOCK' | 'SWEEP' | 'RETAIL';
    dominantSide: 'BID' | 'ASK' | 'MID';
    whaleConfidence: 'HIGH' | 'LOW';
}

// Fetch Individual Trades to spot Sweeps/Blocks
export const fetchContractTrades = async (contractTicker: string): Promise<PolygonTradeResult[]> => {
    const apiKey = getPolygonApiKey();

    // Use NY date to ensure we query the correct "Trading Day"
    const now = new Date();
    const nyTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const today = nyTime.toISOString().split('T')[0];

    // Get last 500 trades for this specific contract
    const url = `https://api.polygon.io/v3/trades/${contractTicker}?timestamp=${today}&limit=500&sort=timestamp&order=desc&apiKey=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        return data.results || [];
    } catch (e) {
        console.error("Failed to fetch trades", e);
        return [];
    }
};

// Basic Stock Snapshot Interface
export interface PolygonStockSnapshot {
    ticker: string;
    day: {
        c: number; // Close
        h: number; // High
        l: number; // Low
        o: number; // Open
        v: number; // Volume
        vw: number; // VWAP
    };
    lastTrade: {
        p: number; // Price
        s: number; // Size
        t: number; // Timestamp
    };
    todaysChange: number;
    todaysChangePerc: number;
    updated: number;
}

export const fetchPolygonStockSnapshot = async (ticker: string): Promise<PolygonStockSnapshot | null> => {
    const apiKey = getPolygonApiKey();
    if (!apiKey) throw new Error("Polygon API Key missing");

    const url = `${BASE_URL.replace('/v3', '/v2')}/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${apiKey}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error(`Polygon Snapshot Error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.ticker ? data.ticker : null;
    } catch (error) {
        console.error("Polygon Snapshot Fetch Error:", error);
        return null;
    }
};

// The "Hedge vs Bet" Algorithm
export const analyzeInstitutionalIntent = (
    trades: PolygonTradeResult[],
    currentStockTrend: SentimentLabel,
    contractType: 'call' | 'put'
): TradeIntent => {
    let blockCount = 0;
    let sweepCount = 0;

    trades.forEach(t => {
        const size = t.size || 0;

        // Heuristic: Detect Block vs Sweep
        // Block: Large single print (> 200 contracts)
        if (size > 200) {
            blockCount++;
        } else {
            sweepCount++;
        }
    });

    // The "Fake Hedge" Filter Logic
    let isHedge = false;

    // Logic: If Block Trade count is high AND it opposes the trend, assume Hedge.
    if (blockCount > sweepCount) {
        const isBullishTrend = currentStockTrend === 'BULLISH' || currentStockTrend === 'REVERSAL_RISK_LOW';
        const isBearishTrend = currentStockTrend === 'BEARISH' || currentStockTrend === 'STRONG_BEARISH' || currentStockTrend === 'REVERSAL_RISK_HIGH';

        if (isBullishTrend && contractType === 'put') isHedge = true; // Protecting Longs
        if (isBearishTrend && contractType === 'call') isHedge = true; // Protecting Shorts
    }

    // Logic: If Sweeps are high AND matches trend (or reversal logic), it's a Bet.
    const aggressionScore = sweepCount > blockCount ? 0.8 : 0.2;

    return {
        aggressionScore: isHedge ? 0 : aggressionScore,
        isHedge,
        flowType: blockCount > sweepCount ? 'BLOCK' : 'SWEEP',
        dominantSide: 'ASK', // Placeholder for real NBBO comparison
        whaleConfidence: isHedge ? 'LOW' : 'HIGH'
    };
};

export const filterPromisingContracts = async (
    contracts: OptionContract[],
    sentiment: SentimentLabel
): Promise<OptionContract[]> => {
    // Phase 1: Hard Filters (Math)
    const baseCandidates = contracts.filter(c => {
        const vol = c.details?.volume || 0;
        const bid = c.details?.bid || 0;
        const ask = c.details?.ask || 0;
        const spread = ask - bid;

        // Liquidity: Institutional Size
        if (vol < 50) return false;

        // Spread: Tight Execution (Max 2% spread or 5 cents)
        if (spread > 0.05 && spread > (ask * 0.02)) return false;

        const delta = Math.abs(c.details?.greeks?.delta || 0);

        // Delta Sweet Spot (ATM Gamma Zone)
        return delta >= 0.40 && delta <= 0.65;
    });

    // Phase 2: The "Whale Intent" Check (Async)
    // We only analyze the top 3 candidates to save API calls (Rate Limit Protection)
    const top3 = baseCandidates.sort((a, b) => (b.details?.volume || 0) - (a.details?.volume || 0)).slice(0, 3);

    const validatedCandidates = await Promise.all(top3.map(async (c) => {
        // Fetch recent trades for this specific contract
        const trades = await fetchContractTrades(c.ticker);

        // Analyze Intent
        const intent = analyzeInstitutionalIntent(trades, sentiment, c.contract_type);

        // FILTER: Remove Hedges
        if (intent.isHedge) return null;

        // FILTER: Remove "Passive" Blocks (Low Aggression)
        if (intent.flowType === 'BLOCK' && intent.aggressionScore < 0.5) return null;

        return { ...c, intent }; // Attach intent data for the UI/AI
    }));

    return validatedCandidates
        .filter((c): c is OptionContract & { intent: TradeIntent } => c !== null)
        .sort((a, b) => b.intent.aggressionScore - a.intent.aggressionScore);
};

export const fetchPolygonMarketActives = async (apiKey: string): Promise<{ gainers: { ticker: string }[], losers: { ticker: string }[], active: { ticker: string }[] }> => {
    // Fallback Mode: Use Grouped Daily (Aggregates)
    // Loop back up to 5 days to find the last valid trading day (handling Holidays/Weekends)

    let attempts = 0;
    const date = new Date();
    date.setDate(date.getDate() - 1); // Start checking from yesterday

    while (attempts < 5) {
        const dateStr = date.toISOString().split('T')[0];
        console.log(`[Polygon] Checking Grouped Daily for ${dateStr}...`);

        const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${dateStr}?adjusted=true&apiKey=${apiKey}`;

        try {
            const response = await fetch(url);

            if (response.status === 429) {
                console.warn(`[Polygon] Rate Limited (429) for ${dateStr}. Pausing 2s before retry...`);
                await new Promise(r => setTimeout(r, 2000));
                // Do NOT decrement date, retry same day? OR decrement and wait. 
                // Logic choice: If rate limited, waiting is key. We can try same day again or skip. 
                // Better approach: Wait and CONTINUE loop to try previous day, spreading out requests.
                // We just continue to the next day logic but with a delay.
            } else if (response.ok) {
                const data = await response.json();
                const results = (data.results || []) as any[];

                if (results.length > 0) {
                    // ... (success logic) ... 
                    // [OMITTED FOR BREVITY - KEEP EXISTING LOGIC IN REPLACEMENT IF FULL BLOCK]
                    // Since I cannot omit in ReplacementContent, I will paste the SUCCESS block fully below.
                    console.log(`[Polygon] Found data for ${dateStr} (${results.length} tickers)`);

                    // Filter and Sort locally
                    // 1. Filter Penny Stocks
                    const liquid = results.filter(r => (r.v > 100000) && (r.c > 5));

                    // 2. Sort by Volume
                    const activeRaw = [...liquid].sort((a, b) => b.v - a.v).slice(0, 20);

                    // 3. Sort by Gain/Loss (%)
                    const sortedByChange = [...liquid].sort((a, b) => {
                        const changeA = (a.c - a.o) / a.o;
                        const changeB = (b.c - b.o) / b.o;
                        return changeB - changeA;
                    });

                    const gainersRaw = sortedByChange.slice(0, 20);
                    const losersRaw = sortedByChange.slice(-20).reverse();

                    return {
                        active: activeRaw.map(r => ({ ticker: r.T })),
                        gainers: gainersRaw.map(r => ({ ticker: r.T })),
                        losers: losersRaw.map(r => ({ ticker: r.T }))
                    };
                }
            }
        } catch (e) {
            console.warn(`[Polygon] Failed fetch for ${dateStr}`, e);
        }

        // Retry previous day
        date.setDate(date.getDate() - 1);
        attempts++;
        // General polite delay between loop iterations
        await new Promise(r => setTimeout(r, 1500));
    }

    console.error("[Polygon] Could not find any market data in the last 5 days.");
    return { gainers: [], losers: [], active: [] };
};

// News Interface compatible with FMP
export interface PolygonNewsItem {
    publishedDate: string;
    title: string;
    image: string;
    site: string;
    text: string;
    url: string;
}

// Rate limit helper
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export const fetchPolygonNews = async (ticker: string, limit: number = 5): Promise<PolygonNewsItem[]> => {
    // Basic rate limit protection
    await delay(350);
    const apiKey = getPolygonApiKey();
    if (!apiKey) return [];

    const url = `https://api.polygon.io/v2/reference/news?ticker=${ticker}&limit=${limit}&order=desc&sort=published_utc&apiKey=${apiKey}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`Polygon News failed: ${response.status}`);
            return [];
        }
        const data = await response.json();
        const results = data.results || [];

        return results.map((item: any) => ({
            publishedDate: item.published_utc,
            title: item.title,
            image: item.image_url || '',
            site: item.publisher?.name || 'Polygon',
            text: item.description || '',
            url: item.article_url
        }));
    } catch (e) {
        console.error("Polygon News Fetch Error:", e);
        return [];
    }
};
