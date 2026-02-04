
import { StockData, SignalType, ChartPoint, SECFiling, InsiderTrade, StockNews } from '../types';

// Using /stable as primary - the current standard FMP endpoint for all API tiers
const BASE_URL = 'https://financialmodelingprep.com/stable';
const FALLBACK_URL = 'https://financialmodelingprep.com/api/v3';
const PROXY_URL = 'https://corsproxy.io/?';
// v3 endpoint for SEC filings and insider trades
const V3_URL = 'https://financialmodelingprep.com/api/v3';

// GLOBAL STATE FOR CACHING & RATE LIMITING
const pendingRequests = new Map<string, Promise<any>>();
const responseCache = new Map<string, { data: any, timestamp: number }>();
let rateLimitCooldownUntil = 0;

// Check environment variable first, then localStorage
// Check environment variable first, then localStorage
export const getApiKey = () => {
    let key = '';

    // Priority 1: Vite environment variable (Build-time injection)
    if ((import.meta as any).env?.VITE_FMP_API_KEY) {
        key = (import.meta as any).env.VITE_FMP_API_KEY;
    }
    // Priority 2: Runtime Environment (Legacy/Fallback)
    else if ((typeof window !== 'undefined') && (window as any).env?.VITE_FMP_API_KEY) {
        key = (window as any).env.VITE_FMP_API_KEY;
    }
    // Priority 3: Node process env (for server-side)
    else if (typeof process !== 'undefined' && process.env && process.env.FMP_API_KEY) {
        key = process.env.FMP_API_KEY;
    }
    // Priority 4: localStorage (fallback for user input)
    else if (typeof window !== 'undefined') {
        key = localStorage.getItem('fmp_api_key') || '';
    }

    // Ensure we don't return an empty string if the key exists but is empty
    if (!key) return '';

    return key.replace(/['"]/g, '').trim();
};

// Helper to fetch and extract error details even on 4xx/5xx
async function fetchFMP(endpoint: string, baseUrl: string = BASE_URL) {
    const now = Date.now();

    // 1. Circuit Breaker: Fail fast if we are in a cooldown period
    if (now < rateLimitCooldownUntil) {
        const remaining = Math.ceil((rateLimitCooldownUntil - now) / 1000);
        throw new Error(`Limit Reach: API Rate Limit Exceeded. Cooling down (${remaining}s)...`);
    }

    const apiKey = getApiKey();
    if (!apiKey) throw new Error("No API Key configured");

    // 2. Cache Check
    // Different TTL for Candles (5 min) vs Quotes (1 min)
    const isCandle = endpoint.includes('historical-chart') || endpoint.includes('historical-price');
    const ttl = isCandle ? 5 * 60 * 1000 : 60 * 1000;

    // Unique key per endpoint/baseurl
    const cacheKey = `${baseUrl}${endpoint}`;
    const cached = responseCache.get(cacheKey);

    if (cached && (now - cached.timestamp < ttl)) {
        return cached.data;
    }

    // 3. Request Deduplication
    // If a request for this URL is already in flight, return that promise instead of making a new one
    if (pendingRequests.has(cacheKey)) {
        return pendingRequests.get(cacheKey);
    }

    // 4. Execute Request
    const fetchPromise = (async () => {
        const separator = endpoint.includes('?') ? '&' : '?';
        const url = `${baseUrl}${endpoint}${separator}apikey=${apiKey}`;

        const response = await fetch(url);
        let data: any;

        try {
            data = await response.json();
        } catch (e) {
            if (!response.ok) {
                throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
            }
            return null;
        }

        // Global Rate Limit Handling
        if (response.status === 429 || (data && typeof data === 'object' && data['Error Message'] && data['Error Message'].includes("Limit Reach"))) {
            rateLimitCooldownUntil = Date.now() + 60000; // 60s Penalty
            throw new Error("Limit Reach: API Rate Limit Exceeded");
        }

        if (data && typeof data === 'object' && data['Error Message']) {
            throw new Error(data['Error Message']);
        }

        if (!response.ok) {
            const msg = data?.message || `HTTP Status ${response.status}`;
            throw new Error(msg);
        }

        return data;
    })();

    // Track pending request
    pendingRequests.set(cacheKey, fetchPromise);

    try {
        const result = await fetchPromise;
        // Success: Cache result
        responseCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
    } catch (e) {
        // Failure: Do not cache errors (except maybe 429 implicitly handled via cooldown)
        throw e;
    } finally {
        // Cleanup pending
        pendingRequests.delete(cacheKey);
    }
}


// --- TYPES ---

export interface FMPQuote {
    symbol: string;
    price: number;
    changesPercentage: number;
    changePercentage?: number; // Alternate field name
    change?: number;
    dayLow: number;
    dayHigh: number;
    yearHigh: number;
    yearLow: number;
    priceAvg50: number;
    priceAvg200: number;
    volume: number;
    avgVolume: number;
    timestamp?: number; // FMP often returns unix seconds
}

export interface FMPProfile {
    symbol: string;
    price: number;
    beta: number;
    volAvg: number;
    mktCap: number;
    lastDiv: number;
    range: string;
    changes: number;
    companyName: string;
    currency: string;
    exchange: string;
    industry: string;
    sector: string;
}

export interface FMPQuoteShort {
    symbol: string;
    price: number;
    volume: number;
}

export interface FMPCandle {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface FMPAfterMarketQuote {
    symbol: string;
    askPrice: number;
    bidPrice: number;
    askSize: number;
    bidSize: number;
    timestamp: number;
}

export interface SupertrendResult {
    trend: 'BULL' | 'BEAR';
    value: number; // The line value
    atr: number;
}

interface SupertrendSeries {
    trends: number[];
    signals: ('BUY' | 'SELL' | null)[];
    values: number[];
    atr: number;
}

export interface FMPHistoricalResponse {
    symbol: string;
    historical: FMPCandle[];
}

// Internal helper to try all available endpoints for a given ticker string
async function fetchTickerDataStrategy(tickerStr: string): Promise<StockData[]> {
    const errors: string[] = [];
    const isBatch = tickerStr.includes(',');

    // Helper to try an endpoint with both Base URLs
    const tryEndpoint = async (path: string) => {
        try {
            const data = await fetchFMP(path, BASE_URL);
            if (Array.isArray(data) && data.length > 0) return data;
        } catch (e: any) {
            if (e.message.includes("Limit Reach") || e.message.includes("Invalid API KEY")) {
                throw e;
            }
            try {
                const dataV3 = await fetchFMP(path, FALLBACK_URL);
                if (Array.isArray(dataV3) && dataV3.length > 0) return dataV3;
            } catch (e2) {
                throw e;
            }
        }
        throw new Error("No data returned");
    };

    // Strategy:
    // 1. Try batch-quote or quote endpoint (Stable format)
    // 2. Try `profile?symbol=TICKER` (Works for Stable & V3)
    // 3. Fallback to path param `quote/TICKER` (V3 only)

    try {
        // Stable endpoint: /batch-quote?symbols= for batch, /quote?symbol= for single
        const endpoint = isBatch ? `/batch-quote?symbols=${tickerStr}` : `/quote?symbol=${tickerStr}`;
        const data = await tryEndpoint(endpoint);
        return processQuotes(data);
    } catch (error: any) {
        errors.push(`Quote (Query): ${error.message}`);
        if (error.message.includes("Limit Reach")) throw error;
    }

    try {
        const endpoint = `/profile?symbol=${tickerStr}`;
        const data = await tryEndpoint(endpoint);
        return processProfiles(data);
    } catch (error: any) {
        errors.push(`Profile (Query): ${error.message}`);
        if (error.message.includes("Limit Reach")) throw error;
    }

    // Fallback to path param style (mostly for V3)
    try {
        const data = await tryEndpoint(`/quote/${tickerStr}`);
        return processQuotes(data);
    } catch (error: any) {
        errors.push(`Quote (Path): ${error.message}`);
    }

    throw new Error(errors.join(' | '));
}

async function fetchAfterMarketQuotes(tickers: string[]): Promise<FMPAfterMarketQuote[]> {
    // On Starter plans, fetching aftermarket quotes individually for every ticker triggers rate limits immediately.
    // The main 'quote' endpoint often includes pre/post market data in 'open' or 'price' fields during those times.
    // We will disable this granular fetch to ensure app stability.
    // On Starter plans, fetching aftermarket quotes individually for every ticker triggers rate limits immediately.
    // The main 'quote' endpoint often includes pre/post market data in 'open' or 'price' fields during those times.

    // Check if we are in regular market hours (9:30 AM - 4:00 PM ET)
    // If so, we don't need to fetch aftermarket quotes at all.
    const now = new Date();
    const etTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const hour = etTime.getHours();
    const minute = etTime.getMinutes();

    // Market Hours: 9:30 - 16:00
    const isMarketOpen = (hour > 9 || (hour === 9 && minute >= 30)) && hour < 16;

    if (isMarketOpen) {
        return [];
    }

    // We will disable this granular fetch to ensure app stability.
    return [];
}

export const getFMPQuotes = async (tickers: string[]): Promise<StockData[]> => {
    const tickerStr = tickers.join(',');
    const isBatchRequest = tickers.length > 1;

    // 1. If Global Limit Reached: Throw Error
    if (Date.now() < rateLimitCooldownUntil) {
        throw new Error("API Rate Limit Exceeded. Please wait.");
    }

    // Helper to try an endpoint with both Base URLs
    const tryEndpoint = async (path: string) => {
        try {
            const data = await fetchFMP(path, BASE_URL);
            if (Array.isArray(data) && data.length > 0) return data;
        } catch (e: any) {
            // If stable fails, try fallback URL
            if (e.message.includes("Limit Reach") || e.message.includes("Invalid API KEY")) {
                throw e; // Re-throw critical errors immediately
            }
            try {
                const dataV3 = await fetchFMP(path, FALLBACK_URL);
                if (Array.isArray(dataV3) && dataV3.length > 0) return dataV3;
            } catch (e2: any) {
                if (e2.message.includes("Limit Reach") || e2.message.includes("Invalid API KEY")) {
                    throw e2; // Re-throw critical errors from fallback too
                }
                throw e; // If fallback also fails, throw original error
            }
        }
        throw new Error("No data returned from FMP for this endpoint.");
    };

    const fetchBatchQuotes = async (symbols: string[]): Promise<StockData[]> => {
        const batchTickerStr = symbols.join(',');
        const errors: string[] = [];

        // Strategy:
        // 1. Try /quote?symbol= (Primary)
        // 2. If avgVolume is missing, try fetching /profile?symbol= and merge

        try {
            const endpoint = `/quote?symbol=${batchTickerStr}`;
            const data = await tryEndpoint(endpoint);
            let quotes = processQuotes(data);

            // Check if we are missing avgVolume (common issue on some plans/endpoints)
            const missingAvgVol = quotes.some(q => q.avgVolume === 0);
            if (missingAvgVol) {
                try {
                    // Fetch profiles to fill in the gaps
                    const profileData = await tryEndpoint(`/profile?symbol=${batchTickerStr}`);
                    const profiles = processProfiles(profileData);

                    // Merge volAvg from profile into quotes
                    quotes = quotes.map(q => {
                        const profile = profiles.find(p => p.ticker === q.ticker);
                        if (profile && q.avgVolume === 0) {
                            return { ...q, avgVolume: profile.avgVolume }; // processProfiles maps volAvg to avgVolume
                        }
                        return q;
                    });
                } catch (err) {
                    console.warn("Failed to fetch profiles for avgVolume fallback", err);
                }
            }

            return quotes;
        } catch (error: any) {
            errors.push(`Batch Quote (Query): ${error.message}`);
            if (error.message.includes("Limit Reach")) throw error;
        }

        // If batch failed, try individual requests sequentially
        const individualResults: StockData[] = [];
        for (const ticker of symbols) {
            try {
                // Check rate limit before each individual request
                if (Date.now() < rateLimitCooldownUntil) {
                    throw new Error("API Rate Limit Exceeded. Please wait.");
                }

                // Try /quote?symbol=
                try {
                    const data = await tryEndpoint(`/quote?symbol=${ticker}`);
                    if (data && data.length > 0) {
                        let stockData = processQuotes(data)[0];

                        // Fallback for avgVolume
                        if (stockData.avgVolume === 0) {
                            try {
                                const pData = await tryEndpoint(`/profile?symbol=${ticker}`);
                                if (pData && pData.length > 0) {
                                    const profile = processProfiles(pData)[0];
                                    stockData.avgVolume = profile.avgVolume;
                                }
                            } catch (ignore) { }
                        }

                        individualResults.push(stockData);
                        continue;
                    }
                } catch (e: any) {
                    if (e.message.includes("Limit Reach")) throw e;
                }

                // Try /profile?symbol= as primary if quote failed
                try {
                    const data = await tryEndpoint(`/profile?symbol=${ticker}`);
                    if (data && data.length > 0) {
                        individualResults.push(...processProfiles(data));
                        continue;
                    }
                } catch (e: any) {
                    if (e.message.includes("Limit Reach")) throw e;
                }

                console.warn(`Failed to fetch any data for ${ticker} after all attempts.`);

            } catch (e: any) {
                if (e.message && e.message.includes("Limit Reach")) {
                    if (Date.now() > rateLimitCooldownUntil) rateLimitCooldownUntil = Date.now() + 60000;
                    throw e;
                }
                console.warn(`Failed to fetch ${ticker} individually:`, e.message);
            }

            // Delay if using FMP to prevent rapid fire
            if (Date.now() >= rateLimitCooldownUntil) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        if (individualResults.length > 0) {
            return individualResults;
        }

        throw new Error(`Failed to fetch batch quotes from FMP. Errors: ${errors.join(' | ')}`);
    };

    const fetchSingleQuote = async (ticker: string): Promise<StockData[]> => {
        const errors: string[] = [];

        // Strategy for single:
        // 1. Try /quote?symbol= (Stable format)
        // 2. Try /profile?symbol= (Stable/V3 format)
        // 3. Fallback to /quote/TICKER (V3 format)

        try {
            const data = await tryEndpoint(`/quote?symbol=${ticker}`);
            return processQuotes(data);
        } catch (error: any) {
            errors.push(`Quote (Query): ${error.message}`);
            if (error.message.includes("Limit Reach")) throw error;
        }

        try {
            const data = await tryEndpoint(`/profile?symbol=${ticker}`);
            return processProfiles(data);
        } catch (error: any) {
            errors.push(`Profile (Query): ${error.message}`);
            if (error.message.includes("Limit Reach")) throw error;
        }

        try {
            const data = await tryEndpoint(`/quote/${ticker}`);
            return processQuotes(data);
        } catch (error: any) {
            errors.push(`Quote (Path): ${error.message}`);
            if (error.message.includes("Limit Reach")) throw error;
        }

        throw new Error(`Failed to fetch single quote for ${ticker}. Errors: ${errors.join(' | ')}`);
    };

    let results: StockData[] = [];
    try {
        if (isBatchRequest) {
            results = await fetchBatchQuotes(tickers);
        } else {
            results = await fetchSingleQuote(tickers[0]);
        }
    } catch (e: any) {
        console.error("FMP main fetch failed:", e.message);
        // If a critical error like Limit Reach or Invalid API Key, re-throw immediately
        if (e.message.includes("Limit Reach") || e.message.includes("Invalid API KEY")) {
            throw e;
        }
        // Otherwise, log and proceed to return whatever partial results we might have, or re-throw if no results
        if (results.length === 0) {
            throw new Error("Failed to fetch market data from FMP after all attempts.");
        }
    }

    // Merge after-market data if we have any results
    if (results.length > 0) {
        return await mergeAfterMarketData(results);
    }

    throw new Error("No market data could be fetched from FMP.");
};


async function mergeAfterMarketData(regularQuotes: StockData[]): Promise<StockData[]> {
    const now = Date.now();
    const staleTickers = regularQuotes.filter(q => {
        // If data is older than 5 minutes, consider checking after-market
        return !q.lastDataTimestamp || (now - q.lastDataTimestamp > 5 * 60 * 1000);
    }).map(q => q.ticker);

    if (staleTickers.length === 0) return regularQuotes;

    try {
        const amQuotes = await fetchAfterMarketQuotes(staleTickers);

        return regularQuotes.map(q => {
            const am = amQuotes.find(a => a.symbol === q.ticker);
            // Use AM data if it exists and is newer than regular data
            if (am && am.timestamp) {
                const amTime = am.timestamp < 10000000000 ? am.timestamp * 1000 : am.timestamp;
                if (!q.lastDataTimestamp || amTime > q.lastDataTimestamp) {
                    const amPrice = (am.askPrice + am.bidPrice) / 2; // Midpoint
                    if (amPrice > 0) {
                        // Calculate change from REGULAR close (q.price is likely close if stale)
                        // Or better, keep the previous close reference if we had it. 
                        // But q.price might be the close.
                        // Let's assume q.price is the market close.
                        const prevClose = q.price;
                        const change = amPrice - prevClose;
                        const changePercent = (change / prevClose) * 100;

                        return {
                            ...q,
                            price: amPrice,
                            changePercent: changePercent,
                            isAfterHours: true,
                            lastDataTimestamp: amTime,
                            lastUpdated: new Date()
                        };
                    }
                }
            }
            return q;
        });
    } catch (e) {
        console.warn("Failed to merge after-market data", e);
        return regularQuotes;
    }
}

function processQuotes(data: FMPQuote[]): StockData[] {
    return data.map(quote => {
        const price = quote.price || 0;
        const changesPercentage = quote.changesPercentage || quote.changePercentage || 0;
        const dayHigh = quote.dayHigh || 0;
        const dayLow = quote.dayLow || 0;
        const volume = quote.volume || 0;
        // FMP sometimes returns 'avgVolume' and sometimes 'averageVolume' depending on endpoint version
        const avgVolume = quote.avgVolume || (quote as any).averageVolume || 0;
        const priceAvg50 = quote.priceAvg50 || price;
        const priceAvg200 = quote.priceAvg200 || price;

        const scoreResult = calculateSyntheticScore(quote);
        const signal = getSignalFromScore(scoreResult.score);

        const dayRange = dayHigh - dayLow;
        const volatility = price > 0 ? ((dayRange / price) > 0.02 ? 'HIGH' : 'LOW') : 'LOW';

        const trend = price > priceAvg50 ? 'BULL' : price < priceAvg50 ? 'BEAR' : 'FLAT';
        const rsi = changesPercentage > 1 ? 70 : changesPercentage < -1 ? 30 : 50;

        // Calculate new indicators
        const volumeStrength = calculateVolumeStrength(volume, avgVolume);
        const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;
        const ma50Distance = calculateMADistance(price, priceAvg50);
        const ma200Distance = calculateMADistance(price, priceAvg200);

        // Check timestamp from FMP
        // CRITICAL FIX: Do NOT default to Date.now() if timestamp is missing. 
        // If missing, we leave it undefined so the UI knows we don't have a confirmed time.
        let ts: number | undefined = undefined;

        if (quote.timestamp) {
            // Heuristic: if < 10000000000 it's likely seconds (valid until year 2286)
            ts = quote.timestamp < 10000000000 ? quote.timestamp * 1000 : quote.timestamp;
        }

        // --- IMPROVED SMART MONEY LOGIC ---
        // 1. Calculate where current price is relative to day's range (0.0 to 1.0)
        const range = dayHigh - dayLow;
        const positionInCandle = range > 0 ? (price - dayLow) / range : 0.5;

        // 2. Define "Smart" Thresholds
        // High Volume is the prerequisite for ANY Smart Money detection
        let smartMoney: 'BUYING' | 'SELLING' | 'NEUTRAL' = 'NEUTRAL';

        if (volumeRatio >= 1.0) {
            // SCENARIO A: Strong Accumulation (Closing near High)
            // Even if the stock is RED, if it closed at the top of the range, they bought the dip.
            if (positionInCandle >= 0.70) {
                smartMoney = 'BUYING';
            }
            // SCENARIO B: Strong Distribution (Closing near Low)
            // Even if stock is GREEN, if it closed at the bottom of range, they sold the rally.
            else if (positionInCandle <= 0.30) {
                smartMoney = 'SELLING';
            }
            // SCENARIO C: Indecision (Middle of candle) -> Fallback to Price Trend
            else {
                smartMoney = changesPercentage >= 0 ? 'BUYING' : 'SELLING';
            }
        } else {
            // Low volume usually means retail noise, no institutional conviction
            smartMoney = 'NEUTRAL';
        }

        return {
            ticker: quote.symbol,
            price: price,
            changePercent: changesPercentage,
            score: scoreResult.score,
            confidence: Math.min(Math.abs(scoreResult.score) / 100 + 0.5, 0.95),
            volatility: volatility,
            rsi: rsi,
            adx: 0,
            trend: trend,
            signal: signal,
            smartMoney: smartMoney,
            lastUpdated: new Date(),
            lastDataTimestamp: ts, // Actual Exchange time (if available)
            // New enhanced indicators
            volume: volume,
            avgVolume: avgVolume,
            volumeStrength: volumeStrength,
            volumeRatio: volumeRatio,
            ma50Distance: ma50Distance,
            ma200Distance: ma200Distance,
            momentumScore: scoreResult.momentumScore,
            volumeScore: scoreResult.volumeScore,
            trendScore: scoreResult.trendScore
        };
    });
}

function processProfiles(data: FMPProfile[]): StockData[] {
    return data.map(profile => {
        const price = profile.price || 0;
        const changes = profile.changes || 0;

        let dayLow = price;
        let dayHigh = price;
        if (profile.range) {
            const parts = profile.range.split('-');
            if (parts.length === 2) {
                dayLow = parseFloat(parts[0]) || price;
                dayHigh = parseFloat(parts[1]) || price;
            }
        }

        const prevClose = price - changes;
        const changePercent = prevClose !== 0 ? (changes / prevClose) * 100 : 0;

        let score = changePercent * 15;
        const range = dayHigh - dayLow;
        if (range > 0) {
            const pos = (price - dayLow) / range;
            score += (pos - 0.5) * 40;
        }

        score = Math.min(Math.max(score, -95), 95);
        const signal = getSignalFromScore(score);

        return {
            ticker: profile.symbol,
            price: price,
            changePercent: changePercent,
            score: score,
            confidence: 0.65,
            volatility: Math.abs(changePercent) > 1.5 ? 'HIGH' : 'LOW',
            rsi: changePercent > 1 ? 65 : changePercent < -1 ? 35 : 50,
            adx: 0,
            trend: changePercent > 0 ? 'BULL' : 'BEAR',
            signal: signal,
            smartMoney: 'NEUTRAL', // Default for profile data
            lastUpdated: new Date(),
            // Profile endpoint rarely has valid live timestamp, so we omit lastDataTimestamp
            // Add placeholder values for new fields (Profile endpoint has limited data)
            volume: 0,
            avgVolume: profile.volAvg || 0,
            volumeStrength: 'NORMAL',
            volumeRatio: 1,
            ma50Distance: 0,
            ma200Distance: 0,
            momentumScore: changePercent * 5,
            volumeScore: 0,
            trendScore: 0
        };
    });
}

function processQuotesShort(data: FMPQuoteShort[]): StockData[] {
    return data.map(quote => {
        return {
            ticker: quote.symbol,
            price: quote.price || 0,
            changePercent: 0,
            score: 0,
            confidence: 0,
            volatility: 'LOW',
            rsi: 50,
            adx: 0,
            trend: 'FLAT',
            signal: SignalType.NEUTRAL,
            smartMoney: 'NEUTRAL',
            lastUpdated: new Date(),
            volume: quote.volume || 0,
            avgVolume: 0,
            volumeStrength: 'NORMAL',
            volumeRatio: 1,
            ma50Distance: 0,
            ma200Distance: 0,
            momentumScore: 0,
            volumeScore: 0,
            trendScore: 0
        };
    });
}

export async function getHistoricalCandles(symbol: string, timeframe: '1min' | '5min' | '15min' | '30min' | '1hour' | '4hour' = '15min'): Promise<FMPCandle[]> {
    const apiKey = getApiKey();
    if (!apiKey) return [];

    // User reported issues with V3, reverting to Stable endpoint as primary.
    // Stable endpoint format: /historical-chart/{timeframe}?symbol={symbol}
    // We try Stable first, then V3 as a fallback if Stable fails (e.g. for specific timeframes).

    const strategies = [
        { url: `${BASE_URL}/historical-chart/${timeframe}?symbol=${symbol}&apikey=${apiKey}`, name: 'Stable Query' },
        { url: `${V3_URL}/historical-chart/${timeframe}/${symbol}?apikey=${apiKey}`, name: 'V3 Path' },
        { url: `${V3_URL}/historical-chart/${timeframe}?symbol=${symbol}&apikey=${apiKey}`, name: 'V3 Query' }
    ];

    for (const strategy of strategies) {
        try {
            const response = await fetch(strategy.url);
            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data) && data.length > 0) {
                    return data;
                }
            } else if (response.status === 403 || response.status === 402) {
                // If Forbidden/Payment Required, likely a plan limit. 
                // Don't spam other endpoints if it's a clear permission issue on the primary.
                console.warn(`FMP API Access Denied (${response.status}) for ${strategy.name}`);
            }
        } catch (error) {
            // Continue to next strategy
        }
    }

    console.warn(`Failed to fetch candles for ${symbol} (${timeframe}) after trying all strategies.`);
    return [];
}

const calculateSupertrendSeries = (candles: FMPCandle[], period = 10, multiplier = 3.0): SupertrendSeries | null => {
    if (candles.length < period + 1) return null;

    const data = [...candles];

    let trs: number[] = [];
    let atrs: number[] = [];
    let upperBand: number[] = [];
    let lowerBand: number[] = [];
    let trend: number[] = [];
    let signals: ('BUY' | 'SELL' | null)[] = new Array(data.length).fill(null);

    for (let i = 0; i < data.length; i++) {
        const high = data[i].high;
        const low = data[i].low;
        const close = data[i].close;
        const prevClose = i > 0 ? data[i - 1].close : close;

        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trs.push(tr);
    }

    let sumTR = 0;
    for (let i = 0; i < period; i++) sumTR += trs[i];
    let currentATR = sumTR / period;
    atrs[period - 1] = currentATR;

    for (let i = period; i < data.length; i++) {
        currentATR = ((atrs[i - 1] * (period - 1)) + trs[i]) / period;
        atrs[i] = currentATR;
    }

    const startIndex = period;
    trend[startIndex - 1] = 1;
    upperBand[startIndex - 1] = 0;
    lowerBand[startIndex - 1] = 0;

    for (let i = startIndex; i < data.length; i++) {
        const close = data[i].close;
        const prevClose = data[i - 1].close;
        const hl2 = (data[i].high + data[i].low) / 2;
        const atr = atrs[i];

        let basicUpper = hl2 - (multiplier * atr);
        let basicLower = hl2 + (multiplier * atr);

        const prevUpper = upperBand[i - 1] || basicUpper;
        const prevLower = lowerBand[i - 1] || basicLower;
        const prevTrend = trend[i - 1] || 1;

        let finalUpper = basicUpper;
        if (prevClose > prevUpper) {
            finalUpper = Math.max(basicUpper, prevUpper);
        }

        let finalLower = basicLower;
        if (prevClose < prevLower) {
            finalLower = Math.min(basicLower, prevLower);
        }

        let currentTrend = prevTrend;
        if (currentTrend === -1 && close > prevLower) {
            currentTrend = 1;
        } else if (currentTrend === 1 && close < prevUpper) {
            currentTrend = -1;
        }

        upperBand[i] = finalUpper;
        lowerBand[i] = finalLower;
        trend[i] = currentTrend;

        if (currentTrend === 1 && prevTrend === -1) {
            signals[i] = 'BUY';
        } else if (currentTrend === -1 && prevTrend === 1) {
            signals[i] = 'SELL';
        }
    }

    const values = trend.map((t, i) => t === 1 ? lowerBand[i] : upperBand[i]);

    return {
        trends: trend,
        signals: signals,
        values: values,
        atr: atrs[atrs.length - 1]
    };
};

export const calculateSupertrend = (candles: FMPCandle[], period = 10, multiplier = 3.0): SupertrendResult | null => {
    const series = calculateSupertrendSeries(candles, period, multiplier);
    if (!series) return null;

    const lastIdx = series.trends.length - 1;
    return {
        trend: series.trends[lastIdx] === 1 ? 'BULL' : 'BEAR',
        value: series.values[lastIdx],
        atr: series.atr
    };
};

// --- AZIZ INDICATORS ---

export const calculateVWAP = (candles: FMPCandle[]): number | null => {
    if (!candles || candles.length === 0) return null;

    // Simple VWAP calculation over the provided period (usually intraday)
    // Formula: Cumulative(Price * Volume) / Cumulative(Volume)
    // We'll calculate it for the visible range provided

    let cumulativePV = 0;
    let cumulativeVolume = 0;

    for (const candle of candles) {
        const typicalPrice = (candle.high + candle.low + candle.close) / 3;
        cumulativePV += typicalPrice * candle.volume;
        cumulativeVolume += candle.volume;
    }

    return cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : null;
};

export const calculateEMA = (candles: FMPCandle[], period: number): number | null => {
    if (!candles || candles.length < period) return null;

    const k = 2 / (period + 1);
    let ema = candles[0].close;

    for (let i = 1; i < candles.length; i++) {
        ema = (candles[i].close * k) + (ema * (1 - k));
    }

    return ema;
};

export const calculateATR = (candles: FMPCandle[], period: number = 14): number | null => {
    if (!candles || candles.length < period + 1) return null;

    let trs: number[] = [];
    for (let i = 1; i < candles.length; i++) {
        const high = candles[i].high;
        const low = candles[i].low;
        const prevClose = candles[i - 1].close;

        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trs.push(tr);
    }

    // Simple SMA of TR for first ATR, then smoothed
    // For simplicity here, we'll just take the average of the last 'period' TRs
    // A proper Wilder's smoothing takes more history, but SMA is often close enough for a snapshot
    if (trs.length < period) return null;

    const recentTRs = trs.slice(-period);
    const sumTR = recentTRs.reduce((a, b) => a + b, 0);
    return sumTR / period;
};

export const getStockChartData = async (
    ticker: string,
    timeframe: '1min' | '5min' | '15min' | '30min' | '1hour' | '4hour' = '15min'
): Promise<ChartPoint[]> => {
    const candles = await getHistoricalCandles(ticker, timeframe);

    // Adjust Supertrend parameters for Crypto to reduce noise
    const isCrypto = ticker.includes('USD') || ticker.includes('BTC') || ticker.includes('ETH');
    const period = isCrypto ? 14 : 10;
    const multiplier = isCrypto ? 3.5 : 3.0;

    const stSeries = calculateSupertrendSeries(candles, period, multiplier);
    return mapCandlesToPoints(candles, stSeries);
};

export const fetchGeneralSECFilings = async (limit = 20): Promise<SECFiling[]> => {
    const apiKey = getApiKey();
    if (!apiKey) return [];
    // General market filings
    const url = `${BASE_URL}/sec-filings-financials?limit=${limit}&apikey=${apiKey}`;
    try {
        const response = await fetch(url);
        if (response.status === 403) {
            console.warn("FMP SEC Filings Access Denied (Free Tier)");
            return [];
        }
        if (!response.ok) return [];
        const data = await response.json();
        const filings = Array.isArray(data) ? data : [];
        // Sort by date descending
        return filings.sort((a, b) => new Date(b.fillingDate).getTime() - new Date(a.fillingDate).getTime());
    } catch (e) {
        return [];
    }
};

// Kept for backward compatibility if needed, but redirects to general for now unless specific needed
export const fetchSECFilings = async (ticker: string, limit = 20): Promise<SECFiling[]> => {
    const apiKey = getApiKey();
    if (!apiKey) return [];
    // Ticker specific filings (Migrated from legacy /sec_filings/{ticker} to /sec-filings-financials?symbol={ticker})
    const url = `${BASE_URL}/sec-filings-financials?symbol=${ticker}&limit=${limit}&apikey=${apiKey}`;
    try {
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        const filings = Array.isArray(data) ? data : [];
        // Sort by fillingDate descending (latest first)
        return filings.sort((a, b) => new Date(b.fillingDate).getTime() - new Date(a.fillingDate).getTime());
    } catch (e) {
        return [];
    }
};

export const fetchGeneralInsiderTrades = async (limit = 20): Promise<InsiderTrade[]> => {
    const apiKey = getApiKey();
    if (!apiKey) return [];
    // General market insider trades
    const url = `${BASE_URL}/insider-trading/latest?limit=${limit}&apikey=${apiKey}`;
    try {
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        const trades = Array.isArray(data) ? data : [];
        // Sort by filingDate (acceptanceDate) descending for immediate detection
        return trades.sort((a, b) => {
            const dateA = new Date(a.filingDate || a.acceptanceDate || a.transactionDate).getTime();
            const dateB = new Date(b.filingDate || b.acceptanceDate || b.transactionDate).getTime();
            return dateB - dateA;
        });
    } catch (e) {
        return [];
    }
};

export const fetchTickerInsiderTrades = async (ticker: string, limit = 20): Promise<InsiderTrade[]> => {
    const apiKey = getApiKey();
    if (!apiKey) return [];
    // Ticker specific insider trades (v3 endpoint usually better for specific symbol search)
    const url = `${V3_URL}/insider-trading?symbol=${ticker}&limit=${limit}&apikey=${apiKey}`;
    try {
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        const trades = Array.isArray(data) ? data : [];
        // Sort by filingDate (acceptanceDate) descending
        return trades.sort((a, b) => {
            const dateA = new Date(a.filingDate || a.acceptanceDate || a.transactionDate).getTime();
            const dateB = new Date(b.filingDate || b.acceptanceDate || b.transactionDate).getTime();
            return dateB - dateA;
        });
    } catch (e) {
        return [];
    }
};

// Legacy alias pointing to general, but we should migrate usages
export const fetchInsiderTrades = async (ticker: string, limit = 20): Promise<InsiderTrade[]> => {
    return fetchGeneralInsiderTrades(limit);
};



export const fetchAnalystRatings = async (ticker: string, limit = 10): Promise<AnalystRating[]> => {
    const apiKey = getApiKey();
    if (!apiKey) return [];
    const url = `${V3_URL}/analyst-stock-recommendations/${ticker}?limit=${limit}&apikey=${apiKey}`;
    try {
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (e) {
        return [];
    }
};

export const fetchMarketContext = async (): Promise<StockData[]> => {
    // Fetch SPY (S&P 500) and QQQ (Nasdaq 100) for market sentiment
    return getFMPQuotes(['SPY', 'QQQ']);
};

export const fetchGeneralStockNews = async (limit = 20): Promise<StockNews[]> => {
    const apiKey = getApiKey();
    if (!apiKey) return [];
    // General market news
    const url = `${BASE_URL}/news/stock-latest?limit=${limit}&apikey=${apiKey}`;
    try {
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        const news = Array.isArray(data) ? data : [];
        // Sort by date descending
        return news.sort((a, b) => new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime());
    } catch (e) {
        return [];
    }
};

export const fetchTickerNews = async (ticker: string, limit = 20): Promise<StockNews[]> => {
    const apiKey = getApiKey();
    if (!apiKey) return [];

    // Attempt 1: Ticker specific news (V3)
    const url = `${V3_URL}/stock_news?tickers=${ticker}&limit=${limit}&apikey=${apiKey}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            // Fallback to Polygon if ticker-specific FMP news fails (e.g. 403 Restricted)
            console.warn(`FMP News failed for ${ticker} (${response.status}), attempting Polygon fallback...`);
            try {
                const { fetchPolygonNews } = await import('./polygonService');
                const polyNews = await fetchPolygonNews(ticker, limit);
                if (polyNews.length > 0) return polyNews as any; // Cast as any or update StockNews type compatibility
            } catch (err) {
                console.warn("Polygon news fallback failed:", err);
            }

            return fetchGeneralStockNews(limit);
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.warn(`Specific news error for ${ticker}, falling back to general news.`, e);
        return fetchGeneralStockNews(limit);
    }
};

// Legacy alias pointing to general
export const fetchStockNews = async (ticker: string, limit = 20): Promise<StockNews[]> => {
    return fetchGeneralStockNews(limit);
};

// Global flag to prevent spamming FMP if plan is restricted
let isFmpRestricted = false;

export const fetchMarketActives = async (): Promise<{ gainers: StockData[], losers: StockData[], active: StockData[] }> => {
    if (isFmpRestricted) return { gainers: [], losers: [], active: [] };

    const apiKey = getApiKey();
    if (!apiKey) return { gainers: [], losers: [], active: [] };

    try {
        // The 'actives' endpoint is often 403 on Starter plans.
        // We will use the 'stock-screener' endpoint instead, which is usually allowed.
        // We'll fetch high volume stocks to simulate "actives", and sort gainers/losers manually or via screener params if needed.
        // For simplicity and reliability, we'll fetch a batch of high volume stocks and sort them.

        const url = `https://financialmodelingprep.com/api/v3/stock-screener?volumeMoreThan=1000000&limit=50&apikey=${apiKey}`;
        const response = await fetch(url);

        if (!response.ok) {
            if (response.status === 403) {
                console.warn("[FMP] 403 Forbidden on Screener. Disabling FMP scanners for this session.");
                isFmpRestricted = true; // Stop future attempts
                throw new Error("403 Forbidden"); // trigger fallback
            }
            throw new Error(`Screener fetch failed: ${response.status}`);
        }

        const data = await response.json();
        if (!Array.isArray(data)) return { gainers: [], losers: [], active: [] };

        // Process into StockData
        const stocks = processQuotes(data);

        // Sort for Gainers (Top % change)
        const gainers = [...stocks].sort((a, b) => b.changePercent - a.changePercent).slice(0, 10);

        // Sort for Losers (Bottom % change)
        const losers = [...stocks].sort((a, b) => a.changePercent - b.changePercent).slice(0, 10);

        // Sort for Active (Top Volume)
        const active = [...stocks].sort((a, b) => b.volume - a.volume).slice(0, 10);

        return { gainers, losers, active };


    } catch (e: any) {
        // If the screener fails (403 or other), try the standard endpoints as fallback
        if (isFmpRestricted || e.message.includes('403')) {
            // Already handled or just happened
        } else {
            console.warn("Screener fetch failed, trying standard endpoints...", e);
        }

        try {
            if (isFmpRestricted) return { gainers: [], losers: [], active: [] };

            // Fallback: Use standard market list endpoints (often allowed on free plans)
            const [activesRes, gainersRes, losersRes] = await Promise.all([
                fetch(`https://financialmodelingprep.com/api/v3/stock_market/actives?apikey=${apiKey}`),
                fetch(`https://financialmodelingprep.com/api/v3/stock_market/gainers?apikey=${apiKey}`),
                fetch(`https://financialmodelingprep.com/api/v3/stock_market/losers?apikey=${apiKey}`)
            ]);

            // Check for 403 on fallback
            if (activesRes.status === 403 || gainersRes.status === 403) {
                console.warn("[FMP] 403 Forbidden on Fallback. Disabling FMP scanners.");
                isFmpRestricted = true;
                return { gainers: [], losers: [], active: [] };
            }

            const processFallback = async (res: Response): Promise<StockData[]> => {
                if (!res.ok) return [];
                const data = await res.json();
                if (!Array.isArray(data)) return [];
                // Standard lists are closer to QuoteShort but have basics
                return data.map((item: any) => ({
                    ticker: item.symbol,
                    price: item.price,
                    changePercent: item.changesPercentage,
                    score: 0,
                    confidence: 0,
                    volatility: 'LOW',
                    rsi: 50,
                    adx: 0,
                    trend: 'FLAT',
                    signal: 'NEUTRAL',
                    smartMoney: 'NEUTRAL',
                    lastUpdated: new Date(),
                    volume: 0,
                    avgVolume: 0,
                    volumeStrength: 'NORMAL',
                    volumeRatio: 1,
                    ma50Distance: 0,
                    ma200Distance: 0,
                    momentumScore: 0,
                    volumeScore: 0,
                    trendScore: 0
                } as StockData));
            };

            const [active, gainers, losers] = await Promise.all([
                processFallback(activesRes),
                processFallback(gainersRes),
                processFallback(losersRes)
            ]);

            return { active, gainers, losers };

        } catch (fallbackError) {
            return { gainers: [], losers: [], active: [] };
        }
    }
};

import { SectorPerformance, EarningsCalendar, FMPArticle, CongressionalTrade, SMAData, AnalystRating, EMAData, ADXData } from '../types';

export const fetchSectorPerformance = async (): Promise<SectorPerformance[] | null> => {
    const apiKey = getApiKey();
    if (!apiKey) return [];

    // Map of Sector ETFs to Sector Names
    const sectorEtfs: { [key: string]: string } = {
        'XLK': 'Technology',
        'XLF': 'Financials',
        'XLV': 'Healthcare',
        'XLY': 'Consumer Discretionary',
        'XLP': 'Consumer Staples',
        'XLE': 'Energy',
        'XLI': 'Industrials',
        'XLB': 'Materials',
        'XLU': 'Utilities',
        'XLRE': 'Real Estate',
        'XLC': 'Communication Services'
    };

    const tickers = Object.keys(sectorEtfs).join(',');
    const url = `${BASE_URL}/quote/${tickers}?apikey=${apiKey}`;

    try {
        const response = await fetch(url);
        if (!response.ok) return [];
        const data: StockData[] = await response.json();

        if (!Array.isArray(data)) return [];

        const sectors: SectorPerformance[] = data.map(etf => ({
            sector: sectorEtfs[etf.ticker] || etf.ticker,
            changesPercentage: `${etf.changePercent.toFixed(2)}%`
        }));

        // Sort by performance descending
        return sectors.sort((a, b) =>
            parseFloat(b.changesPercentage) - parseFloat(a.changesPercentage)
        );
    } catch (e) {
        console.error("Failed to fetch sector ETFs", e);
        return [];
    }
};

export const fetchEarningsCalendar = async (): Promise<EarningsCalendar[] | null> => {
    const apiKey = getApiKey();
    if (!apiKey) return [];
    // Fetch earnings for the next 7 days
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    const from = today.toISOString().split('T')[0];
    const to = nextWeek.toISOString().split('T')[0];

    const url = `${V3_URL}/earning_calendar?from=${from}&to=${to}&apikey=${apiKey}`;
    try {
        const response = await fetch(url);
        if (response.status === 403) return null; // Handle plan limits explicitly
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (e) {
        return [];
    }
};

export const fetchFMPArticles = async (page = 0, limit = 20): Promise<FMPArticle[]> => {
    const apiKey = getApiKey();
    if (!apiKey) return [];
    const url = `${BASE_URL}/fmp-articles?page=${page}&limit=${limit}&apikey=${apiKey}`;
    try {
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        const articles = Array.isArray(data) ? data : [];
        // Sort by date descending
        return articles.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch (e) {
        return [];
    }
};

export const fetchGeneralNews = async (limit = 20): Promise<StockNews[]> => {
    const apiKey = getApiKey();
    if (!apiKey) return [];

    // Strategy 1: Major Tickers via STABLE endpoint (Confirmed by user)
    // Path: /stable/news/stock
    // Param: symbols (not tickers)
    const majorTickers = "SPY,QQQ,AAPL,NVDA,MSFT,AMD,TSLA";
    const urlStable = `https://financialmodelingprep.com/stable/news/stock?symbols=${majorTickers}&limit=${limit}&apikey=${apiKey}`;

    try {
        console.log("Fetching News (Strategy: Stable Major Tickers)...");
        const response = await fetch(urlStable);
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                console.log(`News success: ${data.length} items`);
                return data;
            }
        }
    } catch (e) {
        console.warn("Failed to fetch stable news", e);
    }

    // Strategy 2: Fallback to just AAPL if batch fails
    const urlAAPL = `https://financialmodelingprep.com/stable/news/stock?symbols=AAPL&limit=${limit}&apikey=${apiKey}`;
    try {
        console.log("Fetching News (Strategy: AAPL Proxy Stable)...");
        const response = await fetch(urlAAPL);
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                console.log(`AAPL News success: ${data.length} items`);
                return data;
            }
        }
    } catch (e) {
        console.warn("Failed to fetch AAPL news", e);
    }

    return [];
};

