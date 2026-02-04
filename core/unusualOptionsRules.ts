import { UNUSUAL_CONSTANTS } from './constants';

export interface UnusualTradeCandidate {
    underlying: string;
    contract: string;
    type: 'call' | 'put';
    strike: number;
    expiry: string;
    dte: number;
    premium: number;
    size: number;
    price: number;
    underlyingPrice: number;

    // Metrics
    volToOi: number;
    spreadPct: number;
    iv: number;
    delta: number;

    // Quote Data
    bid: number;
    ask: number;

    // Classification
    intent: 'BULLISH_BUY' | 'BEARISH_BUY' | 'BEARISH_SELL' | 'BULLISH_SELL' | 'NEUTRAL';
    flags: string[];

    // Score
    score: number;
    timestamp: number;
}

/**
 * Deterministic Rule Engine to score and flag valid unusual trades.
 */
export const scoreUnusualTrade = (
    tradeData: { price: number, size: number },
    quoteData: { bid: number, ask: number, iv?: number, delta?: number },
    contractDetails: { ticker: string, strike_price: number, expiration_date: string, open_interest: number, volume: number },
    underlyingPrice: number
): UnusualTradeCandidate | null => {

    // 1. Calculate Core Metrics
    const premium = tradeData.price * tradeData.size * 100;
    const spread = (quoteData.ask - quoteData.bid) / ((quoteData.ask + quoteData.bid) / 2);

    // 2. Liquidity Gates (Fail Fast) -> NOW RELAXED for debugging / visibility
    // We want to see the rows even if they are small, let the UI filter them.

    // if (tradeData.size < UNUSUAL_CONSTANTS.MIN_TRADE_SIZE) return null;
    // if (premium < UNUSUAL_CONSTANTS.MIN_PREMIUM_USD) return null;

    // Auto-fail if spread is extremely wide (> 40%), regardless of constant. 
    if (spread > 0.40) return null;

    // if (contractDetails.open_interest > 0 && contractDetails.open_interest < UNUSUAL_CONSTANTS.MIN_OI) return null;
    // if (underlyingPrice < UNUSUAL_CONSTANTS.MIN_PRICE) return null;

    // Checks that affect score instead of hard blocking
    let penalty = 0;
    if (tradeData.size < UNUSUAL_CONSTANTS.MIN_TRADE_SIZE) penalty += 20;
    if (premium < UNUSUAL_CONSTANTS.MIN_PREMIUM_USD) penalty += 20;
    if (underlyingPrice < UNUSUAL_CONSTANTS.MIN_PRICE) penalty += 10;

    const mid = (quoteData.bid + quoteData.ask) / 2;
    const isBuy = tradeData.price >= mid;

    // Parse Option Type
    const match = contractDetails.ticker.match(/[A-Z]+([0-9]{6})([CP])([0-9]+)/);
    const type = match && match[2] === 'C' ? 'call' : 'put';

    let intent: UnusualTradeCandidate['intent'] = 'NEUTRAL';
    if (isBuy) {
        intent = type === 'call' ? 'BULLISH_BUY' : 'BEARISH_BUY';
    } else {
        intent = type === 'call' ? 'BEARISH_SELL' : 'BULLISH_SELL';
    }

    // 4. Scoring Logic (0-100)
    let score = 50 - penalty;

    // A. Premium Boost
    if (premium > 50000) score += 5;
    if (premium > 100000) score += 10;
    if (premium > 500000) score += 10;

    // B. Spread Quality
    if (spread < 0.01) score += 10;
    else if (spread < 0.05) score += 5;

    // C. Volume / OI
    const vol = contractDetails.volume || 0;
    const ratio = contractDetails.open_interest > 0 ? vol / contractDetails.open_interest : 0;
    if (ratio > 1.5) score += 5;
    if (ratio > 3.0) score += 10;
    if (ratio > 5.0) score += 5;

    // D. At Ask Boost (Strong Conviction)
    // Strong Bullish: tradePrice >= ask (approx)
    if (tradeData.price >= quoteData.ask * 0.99) score += UNUSUAL_CONSTANTS.SCORE_BOOST_AT_ASK;

    // E. DTE Analysis
    const today = new Date();
    const expiry = new Date(contractDetails.expiration_date);

    // String compare for exact 0DTE accuracy (ignoring timezones/hours)
    // Polygon expiry is YYYY-MM-DD in UTC (usually)
    // We want to know if "today" (local) matches "expiry" (string)
    // But safely, we just use diffDays.

    // Normalize to midnight UTC for diffing
    const todayMidnight = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const expiryMidnight = new Date(Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate()));

    const diffTime = expiryMidnight.getTime() - todayMidnight.getTime();
    const dte = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // 0 if same day

    const flags: string[] = [];
    if (dte === 0) {
        flags.push("0DTE");
        // Neutral score logic for 0DTE - user might want it
    } else if (dte <= 14) {
        flags.push("NEAR_TERM");
        score += 5;
    }

    if (ratio > 5) flags.push("HIGH_VOL_OI");
    if (spread > 0.10) flags.push("WIDE_SPREAD"); // Warning flag

    // Cap Score
    score = Math.min(100, Math.max(0, score));

    return {
        underlying: contractDetails.ticker.split(/[^A-Z]/)[1] || "UNKNOWN",
        contract: contractDetails.ticker,
        type: type as 'call' | 'put',
        strike: contractDetails.strike_price,
        expiry: contractDetails.expiration_date,
        dte,
        premium,
        size: tradeData.size,
        price: tradeData.price,
        underlyingPrice: underlyingPrice,
        volToOi: ratio,
        spreadPct: spread,
        iv: quoteData.iv || 0,
        delta: quoteData.delta || 0,
        bid: quoteData.bid,
        ask: quoteData.ask,
        intent,
        flags,
        score,
        timestamp: Date.now()
    };
};
