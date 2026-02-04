import { GoogleGenAI, Type, Schema } from "@google/genai";
import { StockData, TradeSignal, ScannerAlert, ScannerResponse, ScannerProfile } from "../types";
import { SupertrendResult, getFMPQuotes } from "./fmpService";
import { SentimentLabel } from "../utils/analysis";
import { getRecentSuccessfulPatterns } from "./feedbackService";
import { DecisionInput, DecisionOutput, preReject } from './decisionEngine';


// Helper for Model Fallback
const generateContentWithFallback = async (
  ai: GoogleGenAI,
  prompt: string,
  schema?: Schema,
  mimeType: string = "application/json",
  temperature: number = 0.2
) => {
  try {
    // 1. Try Gemini 3 Pro (Experimental/Preview)
    // console.log("Attempting Gemini 3 Pro...");
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: mimeType,
        responseSchema: schema,
        temperature: temperature,
        // @ts-ignore
        thinking_level: "HIGH"
      }
    });
    return { response, modelUsed: 'Gemini 3.0 Pro (Thinking)' };
  } catch (error) {
    console.warn("Gemini 3 Pro failed, falling back to Gemini 2.0 Flash...", error);
    // 2. Fallback to Gemini 2.0 Flash (Stable/Fast)
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: prompt,
      config: {
        responseMimeType: mimeType,
        responseSchema: schema,
        temperature: temperature,
      }
    });
    return { response, modelUsed: 'Gemini 2.0 Flash' };
  }
};
export const analyzeStockWithOptionsAI = async (
  stock: StockData,
  supertrend: SupertrendResult | null,
  perplexityContext?: string
): Promise<{ analysis: string; strategy: string; tradeSetup: { entry: string; target: string; stopLoss: string }, generatedSignal: Partial<TradeSignal>, modelUsed?: string }> => {
  // Use Runtime env or Vite env
  const runtimeEnv = (typeof window !== 'undefined') ? (window as any).env : {};
  const apiKey = runtimeEnv?.VITE_GEMINI_API_KEY || (import.meta as any).env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    return {
      analysis: "API Key not configured in environment.",
      strategy: "N/A",
      tradeSetup: { entry: "-", target: "-", stopLoss: "-" },
      generatedSignal: {}
    };
  }

  const ai = new GoogleGenAI({ apiKey });

  // Format Supertrend data for the prompt
  const stInfo = supertrend
    ? `Supertrend (10, 3.0) Status: ${supertrend.trend} at $${supertrend.value.toFixed(2)}. ATR: ${supertrend.atr.toFixed(2)}.`
    : "Supertrend data unavailable.";

  // Include Perplexity research if available
  const perplexitySection = perplexityContext
    ? `\n\n    DEEP RESEARCH FROM PERPLEXITY:\n    ${perplexityContext}\n    \n    Use this research to inform your analysis and validate your technical signals against fundamental context.`
    : '';

  const prompt = `
    You are an expert options trader and quantitative analyst specializing in Day Trading top cap tech stocks (SPY, QQQ, NVDA, etc.).
    Current Date: ${new Date().toISOString().split('T')[0]}
    Analyze the following technical data for ${stock.ticker} and generate a precise trade signal table entry.
    
    CRITICAL: Incorporate the provided Supertrend logic into your decision.
    - If Supertrend is BULL (Green), look for Long setups. Support is at $${supertrend?.value.toFixed(2)}.
    - If Supertrend is BEAR (Red), look for Short setups. Resistance is at $${supertrend?.value.toFixed(2)}.
${perplexitySection}

    ${getRecentSuccessfulPatterns(5)}

    Data:
    - Current Price: $${stock.price}
    - AI Score: ${stock.score} (Momentum: ${stock.momentumScore.toFixed(1)}, Volume: ${stock.volumeScore.toFixed(1)}, Trend: ${stock.trendScore.toFixed(1)})
    - Volume Strength: ${stock.volumeStrength} (${stock.volumeRatio.toFixed(2)}x average)
    - Distance from 50MA: ${stock.ma50Distance > 0 ? '+' : ''}${stock.ma50Distance.toFixed(2)}%
    - Distance from 200MA: ${stock.ma200Distance > 0 ? '+' : ''}${stock.ma200Distance.toFixed(2)}%
    - Trend: ${stock.trend}
    - Volatility: ${stock.volatility}
    - RSI: ${stock.rsi}
    - Signal: ${stock.signal}
    - ${stInfo}

    Based on this, provide a JSON response with:
    1. 'analysis': A concise technical analysis (2-3 sentences). Comment on volume confirmation and MA alignment.
    2. 'strategy': A specific options strategy (e.g., 0DTE/Weekly calls/puts).
    3. 'mode': Trading mode (Day, Scalp, Swing).
    4. 'analysisType': Primary factor (Trend, Reversal, Breakout, Tech).
    5. 'signal': BUY, SELL, or HOLD.
    6. 'entry': Entry price zone.
    7. 'stopLoss': Stop loss price (Strictly adhere to Supertrend level if applicable).
    8. 'target': Target price.
    9. 'rr': Risk/Reward Ratio (e.g., "2.5").
    10. 'confidence': Confidence percentage (0-100).
  `;

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      analysis: { type: Type.STRING },
      strategy: { type: Type.STRING },
      mode: { type: Type.STRING, enum: ["Day", "Scalp", "Swing"] },
      analysisType: { type: Type.STRING, enum: ["Trend", "Reversal", "Breakout", "Tech"] },
      signal: { type: Type.STRING, enum: ["BUY", "SELL", "HOLD"] },
      entry: { type: Type.STRING },
      target: { type: Type.STRING },
      stopLoss: { type: Type.STRING },
      rr: { type: Type.STRING, description: "Risk Reward Ratio, e.g., '2.1'" },
      confidence: { type: Type.INTEGER, description: "Confidence percentage 0-100" }
    },
    required: ["analysis", "strategy", "mode", "analysisType", "signal", "entry", "target", "stopLoss", "rr", "confidence"],
  };

  try {
    // UPGRADE: Using Fallback Logic (Gemini 3 -> Gemini 2)
    const { response, modelUsed } = await generateContentWithFallback(ai, prompt, schema, "application/json", 0.2);

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const result = JSON.parse(text);

    return {
      analysis: result.analysis || "Analysis unavailable.",
      strategy: result.strategy || "No strategy generated.",
      tradeSetup: {
        entry: result.entry || "N/A",
        target: result.target || "N/A",
        stopLoss: result.stopLoss || "N/A"
      },
      generatedSignal: {
        mode: result.mode || "Day",
        analysisType: result.analysisType || "Tech",
        signal: result.signal || "HOLD",
        entry: result.entry,
        stopLoss: result.stopLoss,
        target: result.target,
        rr: result.rr || "0",
        confidence: result.confidence || 0
      },
      modelUsed
    };
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      analysis: "Failed to generate analysis.",
      strategy: "Please try again later.",
      tradeSetup: { entry: "-", target: "-", stopLoss: "-" },
      generatedSignal: {}
    };
  }
};