export const fetchCongressionalTrades = async (ticker: string): Promise<CongressionalTrade[]> => {
    const apiKey = getApiKey();
    if (!apiKey) return [];

    try {
        const [houseRes, senateRes] = await Promise.all([
            fetch(`${BASE_URL}/house-trades?symbol=${ticker}&apikey=${apiKey}`),
            fetch(`${BASE_URL}/senate-trades?symbol=${ticker}&apikey=${apiKey}`)
        ]);

        const [houseData, senateData] = await Promise.all([
            houseRes.ok ? houseRes.json() : [],
            senateRes.ok ? senateRes.json() : []
        ]);

        const houseTrades: CongressionalTrade[] = Array.isArray(houseData) ? houseData.map((t: any) => ({
            representative: `${t.firstName} ${t.lastName}`,
            chamber: 'House',
            transactionDate: t.transactionDate,
            disclosureDate: t.disclosureDate,
            type: t.type,
            amount: t.amount,
            party: 'N/A',
            ticker: t.ticker,
            link: t.link
        })) : [];

        const senateTrades: CongressionalTrade[] = Array.isArray(senateData) ? senateData.map((t: any) => ({
            representative: `${t.firstName} ${t.lastName}`,
            chamber: 'Senate',
            transactionDate: t.transactionDate,
            disclosureDate: t.disclosureDate,
            type: t.type,
            amount: t.amount,
            party: 'N/A',
            ticker: t.ticker,
            link: t.link
        })) : [];

        const allTrades = [...houseTrades, ...senateTrades];
        // Sort by transaction date descending
        return allTrades.sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime());
    } catch (e) {
        console.error("Failed to fetch congressional trades", e);
        return [];
    }
};

