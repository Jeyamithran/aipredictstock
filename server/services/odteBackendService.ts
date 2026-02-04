import type { BiasResponse, FlowAggregates, GammaRegime, MarketContextV2, FlowBurst } from '../../types.ts';

const BASE_URL = 'https://api.polygon.io/v3';
const AGGS_URL = 'https://api.polygon.io/v2/aggs';
const API_KEY = process.env.VITE_POLYGON_API_KEY || process.env.POLYGON_API_KEY;

// In-memory state
const gammaHistory: { netGamma: number, timestamp: number }[] = [];
const tradeCache = new Map<string, { trades: any[], timestamp: number }>();
const biasHistory = new Map<string, { bias: 'Bullish' | 'Bearish' | 'NoTrade', score: number, timestamp: number }>();

// Helper: Fetch JSON
async function fetchPolygon(url: string) {
    if (!API_KEY) throw new Error("Missing POLYGON_API_KEY");
    const fullUrl = `${url}${url.includes('?') ? '&' : '?'}apiKey=${API_KEY}`;
    const res = await fetch(fullUrl);
    if (!res.ok) {
        throw new Error(`Polygon Error ${res.status}: ${res.statusText}`);
    }
    return res.json();
}

// --- WALL ENGINE ---
class WallEngine {
    static calculateWalls(options: any[], spotPrice: number) {
        const strikeGamma = new Map<number, number>();
        let maxPain = 0; // Not implementing full max pain here to save complexity, using simple gamma derived

        for (const opt of options) {
            const gamma = opt.greeks?.gamma || 0;
            const oi = opt.open_interest || 0;
            const strike = opt.details?.strike_price || 0;
            const type = opt.details?.contract_type || opt.contract_type;

            const gex = gamma * oi * 100 * spotPrice;
            const signedGex = type === 'call' ? gex : -gex;

            strikeGamma.set(strike, (strikeGamma.get(strike) || 0) + signedGex);
        }

        let maxPosGamma = -Infinity;
        let maxNegGamma = Infinity;
        let callWall = null;
        let putWall = null;

        for (const [strike, val] of strikeGamma.entries()) {
            if (val > maxPosGamma) {
                maxPosGamma = val;
                callWall = strike;
            }
            if (val < maxNegGamma) {
                maxNegGamma = val;
                putWall = strike;
            }
        }

        const distToCallWallPct = callWall ? ((callWall - spotPrice) / spotPrice) * 100 : null;
        const distToPutWallPct = putWall ? ((putWall - spotPrice) / spotPrice) * 100 : null;

        return {
            callWall,
            putWall,
            maxPain: null, // Placeholder
            distToCallWallPct,
            distToPutWallPct
        };
    }
}


// --- A) REGIME ENGINE ---

export class RegimeEngine {
    static async calculateRegime(options: any[], spotPrice: number): Promise<GammaRegime> {
        let netGammaUSD = 0;
        let netDelta = 0;

        for (const opt of options) {
            const gamma = opt.greeks?.gamma || 0;
            const delta = opt.greeks?.delta || 0;
            const oi = opt.open_interest || 0;
            const type = opt.details?.contract_type || opt.contract_type;

            const gex = gamma * oi * 100 * spotPrice;
            const dex = delta * oi * 100;

            if (type === 'call') {
                netGammaUSD += gex;
            } else {
                netGammaUSD -= gex;
            }
            netDelta += dex;
        }

        const now = Date.now();
        while (gammaHistory.length > 0 && now - gammaHistory[0].timestamp > 15 * 60 * 1000) {
            gammaHistory.shift();
        }
        gammaHistory.push({ netGamma: netGammaUSD, timestamp: now });

        let gammaFlip = false;
        if (gammaHistory.length > 1) {
            const wasPositive = gammaHistory.some(h => h.netGamma >= 100_000_000);
            const wasNegative = gammaHistory.some(h => h.netGamma <= -100_000_000);

            const currentIsPositive = netGammaUSD >= 100_000_000;
            const currentIsNegative = netGammaUSD <= -100_000_000;

            if ((wasPositive && currentIsNegative) || (wasNegative && currentIsPositive)) {
                gammaFlip = true;
            }
        }

        let regime: GammaRegime['regime'] = 'Neutral';
        if (netGammaUSD > 300_000_000) regime = 'LongGamma';
        else if (netGammaUSD < -100_000_000) regime = 'ShortGamma';
        else regime = 'Neutral';

        return {
            regime,
            netGammaUSD,
            netDelta,
            gammaFlip
        };
    }
}

// --- B) FLOW AGGREGATOR ---

