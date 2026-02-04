import { ScannerProfile } from '../types';
import { getPolygonApiKey } from './polygonService';
import { getApiKey as getFmpApiKey } from './fmpService';

const POLYGON_BASE_URL = 'https://api.polygon.io/v2';

// In-memory cache for classifications (24h)
const classificationCache = new Map<string, { sector: string; industry: string; timestamp: number }>();

async function getTickerClassification(ticker: string): Promise<{ sector: string; industry: string } | null> {
    const now = Date.now();
    const cached = classificationCache.get(ticker);
    if (cached && (now - cached.timestamp < 24 * 60 * 60 * 1000)) {
        return cached;
    }

    try {
        const apiKey = getFmpApiKey();
        if (!apiKey) return null;

        // Profile endpoint is usually available on all plans for single tickers
        const response = await fetch(`https://financialmodelingprep.com/api/v3/profile/${ticker}?apikey=${apiKey}`);
        if (!response.ok) return null;

        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
            const { sector, industry } = data[0];
            const result = { sector: sector || '', industry: industry || '' };
            classificationCache.set(ticker, { ...result, timestamp: now });
            return result;
        }
    } catch (e) {
        // console.warn(`Failed to classify ${ticker}`, e);
    }
    return null;
}

interface ScreenerParams {
    marketCapMoreThan?: number;
    volumeMoreThan?: number;
    priceMoreThan?: number;
    sector?: string;
    industry?: string;
    betaMoreThan?: number;
    isEtf?: boolean;
    isActivelyTrading?: boolean;
    limit?: number;
}

interface PolygonSnapshotTicker {
    ticker: string;
    day?: {
        c?: number;
        v?: number;
    };
    prevDay?: {
        c?: number;
    };
    lastTrade?: {
        p?: number;
    };
    todaysChangePerc?: number;
}

const getParamsForProfile = (profile: ScannerProfile): ScreenerParams => {
    const baseParams = {
        limit: 50,
        isEtf: false,
        isActivelyTrading: true,
        priceMoreThan: 2,
        volumeMoreThan: 100000
    };

    switch (profile) {
        case 'hedge_fund':
            return {
                ...baseParams,
                marketCapMoreThan: 1000000000, // $1B
                volumeMoreThan: 500000,
                priceMoreThan: 5
            };
        case 'pro_trader':
            return {
                ...baseParams,
                volumeMoreThan: 1000000, // High liquidity
                betaMoreThan: 1.2
            };
        case 'catalyst':
            return {
                ...baseParams,
                volumeMoreThan: 200000
            };
        case 'bio_analyst':
            return {
                ...baseParams,
                sector: 'Healthcare',
                industry: 'Biotechnology',
                marketCapMoreThan: 200000000, // $200M
                limit: 100 // Need more candidates to filter for trials
            };
        case 'immediate_breakout':
            return {
                ...baseParams,
                volumeMoreThan: 300000,
                betaMoreThan: 1.0
            };
        case 'high_growth':
            return {
                ...baseParams,
                sector: 'Technology',
                marketCapMoreThan: 50000000, // Micro caps ok
                limit: 60
            };
        default:
            return baseParams;
    }
};

const buildSnapshotUrl = (apiKey: string, limit: number, includeOtc: boolean): string => {
    const params = new URLSearchParams({
        apiKey,
        limit: limit.toString(),
        include_otc: includeOtc ? 'true' : 'false'
    });
    return `${POLYGON_BASE_URL}/snapshot/locale/us/markets/stocks/tickers?${params.toString()}`;
};

const appendApiKey = (url: string, apiKey: string): string => {
    if (url.includes('apiKey=')) return url;
    const joiner = url.includes('?') ? '&' : '?';
    return `${url}${joiner}apiKey=${apiKey}`;
};

const normalizeSnapshot = (item: PolygonSnapshotTicker) => {
    const price = item.day?.c ?? item.prevDay?.c ?? item.lastTrade?.p ?? 0;
    const volume = item.day?.v ?? 0;
    const changePerc = typeof item.todaysChangePerc === 'number' ? item.todaysChangePerc : 0;
    return { ticker: item.ticker, price, volume, changePerc };
};