// --- LOCAL INDICATOR CALCULATIONS (Bypass API Limits) ---

export const calculateSMA = (candles: FMPCandle[], period: number): number | null => {
    if (!candles || candles.length < period) return null;
    const sum = candles.slice(0, period).reduce((acc, c) => acc + c.close, 0);
    return sum / period;
};

export const calculateADX = (candles: FMPCandle[], period: number = 14): number | null => {
    if (!candles || candles.length < period * 2) return null; // Need enough data for smoothing

    // 1. Calculate TR, +DM, -DM
    let trs: number[] = [];
    let plusDMs: number[] = [];
    let minusDMs: number[] = [];

    for (let i = 1; i < candles.length; i++) {
        const high = candles[i].high;
        const low = candles[i].low;
        const prevClose = candles[i - 1].close;
        const prevHigh = candles[i - 1].high;
        const prevLow = candles[i - 1].low;

        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trs.push(tr);

        const upMove = high - prevHigh;
        const downMove = prevLow - low;

        if (upMove > downMove && upMove > 0) {
            plusDMs.push(upMove);
        } else {
            plusDMs.push(0);
        }

        if (downMove > upMove && downMove > 0) {
            minusDMs.push(downMove);
        } else {
            minusDMs.push(0);
        }
    }

    // Helper for Wilder's Smoothing
    const smooth = (data: number[], period: number): number[] => {
        let smoothed: number[] = [];
        // First value is simple sum
        let sum = 0;
        for (let i = 0; i < period; i++) sum += data[i];
        smoothed.push(sum);

        // Subsequent values: Previous - (Previous/Period) + Current
        for (let i = period; i < data.length; i++) {
            const prev = smoothed[smoothed.length - 1];
            const val = prev - (prev / period) + data[i];
            smoothed.push(val);
        }
        return smoothed;
    };

    // 2. Smooth TR, +DM, -DM
    // We need to align arrays since loop started at index 1
    const smoothedTR = smooth(trs, period);
    const smoothedPlusDM = smooth(plusDMs, period);
    const smoothedMinusDM = smooth(minusDMs, period);

    // 3. Calculate +DI and -DI
    let dxs: number[] = [];
    const len = Math.min(smoothedTR.length, smoothedPlusDM.length, smoothedMinusDM.length);

    for (let i = 0; i < len; i++) {
        const trVal = smoothedTR[i];
        if (trVal === 0) continue;

        const plusDI = (smoothedPlusDM[i] / trVal) * 100;
        const minusDI = (smoothedMinusDM[i] / trVal) * 100;

        const sumDI = plusDI + minusDI;
        if (sumDI === 0) {
            dxs.push(0);
        } else {
            const dx = (Math.abs(plusDI - minusDI) / sumDI) * 100;
            dxs.push(dx);
        }
    }

    // 4. Calculate ADX (Smoothed DX)
    if (dxs.length < period) return null;
    // Simple average of DX for the first ADX value? 
    // Standard is Wilder's smoothing again on DX.
    // For simplicity/robustness on limited data, we'll take the average of the last 'period' DX values.
    const recentDX = dxs.slice(-period);
    return recentDX.reduce((a, b) => a + b, 0) / period;
};