// --- B) FLOW AGGREGATOR ---
export class FlowAggregator {
    static async getFlow(ticker: string, spotPrice: number): Promise<FlowAggregates> {
        const options = await ODTEBackendService.getODTEList(ticker);
        if (!options.length) return this.emptyFlow();

        // 1. Filter Top 10 by Volume Notional to reduce API calls
        const activeOptions = options
            .filter(o => (o.day.volume || 0) > 0)
            .sort((a, b) => {
                const volA = (a.day.volume || 0) * (a.details?.strike_price || 0); // Approx notional proxy
                const volB = (b.day.volume || 0) * (b.details?.strike_price || 0);
                return volB - volA;
            })
            .slice(0, 10); // Reduced from 30 to 10 for perf

        let agg: FlowAggregates = {
            callAskNotional: 0, putAskNotional: 0,
            callBidNotional: 0, putBidNotional: 0,
            atmCallAskNotional: 0, atmPutAskNotional: 0,
            callVolume: 0, putVolume: 0,
            rvolLike: null,
            bursts: [],
            normalizedImbalance: { overall: 0, atm: 0 }
        };

        const now = Date.now();
        // Calculate Crude RVOL PROXY: Total Volume / (Total OI / 200) -- assuming OI is a proxy for liquidity
        const totalVolume = options.reduce((acc, o) => acc + (o.day.volume || 0), 0);
        const totalOI = options.reduce((acc, o) => acc + (o.open_interest || 0), 0);
        agg.rvolLike = totalOI > 0 ? (totalVolume / (totalOI / 100)) : 0; // Rough metric

        await Promise.all(activeOptions.map(async (opt) => {
            const cacheKey = `${opt.ticker}`;
            let trades = [];

            const cached = tradeCache.get(cacheKey);
            if (cached && (now - cached.timestamp < 15000)) {
                trades = cached.trades;
            } else {
                const fiveMinAgo = now - (5 * 60 * 1000);
                try {
                    const tradesRes = await fetchPolygon(`${BASE_URL}/trades/${opt.ticker}?timestamp.gte=${fiveMinAgo}&limit=200`); // Reduced limit
                    trades = tradesRes.results || [];
                    tradeCache.set(cacheKey, { trades, timestamp: now });
                } catch (e) { console.warn("Trade fetch failed", e); }
            }

            const bid = opt.last_quote?.bid || 0;
            const ask = opt.last_quote?.ask || 0;
            const strike = opt.details?.strike_price || 0;
            const type = opt.details?.contract_type || opt.contract_type || 'call';
            const isATM = Math.abs(strike - spotPrice) <= (spotPrice * 0.003); // 0.3% range

            let recentTradesCount = 0;
            let recentNotional = 0;

            for (const t of trades) {
                const price = t.price;
                const size = t.size;
                const notional = price * 100 * size;

                let side: 'Ask' | 'Bid' | 'Mid' = 'Mid';
                // Improved side logic
                if (ask > 0 && bid > 0) {
                    if (price >= ask) side = 'Ask';
                    else if (price <= bid) side = 'Bid';
                    else {
                        // Midpoint check
                        const mid = (ask + bid) / 2;
                        if (price > mid) side = 'Ask';
                        else if (price < mid) side = 'Bid';
                    }
                }

                if (type === 'call') {
                    agg.callVolume += size;
                    if (side === 'Ask') agg.callAskNotional += notional;
                    if (side === 'Bid') agg.callBidNotional += notional;
                    if (isATM && side === 'Ask') agg.atmCallAskNotional += notional;
                } else {
                    agg.putVolume += size;
                    if (side === 'Ask') agg.putAskNotional += notional;
                    if (side === 'Bid') agg.putBidNotional += notional;
                    if (isATM && side === 'Ask') agg.atmPutAskNotional += notional;
                }

                if (new Date(t.timestamp || t.participant_timestamp).getTime() > (now - 60000)) {
                    recentTradesCount++;
                    recentNotional += notional;
                }
            }

            if (recentTradesCount >= 3 && recentNotional >= 500000) { // Burst threshold
                agg.bursts.push({
                    strike,
                    type,
                    side: 'Unknown', // Aggregated, hard to assign one side, but we could infer
                    notional: recentNotional,
                    timestamp: new Date().toISOString()
                });
            }
        }));

        agg.bursts = agg.bursts.sort((a, b) => b.notional - a.notional).slice(0, 3);

        const totalAsk = agg.callAskNotional + agg.putAskNotional;
        if (totalAsk > 0) {
            agg.normalizedImbalance!.overall = (agg.callAskNotional - agg.putAskNotional) / totalAsk;
        }

        const totalATM = agg.atmCallAskNotional + agg.atmPutAskNotional;
        if (totalATM > 0) {
            agg.normalizedImbalance!.atm = (agg.atmCallAskNotional - agg.atmPutAskNotional) / totalATM;
        }

        return agg;
    }