import { OptionContract } from './polygonService';

export const generateOptionStrategy = async (
  ticker: string,
  currentPrice: number,
  trend: string,
  sentiment: SentimentLabel,
  contracts: OptionContract[]
): Promise<{
  recommendedContract: string;
  reasoning: string;
  confidence: number;
  maxProfit: string;
  maxLoss: string;
  action: 'BUY_CALL' | 'BUY_PUT' | 'WAIT';
  modelUsed?: string;
}> => {
  const runtimeEnv = (typeof window !== 'undefined') ? (window as any).env : {};
  const apiKey = runtimeEnv?.VITE_GEMINI_API_KEY || (import.meta as any).env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    return {
      recommendedContract: "N/A",
      reasoning: "API Key missing.",
      confidence: 0,
      maxProfit: "-",
      maxLoss: "-",
      action: 'WAIT'
    };
  }

  // VALIDATION: Save tokens
  if (!ticker || isNaN(currentPrice) || contracts.length === 0) {
    return {
      recommendedContract: "N/A",
      reasoning: "Insufficient data for analysis.",
      confidence: 0,
      maxProfit: "-",
      maxLoss: "-",
      action: 'WAIT'
    };
  }

  const ai = new GoogleGenAI({ apiKey });

  // Time Check for Pre-Market (NY Time)
  const now = new Date();
  const nyTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hour = nyTime.getHours();
  const minute = nyTime.getMinutes();

  // Market Open is 9:30 AM. Pre-market is anything before that.
  // Post-market is after 4:00 PM (16:00).
  const isPreMarket = hour < 9 || (hour === 9 && minute < 30);
  const isPostMarket = hour >= 16;
  const isMarketOpen = !isPreMarket && !isPostMarket;

  // Format contracts for prompt
  const contractList = contracts.map(c => {
    const vol = c.details?.volume || 0;
    const oi = c.details?.open_interest || 0;
    const isWhale = vol > oi;

    // CRITICAL FIX: Disable Whale Alerts in Pre-Market to avoid flagging yesterday's data as "New"
    // In Post-Market, we KEEP the alert because it represents the day's confirmed action.
    const whaleTag = (isWhale && !isPreMarket) ? "🐋 WHALE ALERT (New Positions)" : "";

    return `- ${c.contract_type.toUpperCase()} $${c.strike_price} Exp: ${c.expiration_date} (Vol: ${vol}, OI: ${oi}, Delta: ${c.details?.greeks?.delta?.toFixed(2)}, Gamma: ${c.details?.greeks?.gamma?.toFixed(4)}) ${whaleTag}`;
  }).join('\n');

  const marketStatus = isPreMarket ? "PRE-MARKET (CLOSED)" : isPostMarket ? "POST-MARKET (CLOSED)" : "OPEN";

  const prompt = `
    You are an expert options strategist for a Hedge Fund.
    Ticker: ${ticker}
    Price: $${currentPrice}
    Trend: ${trend}
    Sentiment: ${sentiment}
    Market Status: ${marketStatus}
    ${isPreMarket ? "WARNING: Data is likely from Previous Close. Volume is NOT live. Treat 'Whale' signals with extreme caution." : ""}
    ${isPostMarket ? "NOTE: Analysis is based on today's closing data." : ""}

    Available Contracts (Filtered for Liquidity & Delta):
    ${contractList}

    Task: Select the SINGLE BEST option contract to trade right now for a Day Trade (0DTE/Weekly).
    
    CRITICAL PRIORITY:
    1. **Follow the Whales**: If a contract has a "🐋 WHALE ALERT", it means Volume > Open Interest (Aggressive New Buying). THIS IS THE STRONGEST SIGNAL.
    2. **Sentiment Check**: If 'Sentiment' is STRONG BEARISH but you see a WHALE CALL, be skeptical. Only recommend the Call if the Whale signal is overwhelming (Vol >> OI). Otherwise, prefer Puts or WAIT.
    3. **Gamma**: Look for high Gamma to maximize explosive moves.
    4. **Liquidity**: Ensure high volume for easy exit.

    Return JSON:
    {
      "recommendedContract": "String (e.g. '$150 Call Exp 2024-12-20')",
      "action": "BUY_CALL" or "BUY_PUT" or "WAIT",
      "reasoning": "Concise explanation. MUST explain any Sentiment vs Whale disconnect. Explain why this strike is the 'Magnet'.",
      "confidence": Number (0-100),
      "maxProfit": "String (e.g. 'Unlimited' or 'High')",
      "maxLoss": "String (e.g. 'Premium Paid')"
    }
  `;

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      recommendedContract: { type: Type.STRING },
      action: { type: Type.STRING, enum: ["BUY_CALL", "BUY_PUT", "WAIT"] },
      reasoning: { type: Type.STRING },
      confidence: { type: Type.INTEGER },
      maxProfit: { type: Type.STRING },
      maxLoss: { type: Type.STRING }
    },
    required: ["recommendedContract", "action", "reasoning", "confidence", "maxProfit", "maxLoss"]
  };

  try {
    // UPGRADE: Using Fallback Logic (Gemini 3 -> Gemini 2)
    const { response, modelUsed } = await generateContentWithFallback(ai, prompt, schema, "application/json", 0.7);

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    const result = JSON.parse(text);
    return { ...result, modelUsed };

  } catch (error) {
    console.error("Gemini Strategy Error:", error);
    return {
      recommendedContract: "Error",
      reasoning: "Failed to generate strategy.",
      confidence: 0,
      maxProfit: "-",
      maxLoss: "-",
      action: 'WAIT'
    };
  }
};