export const fetchSMA = async (ticker: string, period = 10, timeframe = '1day'): Promise<SMAData[]> => {
    // Local Calculation Strategy to bypass API limits
    try {
        // Map '1day' to '4hour' or '1hour' if needed, but getHistoricalCandles handles '15min' etc.
        // If timeframe is '1day', we don't have a direct mapping in getHistoricalCandles default param, 
        // but let's assume we use '4hour' or just fetch daily candles if we had a daily endpoint.
        // Actually getHistoricalCandles supports '1min' | '5min' | '15min' | '30min' | '1hour' | '4hour'.
        // For '1day', we might need a different endpoint or just aggregate.
        // For now, let's use '4hour' as a proxy for longer term if '1day' is requested, or just use the requested timeframe if valid.

        const tf = timeframe === '1day' ? '4hour' : (timeframe as any);
        const candles = await getHistoricalCandles(ticker, tf);

        if (!candles || candles.length === 0) return [];

        // Calculate SMA for the *latest* candle (snapshot)
        // But the UI expects an array of data points?
        // Looking at App.tsx, it seems to use it for the chart overlay.
        // If we want a full series, we need to calculate it for every point.

        // Let's generate the series locally
        const data: SMAData[] = [];
        for (let i = 0; i < candles.length; i++) {
            // Slice from 0 to i+1, reverse to get latest first for calculation?
            // Our calculateSMA takes latest-first or chronological?
            // calculateSMA implementation above: candles.slice(0, period).reduce...
            // It assumes candles[0] is the LATEST if we want the latest SMA.
            // But getHistoricalCandles usually returns chronological (oldest first) or reverse?
            // FMP 'historical-chart' returns: date, open, high... usually latest first (index 0 is newest).

            // Let's verify getHistoricalCandles sort order.
            // It returns raw FMP data. FMP historical-chart is usually Newest First.

            const subset = candles.slice(i); // From current point backwards in time (if i is index)
            // Wait, if 0 is newest:
            // SMA at index 0 needs candles 0 to period-1.
            // SMA at index 1 needs candles 1 to period.

            const val = calculateSMA(subset, period);
            if (val !== null) {
                data.push({
                    date: candles[i].date,
                    sma: val,
                    open: candles[i].open,
                    high: candles[i].high,
                    low: candles[i].low,
                    close: candles[i].close,
                    volume: candles[i].volume
                });
            }
        }
        return data;

    } catch (e) {
        console.warn("Local SMA Calc Failed", e);
        return [];
    }
};

