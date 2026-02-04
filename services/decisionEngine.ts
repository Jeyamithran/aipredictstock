
import { StockData, StockNews } from "../types";
import { OptionContract } from "./polygonService";

// --- Types based on User's JSON Schema (Updated for Null Safety) ---

export interface DecisionInput {
    symbol: string;
    timestamp_et: string;
    underlying: {
        price: number;
        atr_5m: number | null;
        vwap: number | null;
        ema_9: number | null;
        ema_20: number | null;
        ema_50: number | null;
        or_high: number | null;
        or_low: number | null;
        trend: "up" | "down" | "range" | "chop" | null;
        price_vs_vwap: "above" | "below" | "reclaiming" | "rejecting" | null;
    };
    volatility: {
        vix: number | null;
        iv_percentile: number | null;
        iv_trend: "rising" | "falling" | "flat" | null;
    };
    time: {
        minutes_to_expiry: number;
        session: "open" | "mid" | "power_hour" | "dead_zone" | "closed";
    };
    option_chain: {
        strike: number;
        type: "call" | "put";
        bid: number;
        ask: number;
        spread_pct: number;
        delta: number;
        gamma: number;
        theta: number;
        iv: number;
        volume: number;
        open_interest: number;
        last_trade_side: "ask" | "bid" | "mid" | null;
    }[];
    news: {
        headlines: string[];
        high_impact_event: boolean | null;
    };
}

export interface TradeApproved {
    decision: "TRADE_APPROVED";
    direction: "CALL" | "PUT";
    strike: number;
    expiration: string;
    confidence_score: number;
    entry_reason: string[];
    invalidation: {
        price_level: number;
        reason: string;
    };
    risk_rules: {
        max_loss_pct: number;
        time_stop_minutes: number;
    };
}

export interface NoTrade {
    decision: "NO_TRADE";
    reason: string[];
    category: "STRUCTURAL" | "NEWS" | "LIQUIDITY";
}

export type DecisionOutput = TradeApproved | NoTrade;

// --- API Service ---

/**
 * Pre-Filter to reject bad trades BEFORE calling GPT.
 * Saves tokens and prevents hallucinated approvals.
 */
export function preReject(payload: DecisionInput): string[] {
    const reasons: string[] = [];

    // 1. Time to Expiry
    if (payload.time.minutes_to_expiry < 30)
        reasons.push("Too close to expiry (<30m)");

    // 2. Wide Spreads
    if (payload.option_chain.length > 0 && payload.option_chain.every(c => c.spread_pct > 8))
        reasons.push("Wide spreads across chain (>8%)");

    // 3. Dead Zone (Liquidity Lull)
    if (payload.time.session === "dead_zone")
        reasons.push("Dead zone liquidity (Avoid 11:30-13:30 ET)");

    // 4. High Impact News
    if (payload.news.high_impact_event === true)
        reasons.push("High impact news event detected");

    // 5. Market Closed Check
    if (payload.time.session === "closed")
        reasons.push("Market is CLOSED. Data may be stale.");

    // 5. Critical Null Gate (Strict technical context)
    if (
        payload.underlying.vwap === null ||
        payload.underlying.ema_9 === null ||
        payload.underlying.ema_20 === null ||
        payload.underlying.trend === null
    ) {
        reasons.push("Missing critical technical context (VWAP, EMA 9/20, Trend)");
    }

    // 6. ATR Exhaustion Filter (REMOVED - Too strict, causing false negatives)
    // relying on AI model to determine extension/exhaustion instead.

    // 7. Liquidity Illusion Filter
    const fakeLiquidity = payload.option_chain.some(
        c => c.volume > 5000 && c.open_interest < 500
    );
    if (fakeLiquidity) {
        reasons.push("Liquidity illusion (volume without OI)");
    }

    return reasons;
}

/**
 * Calls GPT-4o Pro as an OPTIONS DECISION ENGINE
 */