import {
  HEDGE_FUND_PROMPT,
  PRO_TRADER_PROMPT,
  CATALYST_HUNTER_PROMPT,
  BIO_TECH_ANALYST_PROMPT,
  IMMEDIATE_BREAKOUT_PROMPT,
  HIGH_GROWTH_ANALYST_PROMPT
} from './scannerPrompts';
import { fetchScreenerResults } from './fmpScreenerService';

const getPromptForProfile = (profile: ScannerProfile, tickers: string): string => {
  switch (profile) {
    case 'hedge_fund': return HEDGE_FUND_PROMPT(tickers);
    case 'pro_trader': return PRO_TRADER_PROMPT(tickers);
    case 'catalyst': return CATALYST_HUNTER_PROMPT(tickers);
    case 'bio_analyst': return BIO_TECH_ANALYST_PROMPT(tickers);
    case 'immediate_breakout': return IMMEDIATE_BREAKOUT_PROMPT(tickers);
    case 'high_growth': return HIGH_GROWTH_ANALYST_PROMPT(tickers);
    default: return HEDGE_FUND_PROMPT(tickers);
  }
};

const sanitizePrice = (value: any): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Remove '$', ',', and whitespace
    const clean = value.replace(/[$,\s]/g, '');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const sanitizeAlert = (alert: any): ScannerAlert => {
  return {
    ...alert,
    EntryPrice: sanitizePrice(alert.EntryPrice),
    TargetPrice: sanitizePrice(alert.TargetPrice),
    StopPrice: sanitizePrice(alert.StopPrice),
    RiskReward: sanitizePrice(alert.RiskReward),
    PotentialGainPercent: sanitizePrice(alert.PotentialGainPercent),
    MomentumScore: sanitizePrice(alert.MomentumScore),
    MarketCapUSD: sanitizePrice(alert.MarketCapUSD),
    AvgVolume20d: sanitizePrice(alert.AvgVolume20d),
    LiquidityUSD: sanitizePrice(alert.LiquidityUSD),
    ShortInterestFloat: sanitizePrice(alert.ShortInterestFloat),
    RelativeStrengthVsSector: sanitizePrice(alert.RelativeStrengthVsSector),
    ATRPercent: sanitizePrice(alert.ATRPercent),
    VolumeVsAvg: sanitizePrice(alert.VolumeVsAvg),
    // Ensure arrays are arrays
    DecisionFactors: Array.isArray(alert.DecisionFactors) ? alert.DecisionFactors : [],
    Sources: Array.isArray(alert.Sources) ? alert.Sources : [],
  };
};