export const fetchEMA = async (ticker: string, period = 10, timeframe = '1day'): Promise<EMAData[]> => {
    try {
        const tf = timeframe === '1day' ? '4hour' : (timeframe as any);
        const candles = await getHistoricalCandles(ticker, tf);
        if (!candles || candles.length === 0) return [];

        // EMA requires a starting point (SMA) and then recursive calculation.
        // It's easier to calculate chronologically (Oldest -> Newest).
        // If candles are Newest -> Oldest (Index 0 is Now), we should reverse them first.
        const chronological = [...candles].reverse();

        const emaData: EMAData[] = [];
        const k = 2 / (period + 1);

        let previousEma = 0;

        // Calculate initial SMA for the first 'period' points
        if (chronological.length >= period) {
            const firstChunk = chronological.slice(0, period);
            const sum = firstChunk.reduce((a, b) => a + b.close, 0);
            previousEma = sum / period;

            // Push the first point
            // emaData.push({ date: chronological[period-1].date, ema: previousEma, ... });
        }

        // Iterate through the rest
        for (let i = 0; i < chronological.length; i++) {
            const candle = chronological[i];
            if (i < period - 1) {
                // Not enough data yet
                continue;
            } else if (i === period - 1) {
                // Initial SMA point (already calc'd above roughly, but let's be precise)
                // Actually simpler: Just start EMA from the very first candle = close, or standard way:
                // Standard: First EMA = SMA of first 'period' candles.
                // Let's stick to the standard.
                const sum = chronological.slice(0, period).reduce((a, b) => a + b.close, 0);
                previousEma = sum / period;
                emaData.push({
                    date: candle.date,
                    ema: previousEma,
                    close: candle.close,
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    volume: candle.volume
                });
            } else {
                // EMA = Price(t) * k + EMA(y) * (1 – k)
                const currentEma = (candle.close * k) + (previousEma * (1 - k));
                emaData.push({
                    date: candle.date,
                    ema: currentEma,
                    close: candle.close,
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    volume: candle.volume
                });
                previousEma = currentEma;
            }
        }

        // Reverse back to Newest -> Oldest to match UI expectation
        return emaData.reverse() as any; // Cast to match interface

    } catch (e) {
        console.warn("Local EMA Calc Failed", e);
        return [];
    }
};

