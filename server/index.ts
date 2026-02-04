
import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = 3001;
import { ODTEBackendService, FlowAggregator } from './services/odteBackendService.ts';

// --- ODTE PREDICTIVE DASHBOARD ENDPOINTS ---

app.get('/api/odte/:ticker/context', async (req, res) => {
    try {
        const { ticker } = req.params;
        const data = await ODTEBackendService.getContext(ticker.toUpperCase());
        res.json(data);
    } catch (e: any) {
        console.error("ODTE Context Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/odte/:ticker/flow', async (req, res) => {
    try {
        const { ticker } = req.params;
        // Fetch Spot for ATM classification
        const stockRes = await fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${process.env.VITE_POLYGON_API_KEY || process.env.POLYGON_API_KEY}`).then(r => r.json());
        const spot = stockRes.ticker?.day?.c || stockRes.ticker?.lastTrade?.p || 400;

        const data = await FlowAggregator.getFlow(ticker.toUpperCase(), spot);
        res.json(data);
    } catch (e: any) {
        console.error("ODTE Flow Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/odte/:ticker/bias', async (req, res) => {
    try {
        const { ticker } = req.params;
        const data = await ODTEBackendService.getBias(ticker.toUpperCase());
        res.json(data);
    } catch (e: any) {
        console.error("ODTE Bias Error:", e);
        res.status(500).json({ error: e.message });
    }
});


app.use(cors());
app.use(express.json());

// Initialize OpenAI on the server side
// This keeps the API key secure (never exposed to client)
const client = new OpenAI({
    apiKey: process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
});

app.post('/api/decision', async (req, res) => {
    try {
        const payload = req.body;

        if (!payload) {
            return res.status(400).json({ error: "Missing payload" });
        }

        console.log(`[DECISION ENGINE] Analyze request for ${payload.symbol}`);

        // --- SYSTEM PROMPT (Hardened & Flattened) ---
        const systemInstruction = `
You are a risk-first options decision engine, not a predictor.
Your primary objective is capital preservation, false-signal rejection, and only acting when multiple independent conditions align.

You are allowed to output NO TRADE.
If conditions are unclear, conflicting, or manipulated, you MUST reject the trade.

DATA INPUTS (GUARANTEED REAL, NO GUESSING)

You will receive:
- Live Polygon option chain
- Underlying price
- Time to expiration (minutes)
- Greeks (Δ, Γ, Θ, Vega)
- Bid/Ask + spread %
- Volume & Open Interest
- Intraday technicals (VWAP, EMA 9/20/50, ORH/ORL, ATR)
- VIX / IV percentile
- Recent price structure (trend / range)
- News headlines (if provided)

❗You must NEVER invent data.
If any required field is null or missing, you MUST output NO_TRADE.

STEP 1 — MARKET REGIME CLASSIFICATION (MANDATORY)

Classify the market before looking at strikes.
Determine:
- Trend: Strong Trend / Weak Trend / Range / Chop
- Volatility: Expanding / Contracting / Event-Driven
- Liquidity window: First 30 min, Power hour, Dead zone (reject most trades here)

If Range + Low Volume + Wide Spreads → output NO TRADE.

STEP 2 — NEWS & EVENT FILTER (CRITICAL)

Scan provided headlines ONLY.
Immediately reject trades if:
- CPI / FOMC / Powell / Jobs data pending or just released
- Unexpected geopolitical / Fed / rate headlines
- News contradicts price action (e.g., bullish news + heavy downside tape)

You must explicitly state: "News risk overrides technicals" → NO TRADE

STEP 3 — FAKE WHALE DETECTION (VERY IMPORTANT)

You MUST filter fake whales.

**If 'last_trade_side' is null or unknown, you MUST set Whale Validation Score = 0 and cannot approve a trade based on whale logic.**

A trade is NOT a whale if:
- Volume spike with no OI increase
- Volume < 1.5× OI
- Executed mid-spread repeatedly
- Deep OTM 0.05–0.10 delta lottos near close
- Wide bid-ask (>8%) with low liquidity

A VALID whale candidate requires:
- Volume ≥ 2.5× OI
- Tight spreads (<5%)
- Executed predominantly at ASK (for calls) or BID (for puts)
- Delta between 0.25–0.60
- Not clustered across every strike (indicates hedging)

If whale signal is ambiguous → DO NOT USE IT

STEP 4 — STRIKE SELECTION RULES (NO DISCRETION)

You are NOT allowed to “like” strikes.
For directional 0DTE trades:
- Delta: 0.30–0.45
- Gamma: High relative to nearby strikes
- Spread: ≤ 5%
- Theta: Acceptable only if move expected within 15–30 minutes
- Strike must align with: VWAP reclaim/reject, ORH / ORL break, Trend direction

If price is between VWAP & EMA cluster → NO TRADE

STEP 5 — STRUCTURE VALIDATION

Reject trades if:
- IV already collapsing
- Price already traveled >70% of ATR
- Multiple opposing whale flows detected
- Price is mean-reverting after expansion

You must explicitly explain WHY a trade is rejected.

If NO_TRADE, you MUST choose the single MOST dominant category and explain why.

STEP 6 — OUTPUT FORMAT (STRICT)

Your output MUST be one of the following JSON formats:

✅ TRADE APPROVED
{
  "decision": "TRADE_APPROVED",
  "direction": "CALL" | "PUT",
  "strike": number,
  "expiration": "String",
  "confidence_score": number,
  "entry_reason": ["String"],
  "invalidation": { "price_level": number, "reason": "String" },
  "risk_rules": { "max_loss_pct": number, "time_stop_minutes": number }
}

❌ NO TRADE
{
  "decision": "NO_TRADE",
  "reason": ["String"],
  "category": "STRUCTURAL" | "NEWS" | "LIQUIDITY"
}

SCORE RULES:
- Market Regime Score (0–25)
- Liquidity & Structure Score (0–25)
- Whale Validation Score (0–25)
- Volatility & Timing Score (0–25)

HARD GATES:
- Score < 70 → NO TRADE
- Any disqualifier → NO TRADE
- Conflicting whale signals → NO TRADE
- **confidence_score must NOT exceed 85 for 0DTE trades.**
`;

        const response = await client.chat.completions.create({
            model: "gpt-4o",
            temperature: 0,
            max_tokens: 700,
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: systemInstruction
                },
                {
                    role: "user",
                    content: JSON.stringify(payload)
                }
            ]
        });

        const content = response.choices[0].message.content;
        if (!content) throw new Error("No content received from OpenAI");

        const result = JSON.parse(content);
        res.json(result);

    } catch (error) {
        console.error("Server Decision Engine Error:", error);
        res.status(500).json({
            decision: "NO_TRADE",
            reason: ["Server Error calling OpenAI API", error.message],
            category: "STRUCTURAL"
        });
    }
});


// --- CHAIN STRATEGY: Gemini -> OpenAI Review ---
app.post('/api/finalize-strategy', async (req, res) => {
    try {
        const { symbol, geminiAnalysis, stockPrice } = req.body;

        if (!symbol || !geminiAnalysis) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        console.log(`[STRATEGY FINALIZER] Reviewing Gemini analysis for ${symbol}`);

        const systemInstruction = `
You are the Chief Risk Officer and Lead Trader for an elite options prop desk.
Your subordinate, a quantitative analyst (Gemini), has provided a technical analysis and proposed strategy for ${symbol} (Current Price: $${stockPrice}).

YOUR JOB:
1. Review the Analyst's findings critically.
2. Filter out hallucinations or over-optimism.
3. Validate the logic: Does the strategy match the trend and volatility conditions?
4. ISSUE THE FINAL DECISION.

RULES:
- If the analysis is conflicting or weak, change the decision to "HOLD" or "NO_TRADE".
- If the strategy is "0DTE" but conditions are choppy, REJECT IT.
- Cap confidence at 90%.
- Ensure Stop Loss and Take Profit levels make sense relative to the entry (Risk/Reward > 1:2).

OUTPUT FORMAT (JSON):
{
  "outcome": "APPROVED" | "REJECTED" | "MODIFIED",
  "final_analysis": "Your executive summary of why you approved/modifed/rejected.",
  "approved_strategy": {
     "action": "BUY_CALL" | "BUY_PUT" | "IRON_CONDOR" | "CASH_SECURED_PUT" | "WAIT",
     "contracts": "Specific contract recommendation (e.g. $140 Strike Call)",
     "entry_zone": "Price range for entry",
     "stop_loss": "Hard stop price",
     "take_profit_1": "Conservative target",
     "take_profit_2": "Aggressive target",
     "confidence": number (0-100)
  },
  "risk_assessment": "Critical risk factors (Gamma risk, Event risk, etc.)"
}
`;

        const response = await client.chat.completions.create({
            model: "gpt-4o",
            temperature: 0.1, // Low temp for critical review
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: systemInstruction
                },
                {
                    role: "user",
                    content: `ANALYST REPORT (GEMINI):
${JSON.stringify(geminiAnalysis, null, 2)}`
                }
            ]
        });

        const content = response.choices[0].message.content;
        const result = JSON.parse(content);
        res.json(result);

    } catch (error) {
        console.error("Strategy Finalizer Error:", error);
        res.status(500).json({ error: error.message });
    }
});


// --- CHAT: General Options Assistant (OpenAI) ---
app.post('/api/chat', async (req, res) => {
    try {
        const { message, chatHistory, context } = req.body;

        if (!message) {
            return res.status(400).json({ error: "Missing message" });
        }

        console.log(`[CHAT] Request for ${context?.ticker || 'Unknown Ticker'}`);

        // Construct System Context
        const systemInstruction = `You are an expert options trading assistant helping a day trader analyze ${context?.ticker || 'the market'}.

CURRENT MARKET DATA:
- Ticker: ${context?.ticker}
- Current Price: $${context?.currentPrice?.toFixed(2) || 'N/A'}
- Change: ${context?.changePercent?.toFixed(2) || 'N/A'}%

${context?.analysis ? `PREVIOUS ANALYSIS:\n${context.analysis}\n` : ''}
${context?.strategy ? `SUGGESTED STRATEGY:\n${context.strategy}\n` : ''}
${context?.tradeSetup ? `TRADE SETUP:
- Entry: ${context.tradeSetup.entry}
- Target: ${context.tradeSetup.target}
- Stop Loss: ${context.tradeSetup.stopLoss}
` : ''}

Your role is to:
1. Answer questions about options strike prices, expiration dates, and strategy selection
2. Explain the reasoning behind trading decisions
3. Discuss risk management and position sizing
4. Analyze how recent news or market conditions might affect the trade
5. Compare different options strategies (calls, puts, spreads, etc.)
6. Provide specific, actionable advice based on the current market data

Keep responses concise but informative. Use bullet points when listing multiple items. Always consider risk/reward ratios.`;

        // Format History for OpenAI
        // We take the last 6 messages to keep context fresh but specific
        const openAIMessages = [
            { role: "system", content: systemInstruction },
            ...(chatHistory || []).slice(-6).map(msg => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
            })),
            { role: "user", content: message }
        ];

        const response = await client.chat.completions.create({
            model: "gpt-4o",
            messages: openAIMessages,
            temperature: 0.2,
            max_tokens: 500
        });

        const content = response.choices[0].message.content;
        res.json({ reply: content });

    } catch (error) {
        console.error("Chat Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