export const runScannerWithGemini = async (profile: ScannerProfile): Promise<ScannerResponse> => {
  const runtimeEnv = (typeof window !== 'undefined') ? (window as any).env : {};
  const apiKey = runtimeEnv?.VITE_GEMINI_API_KEY || (import.meta as any).env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini API Key not configured");
  }

  // Step 1: Fetch Candidates from Polygon Snapshot Screener
  console.log(`[Gemini] Fetching candidate pool for profile: ${profile}...`);
  let tickers: string[] = [];
  try {
    tickers = await fetchScreenerResults(profile);
  } catch (error) {
    console.error("[Gemini] Candidate pool fetch failed.", error);
  }

  if (tickers.length === 0) {
    console.warn("[Gemini] No candidates available. Returning empty buckets per candidate-only rule.");
    return { SmallCap: [], MidCap: [], LargeCap: [] };
  }

  // Step 1.5: Fetch Real-time Prices for context
  let tickerContext = "";
  if (tickers.length > 0) {
    try {
      console.log(`[Gemini] Fetching real-time prices for ${tickers.length} candidates...`);
      const quotes = await getFMPQuotes(tickers);
      const priceMap = new Map(quotes.map(q => [q.ticker, q.price]));

      // Format: "AAPL (Price: $150.20, Vol: 1.5M, RSI: 55, Trend: BULL, 50MA: $145)"
      tickerContext = `Current Date: ${new Date().toISOString().split('T')[0]}\n\n` + tickers.map(t => {
        const q = quotes.find(q => q.ticker === t);
        if (!q) return `${t} (Price: N/A)`;

        const volStr = (q.volume / 1000000).toFixed(1) + 'M';
        return `${t} (Price: $${q.price.toFixed(2)}, Change: ${q.changePercent.toFixed(2)}%, Vol: ${volStr}, RSI: ${q.rsi}, Trend: ${q.trend}, 50MA: $${(q.ma50Distance ? (q.price / (1 + q.ma50Distance / 100)) : q.price).toFixed(2)})`;
      }).join('\n');
    } catch (e) {
      console.warn("[Gemini] Failed to fetch prices for context, using raw tickers.", e);
      tickerContext = tickers.join(', ');
    }
  }

  const systemPrompt = getPromptForProfile(profile, tickerContext);

  const ai = new GoogleGenAI({ apiKey });

  try {
    // SPEED: Keep Scanner on Flash 2.0
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: systemPrompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    try {
      const parsed = JSON.parse(text);

      // Ensure structure matches ScannerResponse and sanitize values
      const sanitizedResponse: ScannerResponse = {
        MarketContext: parsed.MarketContext || undefined,
        SmallCap: Array.isArray(parsed.SmallCap) ? parsed.SmallCap.map(sanitizeAlert) : [],
        MidCap: Array.isArray(parsed.MidCap) ? parsed.MidCap.map(sanitizeAlert) : [],
        LargeCap: Array.isArray(parsed.LargeCap) ? parsed.LargeCap.map(sanitizeAlert) : []
      };

      // Price Correction Logic
      const allTickers = [
        ...sanitizedResponse.SmallCap.map(a => a.Ticker),
        ...sanitizedResponse.MidCap.map(a => a.Ticker),
        ...sanitizedResponse.LargeCap.map(a => a.Ticker)
      ];

      if (allTickers.length > 0) {
        try {
          const realQuotes = await getFMPQuotes(allTickers);
          const quoteMap = new Map(realQuotes.map(q => [q.ticker, q.price]));

          const correctPrices = (alert: ScannerAlert): ScannerAlert => {
            const realPrice = quoteMap.get(alert.Ticker);
            if (!realPrice) return alert;

            // Calculate implied percentages from AI's hallucinated numbers
            const aiEntry = alert.EntryPrice || realPrice;
            const targetPct = aiEntry > 0 ? (alert.TargetPrice - aiEntry) / aiEntry : 0.1; // Default 10% if invalid
            const stopPct = aiEntry > 0 ? (alert.StopPrice - aiEntry) / aiEntry : -0.05; // Default -5% if invalid

            const newEntry = realPrice;
            const newTarget = realPrice * (1 + targetPct);
            const newStop = realPrice * (1 + stopPct);

            return {
              ...alert,
              EntryPrice: parseFloat(newEntry.toFixed(2)),
              TargetPrice: parseFloat(newTarget.toFixed(2)),
              StopPrice: parseFloat(newStop.toFixed(2)),
              PotentialGainPercent: parseFloat((targetPct * 100).toFixed(2))
            };
          };

          sanitizedResponse.SmallCap = sanitizedResponse.SmallCap.map(correctPrices);
          sanitizedResponse.MidCap = sanitizedResponse.MidCap.map(correctPrices);
          sanitizedResponse.LargeCap = sanitizedResponse.LargeCap.map(correctPrices);
        } catch (e) {
          console.error("[Gemini] Failed to correct scanner prices:", e);
        }
      }

      return sanitizedResponse;
    } catch (e) {
      console.error("Failed to parse Gemini scanner JSON:", text);
      throw new Error("Failed to parse Gemini response as JSON");
    }

  } catch (error) {
    console.error('Error calling Gemini API for scanner:', error);
    throw error;
  }
};