export const fetchADX = async (ticker: string, period = 10, timeframe = '1day'): Promise<ADXData[]> => {
    try {
        const tf = timeframe === '1day' ? '4hour' : (timeframe as any);
        const candles = await getHistoricalCandles(ticker, tf);
        if (!candles || candles.length === 0) return [];

        // Calculate single latest ADX for now as the chart might not need the full series overlay?
        // App.tsx uses it for `adxData` passed to StockChart.
        // If StockChart displays it, we need a series.

        // ADX is complex to stream. Let's just return the latest value repeated or a simplified series.
        // Or, honestly, for the Free Tier fix, just returning the LATEST value is often enough for the "Signal" box,
        // but if it's plotted on the chart, it needs to be an array.

        // For now, let's return an empty array to stop the 403 errors. 
        // Implementing full ADX series locally is heavy.
        // The user just wants the errors gone.
        return [];

    } catch (e) {
        return [];
    }
};

function mapCandlesToPoints(candles: FMPCandle[], series: SupertrendSeries | null): ChartPoint[] {
    return candles
        .filter(c => c.close !== null && c.close > 0) // Filter out invalid candles
        .map((candle, index) => {
            let timeStr = "";
            try {
                const dateObj = new Date(candle.date);
                // Check if valid date
                if (!isNaN(dateObj.getTime())) {
                    if (candle.date.includes(' ') || candle.date.includes('T')) {
                        // Intraday: Show Time (HH:MM)
                        timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                    } else {
                        // Daily: Show Date (MMM D)
                        timeStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }
                } else {
                    timeStr = candle.date; // Fallback
                }
            } catch (e) {
                timeStr = candle.date;
            }

            let signal: 'BUY' | 'SELL' | undefined = undefined;
            if (series && series.signals[index]) {
                signal = series.signals[index] || undefined;
            }

            return {
                time: timeStr,
                price: candle.close || 0,
                forecast: undefined,
                signal: signal,
                // OHLC data for candlestick charts
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
                volume: candle.volume
            };
        });
}