    static emptyFlow(): FlowAggregates {
        return {
            callAskNotional: 0, putAskNotional: 0, callBidNotional: 0, putBidNotional: 0,
            atmCallAskNotional: 0, atmPutAskNotional: 0, callVolume: 0, putVolume: 0,
            rvolLike: null, bursts: [], normalizedImbalance: { overall: 0, atm: 0 }
        };
    }
}

// --- C) VWAP ENGINE ---
class VWAPEngine {
    static async getVWAP(ticker: string): Promise<MarketContextV2> {
        const today = new Date().toISOString().split('T')[0];
        const aggs = await fetchPolygon(`${AGGS_URL}/ticker/${ticker}/range/1/minute/${today}/${today}?adjusted=true&sort=asc&limit=5000`);

        if (!aggs.results || aggs.results.length === 0) {
            return { vwap: null, priceVsVwap: 'Unknown', vwapDistancePct: 0 };
        }

        let totalPV = 0;
        let totalVol = 0;
        for (const bar of aggs.results) {
            const avgPrice = (bar.h + bar.l + bar.c) / 3;
            const p = bar.vw || avgPrice;
            totalPV += p * bar.v;
            totalVol += bar.v;
        }

        const vwap = totalVol === 0 ? 0 : totalPV / totalVol;
        const lastPrice = aggs.results[aggs.results.length - 1].c;

        let priceVsVwap: 'Above' | 'Below' | 'At' = 'At';
        if (lastPrice > vwap * 1.0005) priceVsVwap = 'Above';
        else if (lastPrice < vwap * 0.9995) priceVsVwap = 'Below';

        const dist = ((lastPrice - vwap) / vwap) * 100;

        return {
            vwap,
            priceVsVwap,
            vwapDistancePct: dist
        };
    }
}

// --- MAIN SERVICE CLASS ---

// --- MAIN SERVICE CLASS ---
export class ODTEBackendService {

    static async getODTEList(ticker: string) {
        const todayStr = new Date().toISOString().split('T')[0];
        try {
            const data = await fetchPolygon(`${BASE_URL}/snapshot/options/${ticker}?expiration_date=${todayStr}&limit=250`);
            return data.results || [];
        } catch (e) {
            console.error("Failed to fetch ODTE list", e);
            return [];
        }
    }

    static async getContext(ticker: string) {
        const vwap = await VWAPEngine.getVWAP(ticker);
        const stockRes = await fetchPolygon(`${BASE_URL.replace('/v3', '/v2')}/snapshot/locale/us/markets/stocks/tickers/${ticker}`);
        const spot = stockRes.ticker?.day?.c || stockRes.ticker?.lastTrade?.p || 400;
        const options = await this.getODTEList(ticker);
        const regime = await RegimeEngine.calculateRegime(options, spot);
        const walls = WallEngine.calculateWalls(options, spot);

        return {
            marketContext: vwap,
            regime,
            walls,
            lastPrice: spot
        };
    }