export async function analyzeOptions(payload: DecisionInput): Promise<DecisionOutput> {
    // --- STEP 0: PRE-REJECT (Hard Gates) ---
    const preRejectReasons = preReject(payload);
    if (preRejectReasons.length > 0) {
        return {
            decision: "NO_TRADE",
            reason: preRejectReasons,
            category: "STRUCTURAL"
        };
    }

    // PROPRIETARY ALGORITHMIC TRADING LOGIC REDACTED
    // The production system analyzes:
    // 1. VWAP / EMA Trend alignment
    // 2. Option Flow Liquidity (Spread/OI)
    // 3. 0DTE specific risk models
    // 4. News Sentiment Scoring

    // For the showcase, we return a mock response or handle it gracefully.
    console.log("Analyze Options called (Showcase Mode)");

    return {
        decision: "NO_TRADE",
        reason: ["Proprietary Logic abstracted for public showcase."],
        category: "STRUCTURAL"
    };
}

// --- Helper: Map App Data to Decision Input ---

export const createDecisionPayload = (
    stock: StockData,
    contracts: OptionContract[],
    news: StockNews[] = [],
    vix: number = 15,
    ivPercentile: number = 50,
    minutesToExpiry: number = 390
): DecisionInput => {

    const now = new Date();
    const nyTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const hour = nyTime.getHours();
    const minute = nyTime.getMinutes();

    // Correct Session Logic (ET)
    // Open: 09:30 - 10:30
    // Mid: 10:30 - 11:30
    // Dead Zone: 11:30 - 13:30 (Lunch Chop)
    // Power Hour: 15:00 - 16:00

    let session: "open" | "mid" | "power_hour" | "dead_zone" | "closed" = "closed";

    const timeValue = hour + (minute / 60);

    // Market Hours: 9:30 AM - 4:00 PM ET
    if (timeValue < 9.5 || timeValue >= 16) {
        session = "closed";
    } else if (timeValue >= 9.5 && timeValue < 10.5) {
        session = "open";
    } else if (timeValue >= 11.5 && timeValue < 13.5) {
        session = "dead_zone"; // 11:30 - 1:30 PM
    } else if (timeValue >= 15) {
        session = "power_hour";
    } else {
        session = "mid";
    }

    // Map Option Contracts
    const mappedChain = contracts.map(c => {
        const ask = c.details?.ask || 0;
        const bid = c.details?.bid || 0;
        const mid = (ask + bid) / 2;
        const spreadPct = mid > 0 ? ((ask - bid) / mid) * 100 : 0;

        return {
            strike: c.strike_price,
            type: c.contract_type as "call" | "put",
            bid: bid,
            ask: ask,
            spread_pct: parseFloat(spreadPct.toFixed(2)),
            delta: c.details?.greeks?.delta || 0,
            gamma: c.details?.greeks?.gamma || 0,
            theta: c.details?.greeks?.theta || 0,
            iv: c.details?.implied_volatility || 0,
            volume: c.details?.volume || 0,
            open_interest: c.details?.open_interest || 0,
            last_trade_side: null // STRICT: We don't have trade ticks yet, so mark as null.
        };
    }).slice(0, 20); // Limit to top 20 to avoid token limit

    const headlines = news.slice(0, 5).map(n => n.title);

    return {
        symbol: stock.ticker,
        timestamp_et: now.toISOString(),
        underlying: {
            price: stock.price,
            atr_5m: stock.atr || null,
            vwap: stock.vwap || null,
            ema_9: stock.ema9 || null,
            ema_20: stock.ema20 || null,
            ema_50: null, // Removed fake value (stock.price)
            or_high: null, // Removed fake value
            or_low: null, // Removed fake value
            trend: stock.trend === 'BULL' ? "up" : stock.trend === 'BEAR' ? "down" : stock.trend === 'FLAT' ? "range" : null,
            price_vs_vwap: stock.vwap ? (stock.price > stock.vwap ? "above" : "below") : null
        },
        volatility: {
            vix: vix,
            iv_percentile: ivPercentile,
            iv_trend: null // Removed fake "flat"
        },
        time: {
            minutes_to_expiry: minutesToExpiry,
            session: session
        },
        option_chain: mappedChain,
        news: {
            headlines: headlines,
            high_impact_event: null // Removed fake false
        }
    };
};