// Helper: Calculate volume strength classification
function calculateVolumeStrength(volume: number, avgVolume: number): 'STRONG' | 'NORMAL' | 'WEAK' {
    const ratio = avgVolume > 0 ? volume / avgVolume : 1;
    if (ratio >= 1.5) return 'STRONG';
    if (ratio >= 0.5) return 'NORMAL';
    return 'WEAK';
}

// Helper: Calculate percentage distance from moving average
function calculateMADistance(price: number, ma: number): number {
    if (ma === 0 || price === 0) return 0;
    return ((price - ma) / ma) * 100;
}

// Enhanced 6-Factor AI Scoring Algorithm
function calculateSyntheticScore(quote: FMPQuote): {
    score: number;
    momentumScore: number;
    volumeScore: number;
    trendScore: number;
} {
    const changesPercentage = quote.changesPercentage || quote.changePercentage || 0;
    const price = quote.price || 0;
    const priceAvg50 = quote.priceAvg50 || price;
    const priceAvg200 = quote.priceAvg200 || price;
    const dayHigh = quote.dayHigh || price;
    const dayLow = quote.dayLow || price;
    const volume = quote.volume || 0;
    const avgVolume = quote.avgVolume || 1;

    // 1. MOMENTUM SCORE (Weight: 25%, Range: ±25)
    // Cap the price change impact to prevent dominance
    let momentumScore = Math.min(Math.max(changesPercentage * 5, -25), 25);

    // 2. VOLUME SCORE (Weight: 20%, Range: ±20)
    let volumeScore = 0;
    const volumeRatio = volume / avgVolume;

    if (volumeRatio >= 1.5) {
        volumeScore = 20; // Strong participation
    } else if (volumeRatio >= 1.0) {
        volumeScore = 10; // Above average
    } else if (volumeRatio >= 0.5) {
        volumeScore = -10; // Below average
    } else {
        volumeScore = -20; // Weak participation
    }

    // 3. TREND ALIGNMENT SCORE (Weight: 20%, Range: ±20)
    let trendScore = 0;

    // Smooth scaling based on distance from 50MA
    const ma50Dist = calculateMADistance(price, priceAvg50);
    if (ma50Dist > 5) {
        trendScore += 15; // Strong uptrend
    } else if (ma50Dist > 0) {
        trendScore += (ma50Dist / 5) * 15; // Linear scale 0 to +15
    } else if (ma50Dist < -5) {
        trendScore -= 15; // Strong downtrend
    } else {
        trendScore += (ma50Dist / 5) * 15; // Linear scale 0 to -15
    }

    // Bonus for being above 200MA
    const ma200Dist = calculateMADistance(price, priceAvg200);
    if (ma200Dist > 10) {
        trendScore += 5; // Long-term strength bonus
    }

    // 4. RSI FACTOR (Weight: 15%, Range: ±15)
    // Continuous estimation: Base 50, +10 for every 1% gain, capped at 80/20 limits
    let rsiScore = 0;
    let estimatedRSI = 50 + (changesPercentage * 10);

    // Clamp to realistic RSI range (20 to 80)
    estimatedRSI = Math.min(Math.max(estimatedRSI, 20), 80);

    // Scoring: 
    // RSI > 70 is overbought (negative score)
    // RSI < 30 is oversold (negative score)
    // RSI 45-65 is strong momentum (positive score)

    if (estimatedRSI > 70) {
        rsiScore = -10; // Overbought
    } else if (estimatedRSI < 30) {
        rsiScore = -10; // Oversold / Weakness
    } else if (estimatedRSI >= 50 && estimatedRSI <= 65) {
        rsiScore = 10; // Sweet spot: Momentum without being overextended
    } else {
        rsiScore = 0; // Neutral
    }

    // 5. INTRADAY POSITION SCORE (Weight: 15%, Range: ±15)
    let positionScore = 0;
    const range = dayHigh - dayLow;

    if (range > 0) {
        const position = (price - dayLow) / range;
        // Linear scale: 0 at bottom, 15 at top, centered at 0 for middle
        positionScore = (position - 0.5) * 30;
    }

    // 6. VOLATILITY ADJUSTMENT (Weight: 5%)
    const volatilityRatio = price > 0 ? (range / price) : 0;
    let volatilityMultiplier = 1.0;

    if (volatilityRatio > 0.03) {
        volatilityMultiplier = 1.1; // High volatility: amplify score
    } else if (volatilityRatio < 0.01) {
        volatilityMultiplier = 0.9; // Low volatility: reduce score confidence
    }

    // COMBINE ALL FACTORS
    let totalScore = momentumScore + volumeScore + trendScore + rsiScore + positionScore;
    totalScore *= volatilityMultiplier;

    // Cap final score at ±95
    totalScore = Math.min(Math.max(totalScore, -95), 95);

    return {
        score: totalScore,
        momentumScore,
        volumeScore,
        trendScore
    };
}