    static calculateBiasV2(ticker: string, marketContext: MarketContextV2, regime: GammaRegime, flow: FlowAggregates, walls: any): BiasResponse {
        let bullScore = 0;
        let bearScore = 0;
        const reasons: string[] = [];

        // --- 1. REGIME & WALLS ---

        // Long Gamma Effect: Mean Reversion / Chop
        // If Price is far from VWAP in Long Gamma -> Reversion trade potential
        // If Price is near VWAP in Long Gamma -> Chop/Pin

        const isLongGamma = regime.regime === 'LongGamma' && (regime.netGammaUSD || 0) >= 200_000_000;
        const isShortGamma = regime.regime === 'ShortGamma';

        if (isLongGamma) {
            // Pinning Check
            if (Math.abs(marketContext.vwapDistancePct) < 0.25) {
                reasons.push("Pinned (Long Gamma + Near VWAP)");
                bullScore -= 20;
                bearScore -= 20;
            }
        }

        // --- 2. FLOW IMBALANCE ---

        const atmImbalance = flow.normalizedImbalance?.atm || 0;
        const overallImbalance = flow.normalizedImbalance?.overall || 0;

        // Strong Weighing on ATM Flow (Immediate Direction)
        if (atmImbalance > 0.2) { bullScore += 25; reasons.push(`ATM Bulls (+${(atmImbalance * 100).toFixed(0)}%)`); }
        else if (atmImbalance < -0.2) { bearScore += 25; reasons.push(`ATM Bears (${(atmImbalance * 100).toFixed(0)}%)`); }

        // Overall Flow Confirmation
        if (overallImbalance > 0.15) bullScore += 10;
        if (overallImbalance < -0.15) bearScore += 10;

        // --- 3. MARKET STRUCTURE (VWAP) ---

        if (marketContext.priceVsVwap === 'Above') {
            // In Short Gamma, price above VWAP is bullish (momentum)
            if (isShortGamma) {
                bullScore += 20;
                reasons.push("Above VWAP (Momentum)");
            } else {
                // In Long Gamma, price above VWAP might be bearish (reversion) if extended
                if (marketContext.vwapDistancePct > 0.5) {
                    bearScore += 15;
                    reasons.push("Overextended (Long Gamma Reversion)");
                } else {
                    bullScore += 5; // Weak Support
                }
            }
        } else if (marketContext.priceVsVwap === 'Below') {
            if (isShortGamma) {
                bearScore += 20;
                reasons.push("Below VWAP (Momentum)");
            } else {
                if (marketContext.vwapDistancePct < -0.5) {
                    bullScore += 15;
                    reasons.push("Oversold (Long Gamma Reversion)");
                } else {
                    bearScore += 5;
                }
            }
        }

        // --- 4. FLIPS & BURSTS ---

        if (regime.gammaFlip) {
            reasons.push("Gamma Flip Detected");
        }

        // Bursts act as accelerators
        const callBurst = flow.bursts.some(b => b.type === 'call');
        const putBurst = flow.bursts.some(b => b.type === 'put');
        if (callBurst) { bullScore += 15; reasons.push("Call Burst"); }
        if (putBurst) { bearScore += 15; reasons.push("Put Burst"); }

        // --- 5. WALL PROXIMITY ---
        if (walls.distToCallWallPct && walls.distToCallWallPct < 0.3 && walls.distToCallWallPct > 0) {
            bearScore += 10; // Resistance approaching
            reasons.push("Near Call Wall (Resistance)");
        }
        if (walls.distToPutWallPct && walls.distToPutWallPct > -0.3 && walls.distToPutWallPct < 0) {
            bullScore += 10; // Support approaching
            reasons.push("Near Put Wall (Support)");
        }

        // --- SCORE AGGREGATION & HYSTERESIS ---

        let bias: 'Bullish' | 'Bearish' | 'NoTrade' = 'NoTrade';
        let netScore = bullScore - bearScore;
        const maxScore = Math.max(bullScore, bearScore);

        // Retrieve History
        let history = biasHistory.get(ticker);

        // Hysteresis Logic
        // To Switch from Bearish to Bullish, need netScore > 15 (Strong confirmation)
        // To Switch from NoTrade to Active, need maxScore > 40

        if (history) {
            const timeDelta = Date.now() - history.timestamp;
            // Decode memory
            if (timeDelta < 60000) { // Valid memory
                // Dampen flipping
                if (history.bias === 'Bullish' && netScore < -10) { /* Allow Flip */ }
                else if (history.bias === 'Bearish' && netScore > 10) { /* Allow Flip */ }
                else if (history.bias !== 'NoTrade' && Math.abs(netScore) < 10) {
                    // Keep previous bias but lower confidence if signal weakens but doesn't flip
                    bias = history.bias;
                    reasons.unshift("(Holding Trend)");
                }
            }
        }

        if (bias === 'NoTrade') {
            if (netScore > 15 && maxScore > 45) bias = 'Bullish';
            else if (netScore < -15 && maxScore > 45) bias = 'Bearish';
        }

        // Absolute overrides
        if (maxScore < 40) bias = 'NoTrade';
        if (bias === 'NoTrade' && reasons.length === 0) reasons.push("Low Signal Strength");

        // Save History
        biasHistory.set(ticker, { bias, score: netScore, timestamp: Date.now() });

        let confidence = Math.min(Math.abs(netScore) + 50, 100);
        if (bias === 'NoTrade') confidence = 0;

        return {
            bias,
            confidence,
            reasons: reasons.slice(0, 3),
            regime,
            flow,
            context: marketContext,
            score: { bull: bullScore, bear: bearScore, net: netScore },
            walls
        };
    }

    static async getBias(ticker: string): Promise<BiasResponse> {
        const { marketContext, regime, walls, lastPrice } = await this.getContext(ticker);
        const flow = await FlowAggregator.getFlow(ticker, lastPrice);
        return this.calculateBiasV2(ticker, marketContext, regime, flow, walls);
    }
}