export const fetchScreenerResults = async (profile: ScannerProfile): Promise<string[]> => {
    const params = getParamsForProfile(profile);

    // --- ATTEMPT 1: POLYGON (Preferred for Snapshot Data) ---
    // Universal Fetch: We use Polygon to find the most active liquid volume, then filter locally.
    try {
        const polygonKey = getPolygonApiKey();
        if (polygonKey) {
            const pageLimit = (params.sector || params.industry) ? 1000 : 250; // Get meaningful pool if filtering
            const includeOtc = false;
            let url = buildSnapshotUrl(polygonKey, pageLimit, includeOtc);
            const candidates: ReturnType<typeof normalizeSnapshot>[] = [];
            let pages = 0;
            const maxPages = (params.sector || params.industry) ? 5 : 2; // Deep scan for sectors

            while (url && pages < maxPages) {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Polygon Snapshot failed with ${response.status}`);
                }

                const data = await response.json();
                const results = (data.results || []) as PolygonSnapshotTicker[];
                candidates.push(...results.map(normalizeSnapshot));
                url = data.next_url ? appendApiKey(data.next_url, polygonKey) : '';
                pages += 1;
            }

            if (candidates.length > 0) {
                const minPrice = params.priceMoreThan ?? 2;
                const minVolume = params.volumeMoreThan ?? 100000;

                // 1. Initial Liquidity Filter
                let filtered = candidates.filter(c => c.price >= minPrice && c.volume >= minVolume);

                // 2. Local Sector/Industry Filter (Project-specific requirement)
                if (params.sector || params.industry) {
                    console.log(`[Scanner] Applying Local Filter (Sector: ${params.sector}, Industry: ${params.industry}). Pool: ${filtered.length}`);

                    const matches: typeof filtered = [];
                    // Process in chunks to avoid spamming classification endpoint
                    const chunk = 10;
                    for (let i = 0; i < filtered.length; i += chunk) {
                        const batch = filtered.slice(i, i + chunk);
                        const results = await Promise.all(batch.map(async c => {
                            const info = await getTickerClassification(c.ticker);
                            if (!info) return null; // Safe exclude

                            let sectorMatch = !params.sector;
                            if (params.sector) {
                                const s = info.sector.toLowerCase();
                                const target = params.sector.toLowerCase();
                                sectorMatch = s.includes(target) || (params.sector === 'Technology' && s.includes('tech'));
                            }

                            let industryMatch = !params.industry;
                            if (params.industry) {
                                const ind = info.industry.toLowerCase();
                                const target = params.industry.toLowerCase();
                                industryMatch = ind.includes(target);
                                // Biotechnology alias
                                if (params.industry === 'Biotechnology' && !industryMatch) {
                                    industryMatch = ind.includes('bio') || ind.includes('drug') || ind.includes('pharma');
                                }
                            }
                            return (sectorMatch && industryMatch) ? c : null;
                        }));
                        matches.push(...results.filter((c): c is typeof filtered[0] => c !== null));
                        if (matches.length >= (params.limit || 50)) break; // Stop if we have enough
                        await new Promise(r => setTimeout(r, 20)); // Rate limit protection
                    }

                    if (matches.length > 0) {
                        filtered = matches;
                        console.log(`[Scanner] Local Filter matched ${filtered.length} candidates.`);
                    } else if (params.industry && params.sector) {
                        // Fallback: Drop industry, keep sector logic? 
                        // For now, let it fall through to FMP screener if Polygon+Local yields nothing.
                        console.warn("[Scanner] Local Filter yielded 0 results. Falling back to FMP Screener.");
                    }
                }

                if (filtered.length > 0) {
                    const scored = filtered.map(c => ({
                        ...c,
                        score: c.volume * (1 + Math.abs(c.changePerc) / 100)
                    }));
                    scored.sort((a, b) => b.score - a.score);
                    const limit = params.limit ?? 50;
                    return scored.slice(0, limit).map(c => c.ticker);
                }
            }
        }
    } catch (error) {
        console.warn("[Polygon] Screener failed, falling back to FMP:", error);
    }

    // --- ATTEMPT 2: POLYGON GROUPED DAILY (Fallback for 403/Snapshot issues) ---
    // Fallback: Use Grouped Daily if Snapshot fails, and filter locally.
    {
        console.log("[Scanner] Attempting Polygon Grouped Daily Fallback...");
        try {
            const polygonKey = getPolygonApiKey();
            if (polygonKey) {
                let groupedCandidates = await fetchPolygonGroupedDaily(polygonKey, params);

                // Local Sector/Industry Filter
                if (groupedCandidates.length > 0 && (params.sector || params.industry)) {
                    console.log(`[Scanner] Filtering Grouped Daily candidates (${groupedCandidates.length}) by Profile...`);
                    const matches: string[] = [];
                    const chunk = 10;
                    for (let i = 0; i < groupedCandidates.length; i += chunk) {
                        const batch = groupedCandidates.slice(i, i + chunk);
                        const results = await Promise.all(batch.map(async t => {
                            const info = await getTickerClassification(t);
                            if (!info) return null;

                            let sectorMatch = !params.sector;
                            if (params.sector) {
                                const s = info.sector.toLowerCase();
                                const target = params.sector.toLowerCase();
                                sectorMatch = s.includes(target) || (params.sector === 'Technology' && s.includes('tech'));
                            }

                            let industryMatch = !params.industry;
                            if (params.industry) {
                                const ind = info.industry.toLowerCase();
                                const target = params.industry.toLowerCase();
                                industryMatch = ind.includes(target);
                                if (params.industry === 'Biotechnology' && !industryMatch) {
                                    industryMatch = ind.includes('bio') || ind.includes('drug') || ind.includes('pharma');
                                }
                            }
                            return (sectorMatch && industryMatch) ? t : null;
                        }));
                        matches.push(...results.filter((t): t is string => t !== null));
                        if (matches.length >= (params.limit || 50)) break;
                        await new Promise(r => setTimeout(r, 20));
                    }
                    groupedCandidates = matches;
                }

                if (groupedCandidates.length > 0) {
                    console.log(`[Scanner] Polygon Grouped Daily returned ${groupedCandidates.length} candidates.`);
                    return groupedCandidates;
                }
            }
        } catch (e) {
            console.error("[Scanner] Polygon Grouped Daily failed:", e);
        }
    }

    // --- ATTEMPT 3: FMP FALLBACK (Stable Screener) ---
    console.log("[Scanner] Attempting FMP Fallback...");
    try {
        const fmpResults = await fetchDynamicScreener(params);
        if (fmpResults.length > 0) {
            console.log(`[Scanner] FMP Fallback returned ${fmpResults.length} candidates.`);
            return fmpResults;
        }
    } catch (e) {
        console.error("[Scanner] FMP Fallback failed:", e);
    }

    // --- ATTEMPT 4: FMP "MOST ACTIVES" (Last Resort) ---
    console.log("[Scanner] Attempting FMP Market Actives Fallback...");
    try {
        const actives = await fetchMarketActives();
        if (actives.length > 0) {
            console.log(`[Scanner] Active Fallback returned ${actives.length} candidates.`);
            return actives;
        }
    } catch (e) {
        console.error("[Scanner] Actives Fallback failed:", e);
    }

    // --- ATTEMPT 5: HARDCODED FALLBACK (Nuclear Option) ---
    // --- ATTEMPT 5: HARDCODED FALLBACK (Nuclear Option) ---
    console.warn(`[Scanner] All APIs failed for ${profile}. Engaging Profile-Specific Fallback.`);

    const TECH_GIANTS = ["AAPL", "NVDA", "TSLA", "AMD", "MSFT", "GOOGL", "AMZN", "META", "NFLX", "AVGO", "PLTR", "COIN", "INTC"];
    const BIOTECH_GIANTS = ["MRNA", "GILD", "VRTX", "AMGN", "REGN", "BIIB", "ILMN", "ALNY", "BNTX", "CRSP", "NTLA", "ITCI", "SAGE", "BEAM", "EXAS", "NBIX", "UTHR", "INCY"];
    const MOMENTUM_Movers = ["MARA", "RIOT", "DKNG", "HOOD", "RIVN", "LCID", "SOFI", "AFRM", "UPST", "AI", "PLTR", "CVNA"];

    switch (profile) {
        case 'bio_analyst':
            return BIOTECH_GIANTS;
        case 'high_growth':
            return ["PLTR", "SOFI", "CRWD", "SNOW", "DDOG", "ZS", "NET", "PANW", "TTD", "ROKU", ...TECH_GIANTS.slice(0, 5)];
        case 'pro_trader':
        case 'immediate_breakout':
            return MOMENTUM_Movers;
        case 'catalyst':
            return ["NVDA", "TSLA", "AMD", "SMCI", "ARM", "RDDT", "DJT", "GME", "AMC", "COIN"];
        default: // hedge_fund and others
            return ["AAPL", "NVDA", "TSLA", "AMD", "MSFT", "JPM", "XOM", "UNH", "V", "PG", "LLY", "AVGO", "COST"];
    }

    // --- FAILURE (Unreachable if fallback exists, but kept for safety) ---
    // console.warn("[Scanner] All API sources failed to return candidates.");
    // return [];
};

export async function fetchMarketActives(): Promise<string[]> {
    const apiKey = getFmpApiKey();
    if (!apiKey) return [];
    try {
        // Fetch Most Actives - usually free and robust
        const response = await fetch(`https://financialmodelingprep.com/api/v3/stock_market/actives?apikey=${apiKey}`);
        if (!response.ok) return [];
        const data = await response.json();
        // Filter out low prices just in case
        return data
            .filter((d: any) => d.price > 2)
            .slice(0, 50)
            .map((item: any) => item.symbol);
    } catch (e) {
        console.error("Error fetching market actives:", e);
        return [];
    }
};

export async function fetchDynamicScreener(params: ScreenerParams): Promise<string[]> {
    const apiKey = getFmpApiKey();
    if (!apiKey) {
        console.warn("[FMP] No API Key available for screener.");
        return [];
    }

    const exchanges = ['NASDAQ', 'NYSE', 'AMEX'];

    const constructUrl = (p: ScreenerParams, exchange: string, isRetry = false) => {
        const query = new URLSearchParams({
            apikey: apiKey,
            limit: Math.ceil((p.limit || 50) / 3).toString() // Split limit across 3 exchanges
        });

        if (p.marketCapMoreThan) query.append('marketCapMoreThan', p.marketCapMoreThan.toString());
        if (p.volumeMoreThan && !isRetry) query.append('volumeMoreThan', p.volumeMoreThan.toString());
        if (p.priceMoreThan) query.append('priceMoreThan', p.priceMoreThan.toString());
        if (p.sector) query.append('sector', p.sector);
        if (p.industry) query.append('industry', p.industry);
        if (p.betaMoreThan) query.append('betaMoreThan', p.betaMoreThan.toString());
        if (p.isEtf !== undefined) query.append('isEtf', p.isEtf.toString());

        query.append('exchange', exchange);

        return `https://financialmodelingprep.com/api/v3/stock-screener?${query.toString()}`;
    };

    const fetchForExchange = async (exchange: string, isRetry = false): Promise<any[]> => {
        try {
            const url = constructUrl(params, exchange, isRetry);
            const response = await fetch(url);
            if (!response.ok) {
                // retry with relaxed if 403?
                // For now just return empty for this exchange
                return [];
            }
            return await response.json();
        } catch (e) {
            return [];
        }
    };

    try {
        // Parallel requests for all exchanges
        let results = await Promise.all(exchanges.map(ex => fetchForExchange(ex)));
        let flatResults = results.flat();

        // If empty, try relaxed logic (Method 2: Retry with relaxed constraints)
        if (flatResults.length === 0) {
            console.log("[FMP] Retrying screener with relaxed constraints (Level 2)...");
            const relaxedParams = { ...params, industry: undefined, volumeMoreThan: 100000 };
            // We have to redefine fetchForExchange logic or just call it recursively? 
            // Simpler to just duplicate the loop loop for brevity or abstract it.
            // Let's just do one retry loop here.

            const retryResults = await Promise.all(exchanges.map(ex => {
                const query = new URLSearchParams({ apikey: apiKey, limit: '20', exchange: ex });
                if (params.sector) query.append('sector', params.sector); // Keep sector
                // Drop industry
                query.append('volumeMoreThan', '100000');
                if (params.priceMoreThan) query.append('priceMoreThan', params.priceMoreThan.toString());
                const url = `https://financialmodelingprep.com/api/v3/stock-screener?${query.toString()}`;
                return fetch(url).then(r => r.ok ? r.json() : []).catch(() => []);
            }));
            flatResults = retryResults.flat();
        }

        // Level 3 Fallback
        if (flatResults.length === 0) {
            const genericResults = await Promise.all(exchanges.map(ex => {
                // Just High Volume
                const url = `https://financialmodelingprep.com/api/v3/stock-screener?apikey=${apiKey}&limit=20&exchange=${ex}&volumeMoreThan=500000&priceMoreThan=5`;
                return fetch(url).then(r => r.ok ? r.json() : []).catch(() => []);
            }));
            flatResults = genericResults.flat();
        }

        if (!flatResults || flatResults.length === 0) return [];

        const scored = flatResults.map((item: any) => ({
            ...item,
            score: (item.volume || 0) * (Math.abs(item.changesPercentage || 0))
        }));
        scored.sort((a: any, b: any) => b.score - a.score);

        // Dedup tickers
        const uniqueTickers = Array.from(new Set(scored.map((item: any) => item.symbol)));
        return uniqueTickers;

    } catch (error) {
        console.error("Error fetching dynamic screener:", error);
        return [];
    }
}

export async function fetchPolygonGroupedDaily(apiKey: string, params: ScreenerParams): Promise<string[]> {
    let date = new Date();
    // Start with yesterday to be safe (EOD data)
    date.setDate(date.getDate() - 1);

    for (let i = 0; i < 3; i++) {
        // Skip weekends
        while (date.getDay() === 0 || date.getDay() === 6) {
            date.setDate(date.getDate() - 1);
        }

        const dateStr = date.toISOString().split('T')[0];
        const url = `${POLYGON_BASE_URL}/aggs/grouped/locale/us/market/stocks/${dateStr}?adjusted=true&apiKey=${apiKey}`;

        try {
            console.log(`[Polygon] Checking Grouped Daily for ${dateStr}...`);
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                const results = (data.results || []) as any[];
                if (results.length > 0) {
                    // Filter & Sort
                    const minPrice = params.priceMoreThan ?? 2;
                    const minVolume = params.volumeMoreThan ?? 500000;

                    const valid = results.filter(r => r.c >= minPrice && r.v >= minVolume && r.T && !r.T.includes('.'));

                    // Sort by Volume * Volatility Proxy
                    const scored = valid.map(r => ({
                        ticker: r.T,
                        score: r.v * (Math.abs((r.c - r.o) / r.o))
                    }));

                    scored.sort((a, b) => b.score - a.score);

                    // If we are likely to filter this list later (sector/industry), return a larger pool
                    const limit = (params.sector || params.industry) ? 200 : 50;
                    return scored.slice(0, limit).map(s => s.ticker);
                }
            } else {
                console.warn(`[Polygon] Grouped Daily ${dateStr} failed: ${response.status}`);
                if (response.status === 403) {
                    console.warn("[Polygon] Grouped Daily Access Denied (Plan Limit). Stopping fallback.");
                    break;
                }
            }
        } catch (e) {
            console.error(`[Polygon] Error fetching ${dateStr}:`, e);
        }

        // Go back one more day
        date.setDate(date.getDate() - 1);
    }
    return [];
};