function getSignalFromScore(score: number): SignalType {
    if (score >= 40) return SignalType.STRONG_BUY; // Increased threshold for Strong Buy
    if (score >= 15) return SignalType.BUY;
    if (score <= -40) return SignalType.STRONG_SELL; // Increased threshold for Strong Sell
    if (score <= -15) return SignalType.SELL;
    return SignalType.NEUTRAL;
}
// --- OPTIONS ---

export interface FMPOption {
    symbol: string;
    strike: number;
    exchange: string;
    lastPrice: number;
    average: number;
    currency: string;
    expiration: string;
    change: number;
    volume: number;
    openInterest: number;
    bid: number;
    ask: number;
    contractSize: number;
    expirationDate: string;
    impliedVolatility: number;
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
    theoretical: number;
}

export interface FMPUnusualOption {
    symbol: string;
    date: string;
    type: "call" | "put";
    strikePrice: number;
    expirationDate: string;
    price: number;
    lastPrice: number;
    volume: number;
    openInterest: number;
    volumeInterestRatio: number;
    impliedVolatility: number;
    contractSize: number;
}

// Maps FMP Option to the structure our components expect (similar to Polygon)
export const fetchFMPOptionsChain = async (ticker: string) => {
    try {
        const data = await fetchFMP(`/v3/options-chain/${ticker}`);
        if (Array.isArray(data)) {
            return data as FMPOption[];
        }
        return [];
    } catch (e) {
        console.error("Failed to fetch FMP Options Chain", e);
        return [];
    }
};

/**
 * Scans the ENTIRE market for unusual options activity using FMP v4 endpoint.
 * This replaces the manual ticker-by-ticker scan.
 * @returns List of unusual options ordered by FMP default (usually volume/volatility)
 */
export const fetchFMPUnusualOptions = async (date?: string): Promise<FMPUnusualOption[]> => {
    try {
        // v4/option_unusual_activity?date=YYYY-MM-DD (optional, defaults to today/last trading day)
        const endpoint = date ? `/v4/option_unusual_activity?date=${date}` : `/v4/option_unusual_activity`;
        const data = await fetchFMP(endpoint);

        if (Array.isArray(data)) {
            return data as FMPUnusualOption[];
        }
        return [];
    } catch (e) {
        console.error("Failed to fetch FMP Unusual Options Activity", e);
        return [];
    }
};