import { StockNews } from "../types";

export const generateMarketBriefing = async (
  marketData: any,
  news: StockNews[]
): Promise<string> => {
  const runtimeEnv = (typeof window !== 'undefined') ? (window as any).env : {};
  const apiKey = runtimeEnv?.VITE_GEMINI_API_KEY || (import.meta as any).env.VITE_GEMINI_API_KEY;

  if (!apiKey) return "API Key missing. Cannot generate briefing.";

  const ai = new GoogleGenAI({ apiKey });

  const newsContext = news.slice(0, 10).map(n => `- ${n.title} (${n.symbol})`).join('\n');
  const marketContext = JSON.stringify(marketData, null, 2);

  const now = new Date();
  const hour = now.getHours();
  let session = "Morning Note";
  let context = "Pre-market/Opening";

  if (hour >= 16) {
    session = "Post-Market Wrap";
    context = "Market Closed. Summarize the day's action.";
  } else if (hour >= 12) {
    session = "Mid-Day Update";
    context = "Intraday. Market is Open.";
  }

  const prompt = `
    You are a Bloomberg Terminal market analyst writing a "${session}" for active day traders.
    Current Time: ${now.toLocaleString()}
    Market Status: ${context}

    Market Data:
    ${marketContext}

    Breaking News:
    ${newsContext}

    Task: Write a concise, high-impact market briefing.
    Format:
    ## 🌍 Macro & Indices
    [One sentence summary of broad market sentiment (SPY, QQQ, VIX, Crypto)].

    ## 🚀 Top Movers & Catalysts
    - **TICKER**: [Why it's moving - 1 sentence].
    - **TICKER**: [Why it's moving - 1 sentence].
    (Cover top 3-5 most interesting movers).

    ## ⚡ Sector Watch
    - **AI/Semis**: [Quick comment on NVDA/AMD/SMCI].
    - **Cloud**: [Quick comment].
    - **Crypto**: [Quick comment on BTC/Miners].

    ## 📅 Key Events
    [List 1-2 major upcoming events/earnings if mentioned in news, otherwise omit].

    Style: Professional, dense, no fluff. Use bolding for tickers and key terms.
  `;

  try {
    // UPDATED: Using Fallback Logic (Gemini 3 -> Gemini 2) for robustness
    const { response } = await generateContentWithFallback(ai, prompt, undefined, "text/plain", 0.4);

    return response.text || "Briefing generation failed.";
  } catch (e) {
    console.error("Briefing generation failed", e);
    return "Briefing unavailable due to AI error.";
  }
};
export const generateExitStrategy = async (
  position: {
    entryPrice: number;
    currentPrice: number;
    contracts: number;
    pnlPercent: number;
  },
  marketContext: {
    rsi: number;
    resistanceDist: string;
    tapeAggression: string;
  }
): Promise<{
  action: 'SELL_ALL' | 'SELL_PARTIAL' | 'HOLD';
  quantityToSell: number;
  reasoning: string;
  newStopLoss?: number;
}> => {
  const runtimeEnv = (typeof window !== 'undefined') ? (window as any).env : {};
  const apiKey = runtimeEnv?.VITE_GEMINI_API_KEY || (import.meta as any).env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    return {
      action: 'HOLD',
      quantityToSell: 0,
      reasoning: "AI Key missing. Manage risk manually."
    };
  }

  // VALIDATION: Don't waste tokens on bad data
  if (
    isNaN(position.entryPrice) ||
    isNaN(position.currentPrice) ||
    isNaN(position.pnlPercent) ||
    position.contracts <= 0
  ) {
    console.warn("Invalid position data for AI Exit Strategy. Skipping API call.");
    return {
      action: 'HOLD',
      quantityToSell: 0,
      reasoning: "Data Error. Cannot calculate strategy."
    };
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    You are a disciplined Risk Manager for a Day Trader.
    The user is in a trade with PnL: ${position.pnlPercent > 0 ? '+' : ''}${position.pnlPercent.toFixed(2)}%.
    
    Position:
    - Entry: $${position.entryPrice}
    - Current: $${position.currentPrice}
    - Contracts: ${position.contracts}
    - PnL: ${position.pnlPercent}%

    Market Context:
    - Momentum (RSI): ${marketContext.rsi}
    - Distance to Resistance: ${marketContext.resistanceDist}
    - Tape Aggression: ${marketContext.tapeAggression}

    Task: Decide the exit strategy based on CAPITAL PRESERVATION and MOMENTUM.
    
    SCENARIOS:
    
    1. 🛡️ DEFENSE MODE (PnL is Negative):
       - If PnL <= -10%: CHECK WHALE FLOW.
         - If Whales are selling (Tape Aggression = Low/Selling): **SELL ALL**. (Abort Mission).
         - If Whales are holding/buying: **HOLD**. (Stop Hunt). Suggest Hard Stop at -20%.
    
    2. 🚀 OFFENSE MODE (PnL is Positive):
       - If PnL >= +20%: Suggest **Move Stop to Breakeven** ($${position.entryPrice}).
       - If PnL >= +50%: Suggest **Trailing Stop** (Lock in +40%).
       - If RSI > 80 (Overbought): **SELL PARTIAL** (Scale out).

    Return JSON:
    {
      "action": "SELL_ALL" | "SELL_PARTIAL" | "HOLD",
      "quantityToSell": Number (integer),
      "reasoning": "Concise explanation. MUST mention 'Whale Flow' if in Defense Mode.",
      "newStopLoss": Number (suggested stop price)
    }
  `;

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      action: { type: Type.STRING, enum: ["SELL_ALL", "SELL_PARTIAL", "HOLD"] },
      quantityToSell: { type: Type.INTEGER },
      reasoning: { type: Type.STRING },
      newStopLoss: { type: Type.NUMBER }
    },
    required: ["action", "quantityToSell", "reasoning"]
  };

  try {
    // UPGRADE: Using Fallback Logic (Gemini 3 -> Gemini 2)
    const { response, modelUsed } = await generateContentWithFallback(ai, prompt, schema, "application/json", 0.2);

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    return JSON.parse(text);

  } catch (error) {
    console.error("Gemini Exit Strategy Error:", error);
    return {
      action: 'HOLD',
      quantityToSell: 0,
      reasoning: "AI Error. Follow your plan."
    };
  }
};

export const analyzeOptionsGemini = async (payload: DecisionInput): Promise<DecisionOutput & { modelUsed?: string }> => {
  // --- STEP 0: PRE-REJECT (Hard Gates) ---
  const preRejectReasons = preReject(payload);
  if (preRejectReasons.length > 0) {
    return {
      decision: "NO_TRADE",
      reason: preRejectReasons,
      category: "STRUCTURAL"
    };
  }

  const runtimeEnv = (typeof window !== 'undefined') ? (window as any).env : {};
  const apiKey = runtimeEnv?.VITE_GEMINI_API_KEY || (import.meta as any).env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    return {
      decision: "NO_TRADE",
      reason: ["Missing Gemini API Key"],
      category: "STRUCTURAL"
    };
  }

  const ai = new GoogleGenAI({ apiKey });

  // Prompt (Mirrors Decision Engine Prompt)
  const prompt = `
  You are the "Option Decision Engine" (Risk-First) powered by Gemini 3.0 Pro.
  Analyze the provided market context and option chain to Accept or Reject the trade.

  INPUT DATA:
  ${JSON.stringify(payload, null, 2)}

  RULES:
  1. PROTECTION FIRST. Reject if technicals (VWAP, EMA, Trend) contradict the trade direction.
  2. CHECK LIQUIDITY. Reject if spreads > 10% or open interest is low.
  3. CHECK TIME. Reject if < 30m to expiry (unless specific 0DTE logic, but likely too risky).
  4. CONFIRMATION. "TRADE_APPROVED" only if multiple factors align (Price vs VWAP, Trend, Volume).

  Review the "pre-computed" technicals in 'underlying'. 
  - If trend is 'up' and price > VWAP -> Lean CALL.
  - If trend is 'down' and price < VWAP -> Lean PUT.
  - If 'chop' or mixed -> REJECT.

  OUTPUT FORMAT (JSON ONLY):
  {
      "decision": "TRADE_APPROVED" | "NO_TRADE",
      "direction": "CALL" | "PUT" (Required if Approved),
      "strike": 100.0,
      "expiration": "YYYY-MM-DD",
      "confidence_score": 0-100,
      "entry_reason": ["Reason 1", "Reason 2"],
      "invalidation": {
          "price_level": 123.45,
          "reason": "Close below VWAP"
      },
      "risk_rules": {
          "max_loss_pct": 15,
          "time_stop_minutes": 20
      },
      // If Rejected:
      "reason": ["Reason 1", "Reason 2"],
      "category": "STRUCTURAL" | "NEWS" | "LIQUIDITY"
  }
  `;

  // Schema Definition
  const decisionSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      decision: { type: Type.STRING, enum: ["TRADE_APPROVED", "NO_TRADE"] },
      direction: { type: Type.STRING, enum: ["CALL", "PUT"] },
      strike: { type: Type.NUMBER },
      expiration: { type: Type.STRING },
      confidence_score: { type: Type.INTEGER },
      entry_reason: { type: Type.ARRAY, items: { type: Type.STRING } },
      invalidation: {
        type: Type.OBJECT,
        properties: {
          price_level: { type: Type.NUMBER },
          reason: { type: Type.STRING }
        }
      },
      risk_rules: {
        type: Type.OBJECT,
        properties: {
          max_loss_pct: { type: Type.NUMBER },
          time_stop_minutes: { type: Type.NUMBER }
        }
      },
      reason: { type: Type.ARRAY, items: { type: Type.STRING } },
      category: { type: Type.STRING, enum: ["STRUCTURAL", "NEWS", "LIQUIDITY"] }
    },
    required: ["decision"]
  };

  try {
    // Use Fallback Logic: Try Gemini 3 Pro first
    const { response, modelUsed } = await generateContentWithFallback(ai, prompt, decisionSchema, "application/json", 0.1);

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    const result = JSON.parse(text);

    return { ...result, modelUsed };

  } catch (error) {
    console.error("Gemini Decision Engine Error:", error);
    return {
      decision: "NO_TRADE",
      reason: ["Error calling Gemini API", error instanceof Error ? error.message : "Unknown Error"],
      category: "STRUCTURAL"
    };
  }
};
