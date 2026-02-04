import { fetchOptionsChain, OptionContract } from './polygonService';

export interface UnusualOption extends OptionContract {
    unusualScore: number;
    scoreBreakdown: {
        volOiScore: number;
        relVolScore: number;
        gammaScore: number;
        spreadScore: number;
        deltaScore: number;
        dteScore: number;
    };
    volToOi: number;
}

interface CacheItem {
    timestamp: number;
    data: UnusualOption[];
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE = new Map<string, CacheItem>();

// Rate Limit State
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 250; // 4 requests per second max

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const respectRateLimit = async () => {
    const now = Date.now();
    const timeSinceLast = now - lastRequestTime;
    if (timeSinceLast < MIN_REQUEST_INTERVAL) {
        await sleep(MIN_REQUEST_INTERVAL - timeSinceLast);
    }
    lastRequestTime = Date.now();
};

export const fetchUnusualOptions = async (
    ticker: string,
    currentPrice: number,
    minVolume: number = 50
): Promise<UnusualOption[]> => {
    const cacheKey = `${ticker}-${Math.floor(currentPrice)}-${minVolume}`;

    // Check Cache
    if (CACHE.has(cacheKey)) {
        const item = CACHE.get(cacheKey)!;
        if (Date.now() - item.timestamp < CACHE_TTL) {
            console.log(`[UnusualOptions] Serving ${ticker} from cache`);
            return item.data;
        }
    }

    try {
        await respectRateLimit();

        // Fetch base chain
        const chain = await fetchOptionsChain(ticker, currentPrice);

        // Filter & Score
        const scored = chain
            .filter(c => (c.details?.volume || 0) >= minVolume)
            .map(c => scoreContract(c))
            .sort((a, b) => b.unusualScore - a.unusualScore);

        // Update Cache
        CACHE.set(cacheKey, {
            timestamp: Date.now(),
            data: scored
        });

        return scored;

    } catch (error) {
        console.error(`[UnusualOptions] Failed to fetch for ${ticker}`, error);
        throw error;
    }
};

const scoreContract = (contract: OptionContract): UnusualOption => {
    const vol = contract.details?.volume || 0;
    const oi = contract.details?.open_interest || 1; // Avoid div by zero
    const spread = (contract.details?.ask || 0) - (contract.details?.bid || 0);
    const price = contract.details?.last_price || 0.01;
    const delta = Math.abs(contract.details?.greeks?.delta || 0);
    const gamma = contract.details?.greeks?.gamma || 0;

    // 1. Volume to OI Ratio (Dominant Factor)
    // User examples: 7.9x -> 100, 23.5x -> 100, 3.9x -> 100?
    // Let's be aggressive: > 5x is automatic high score territory.
    const volOiRatio = vol / oi;
    let volOiScore = 0;
    if (volOiRatio > 10) volOiScore = 60; // Huge anomaly
    else if (volOiRatio > 5) volOiScore = 50;
    else if (volOiRatio > 3) volOiScore = 40;
    else if (volOiRatio > 1.5) volOiScore = 20;
    else volOiScore = 5;

    // 2. Raw Volume Power (Liquidity & Conviction)
    // 50k vol is more significant than 500 vol even if ratio is high
    let relVolScore = 0;
    if (vol > 50000) relVolScore = 30;
    else if (vol > 10000) relVolScore = 20;
    else if (vol > 5000) relVolScore = 15;
    else if (vol > 1000) relVolScore = 10;

    // 3. Spread Quality (Execution Risk)
    // Penalize wide spreads
    const spreadPct = spread / price;
    let spreadScore = spreadPct < 0.02 ? 10 : (spreadPct < 0.05 ? 5 : 0);

    // 4. Gamma/Delta Context
    // 0DTE or high gamma situations
    let gammaScore = 0;
    if (gamma > 0.05) gammaScore = 10; // High gamma risk

    // 5. Delta Context (ITM/OTM preference?)
    // OTM Lottos (low delta) vs ITM Leaps. 
    // Unusual often means weird OTM bets or massive ATM.
    // Let's give points for "Smart" deltas (30-60)
    let deltaScore = (delta >= 0.30 && delta <= 0.60) ? 5 : 0;

    // 6. DTE Factor
    // 0DTEs get a boost
    const today = new Date();
    const exp = new Date(contract.expiration_date);
    const diffTime = Math.abs(exp.getTime() - today.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    let dteScore = diffDays <= 1 ? 5 : 0;

    // Multiplier for Pure Anomaly
    // If Vol > OI * 5 OR Vol > 20k, we want near 100.
    let totalScore = volOiScore + relVolScore + spreadScore + gammaScore + deltaScore + dteScore;

    // BOOST: If Vol/OI is huge, just max it out or close to it
    if (volOiRatio > 5 && vol > 1000) totalScore = Math.max(totalScore, 95);
    if (volOiRatio > 10 && vol > 5000) totalScore = 100;

    totalScore = Math.min(totalScore, 100);

    return {
        ...contract,
        volToOi: volOiRatio,
        unusualScore: totalScore,
        scoreBreakdown: {
            volOiScore,
            relVolScore,
            gammaScore,
            spreadScore,
            deltaScore,
            dteScore
        }
    };
};
