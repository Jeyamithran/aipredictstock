import { TradeSignal, ScannerProfile, ScannerResponse, ScannerAlert } from "../types";
import { fetchScreenerResults } from "./fmpScreenerService";
import { getFMPQuotes, fetchGeneralStockNews, fetchTickerNews } from "./fmpService";
import {
    HEDGE_FUND_PROMPT,
    PRO_TRADER_PROMPT,
    CATALYST_HUNTER_PROMPT,
    BIO_TECH_ANALYST_PROMPT,
    IMMEDIATE_BREAKOUT_PROMPT,
    HIGH_GROWTH_ANALYST_PROMPT
} from './scannerPrompts';

export interface FinalizedStrategy {
    outcome: "APPROVED" | "REJECTED" | "MODIFIED";
    final_analysis: string;
    approved_strategy: {
        action: "BUY_CALL" | "BUY_PUT" | "IRON_CONDOR" | "CASH_SECURED_PUT" | "WAIT";
        contracts: string;
        entry_zone: string;
        stop_loss: string;
        take_profit_1: string;
        take_profit_2: string;
        confidence: number;
    };
    risk_assessment: string;
}

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
        DecisionFactors: Array.isArray(alert.DecisionFactors) ? alert.DecisionFactors : [],
        Sources: Array.isArray(alert.Sources) ? alert.Sources : [],
    };
};

export const runScannerWithOpenAI = async (profile: ScannerProfile): Promise<ScannerResponse> => {
    const runtimeEnv = (typeof window !== 'undefined') ? (window as any).env : {};
    const apiKey = runtimeEnv?.VITE_OPENAI_API_KEY || (import.meta as any).env?.VITE_OPENAI_API_KEY || localStorage.getItem('openai_api_key');

    if (!apiKey) {
        throw new Error("OpenAI API Key not configured");
    }

    // Step 1: Fetch Candidates from Polygon Snapshot Screener
    console.log(`[OpenAI] Fetching candidate pool for profile: ${profile}...`);
    let tickers: string[] = [];
    try {
        tickers = await fetchScreenerResults(profile);
    } catch (error) {
        console.error("[OpenAI] Candidate pool fetch failed.", error);
    }

    if (tickers.length === 0) {
        console.warn("[OpenAI] No candidates available. Returning empty buckets per candidate-only rule.");
        return { SmallCap: [], MidCap: [], LargeCap: [] };
    }

    // Step 1.5: Fetch Real-time Prices & News for context
    // Step 1.5: Fetch Real-time Prices & News for context
    let tickerContext = "";
    if (tickers.length > 0) {
        let quotes: any[] = [];

        // 1. Try Fetching Prices
        try {
            console.log(`[OpenAI] Fetching real-time prices for ${tickers.length} candidates...`);
            // Limit batch size to 10 to avoid FMP url length/limit issues on Starter plans
            const batchSize = 10;
            for (let i = 0; i < tickers.length; i += batchSize) {
                const batch = tickers.slice(i, i + batchSize);
                try {
                    const batchQuotes = await getFMPQuotes(batch);
                    quotes.push(...batchQuotes);
                    await new Promise(r => setTimeout(r, 200)); // Delay between batches
                } catch (err) {
                    console.warn(`[OpenAI] Batch price fetch failed for chunk ${i}:`, err);
                }
            }
        } catch (e) {
            console.warn("[OpenAI] Price fetch failed.", e);
        }

        // 2. Try Fetching News (Critical for AI Validation)
        let newsContext = "";
        try {
            // Fetch Market News (General)
            const generalNews = await fetchGeneralStockNews(5);
            newsContext = "\n\nGENERAL MARKET NEWS:\n" + generalNews.map(n => `- ${n.publishedDate}: ${n.title}`).join('\n');

            // Fetch Specific News for Top 5 Candidates
            const topCandidates = tickers.slice(0, 5);
            console.log(`[OpenAI] Fetching specific news for top 5: ${topCandidates.join(', ')}...`);

            let specificNewsStrings: string[] = [];
            for (const t of topCandidates) {
                try {
                    const news = await fetchTickerNews(t, 3);
                    if (news.length > 0) {
                        specificNewsStrings.push(`\nNEWS FOR ${t}:\n` + news.map(n => `- ${n.publishedDate}: ${n.title} (${n.url})`).join('\n'));
                    }
                    await new Promise(r => setTimeout(r, 300)); // Increased delay to 300ms
                } catch (e) {
                    console.warn(`[OpenAI] Failed news fetch for ${t}`, e);
                }
            }
            newsContext += specificNewsStrings.join('');
        } catch (e) {
            console.warn("[OpenAI] News fetch failed.", e);
        }

        // 3. Construct Context String
        const priceSection = tickers.map(t => {
            const q = quotes.find((q: any) => q.ticker === t);
            if (!q) return `${t} (Price: N/A)`;
            const volStr = (q.volume / 1000000).toFixed(1) + 'M';
            return `${t} (Price: $${q.price.toFixed(2)}, Change: ${q.changePercent.toFixed(2)}%, Vol: ${volStr}, RSI: ${q.rsi}, Trend: ${q.trend}, 50MA: $${(q.ma50Distance ? (q.price / (1 + q.ma50Distance / 100)) : q.price).toFixed(2)})`;
        }).join('\n');

        tickerContext = `Current Date: ${new Date().toISOString().split('T')[0]}\n\n` + priceSection + newsContext;
    }

    // Ensure we have a prompt even if context failed
    const systemPrompt = getPromptForProfile(profile, tickerContext);

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: systemPrompt }
                ],
                temperature: 0.2, // Consistent with Gemini setting
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";

        try {
            const parsed = JSON.parse(content);

            const placeholderFilter = (alert: any) => {
                const t = alert?.Ticker || "";
                return t !== "ABC" && t !== "XYZ" && t !== "EXAMPLE" && t.length < 6;
            };

            const sanitizedResponse: ScannerResponse = {
                MarketContext: parsed.MarketContext || undefined,
                SmallCap: Array.isArray(parsed.SmallCap) ? parsed.SmallCap.filter(placeholderFilter).map(sanitizeAlert) : [],
                MidCap: Array.isArray(parsed.MidCap) ? parsed.MidCap.filter(placeholderFilter).map(sanitizeAlert) : [],
                LargeCap: Array.isArray(parsed.LargeCap) ? parsed.LargeCap.filter(placeholderFilter).map(sanitizeAlert) : []
            };

            // Price Correction Logic (Same as Gemini)
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

                        const aiEntry = alert.EntryPrice || realPrice;
                        const targetPct = aiEntry > 0 ? (alert.TargetPrice - aiEntry) / aiEntry : 0.1;
                        const stopPct = aiEntry > 0 ? (alert.StopPrice - aiEntry) / aiEntry : -0.05;

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
                    console.error("[OpenAI] Failed to correct scanner prices:", e);
                }
            }

            return sanitizedResponse;

        } catch (e) {
            console.error("Failed to parse OpenAI scanner JSON:", content);
            throw new Error("Failed to parse OpenAI response as JSON");
        }

    } catch (error) {
        console.error('Error calling OpenAI API for scanner:', error);
        throw error;
    }
};

export const finalizeStrategyWithOpenAI = async (
    symbol: string,
    stockPrice: number,
    geminiAnalysis: any
): Promise<FinalizedStrategy> => {
    // 1. Get API Key
    const runtimeEnv = (typeof window !== 'undefined') ? (window as any).env : {};
    const apiKey = runtimeEnv?.VITE_OPENAI_API_KEY || (import.meta as any).env?.VITE_OPENAI_API_KEY || localStorage.getItem('openai_api_key');

    if (!apiKey) {
        return {
            outcome: "REJECTED",
            final_analysis: "Missing OpenAI API Key. Please add it in Settings.",
            approved_strategy: { action: "WAIT", contracts: "-", entry_zone: "-", stop_loss: "-", take_profit_1: "-", take_profit_2: "-", confidence: 0 },
            risk_assessment: "Authentication Failed"
        };
    }

    // 2. Construct Prompt
    const prompt = `
    You are the "Chief Risk Officer" for a trading firm.
    Review the following Trade Strategy proposed by a Junior Analyst (Gemini).

    Ticker: ${symbol}
    Current Price: $${stockPrice}
    
    Junior Analyst Proposal:
    ${JSON.stringify(geminiAnalysis, null, 2)}

    Your Job:
    1. Validate the logic. Does the technical setup match the proposed options strategy?
    2. Assess RISKS. What could go wrong? (e.g. Earnings, poor liquidity, counter-trend).
    3. Finalize the Plan. 
       - If GOOD: "APPROVED".
       - If RISKY but playable: "MODIFIED" (tighten stops, change strikes).
       - If BAD: "REJECTED" (Outcome = Wait).

    Output JSON ONLY (No Markdown):
    {
        "outcome": "APPROVED" | "REJECTED" | "MODIFIED",
        "final_analysis": "Your executive summary...",
        "approved_strategy": {
            "action": "BUY_CALL" | "BUY_PUT" | "WAIT",
            "contracts": "Specific Strike & Expiry (e.g. NVDA $150 Calls 21Feb)",
            "entry_zone": "$X.XX - $Y.YY",
            "stop_loss": "$X.XX",
            "take_profit_1": "$X.XX",
            "take_profit_2": "$X.XX",
            "confidence": 0-100
        },
        "risk_assessment": "Key risks..."
    }
    `;

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: "You are a JSON-only Chief Risk Officer." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.1, // Strict requirement
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || JSON.stringify(data);

        let result: FinalizedStrategy;
        try {
            result = (typeof content === 'string' ? JSON.parse(content) : content) as FinalizedStrategy;
        } catch (e) {
            const match = content.match(/```json\n([\s\S]*?)\n```/);
            if (match) {
                result = JSON.parse(match[1]);
            } else {
                throw new Error("Failed to parse JSON response");
            }
        }

        if (!result.approved_strategy) throw new Error("Missing approved_strategy in response");

        return result;

    } catch (error) {
        console.error("OpenAI Strategy Finalization Error:", error);

        const fallbackAction = geminiAnalysis?.generatedSignal?.signal === "BUY" ? "BUY_CALL" :
            geminiAnalysis?.generatedSignal?.signal === "SELL" ? "BUY_PUT" : "WAIT";

        return {
            outcome: "APPROVED",
            final_analysis: `(OpenAI Risk Officer Offline - Using Gemini 3.0 Pro Strategy). Error: ${error instanceof Error ? error.message : "Unknown Error"}`,
            approved_strategy: {
                action: fallbackAction,
                contracts: geminiAnalysis?.strategy || "See Analysis",
                entry_zone: geminiAnalysis?.tradeSetup?.entry || "N/A",
                stop_loss: geminiAnalysis?.tradeSetup?.stopLoss || "N/A",
                take_profit_1: geminiAnalysis?.tradeSetup?.target || "N/A",
                take_profit_2: "-",
                confidence: geminiAnalysis?.generatedSignal?.confidence || 0
            },
            risk_assessment: "Risk Assessment Unavailable (System Failure). Proceed with Gemini Strategy with caution."
        };
    }
};

export const sendChatMessageToOpenAI = async (
    message: string,
    chatHistory: any[],
    context: any
): Promise<string> => {
    const runtimeEnv = (typeof window !== 'undefined') ? (window as any).env : {};
    const apiKey = runtimeEnv?.VITE_OPENAI_API_KEY || (import.meta as any).env?.VITE_OPENAI_API_KEY || localStorage.getItem('openai_api_key');

    if (!apiKey) {
        return "I'm missing my OpenAI API Key. Please add it in the Settings tab.";
    }

    const messages = chatHistory.map((msg: any) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
    }));

    const systemContent = `
    You are an expert AI Options Trading Assistant.
    You help users analyze stock/options setups.
    
    Context:
    Ticker: ${context.ticker}
    Current Price: ${context.currentPrice || 'Unknown'}
    
    Technical Analysis Context (from Gemini):
    ${JSON.stringify(context.geminiAnalysis || {}, null, 2)}
    
    Your Goal:
    Answer the user's questions accurately using the provided context.
    Be concise, professional, and risk-aware.
    Do NOT give financial advice. Always frame it as "educational analysis" or "technical observation".
    `;

    const inputPayload = [
        { role: "system", content: systemContent },
        ...messages
    ];

    inputPayload.push({ role: "user", content: message });


    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: inputPayload,
                temperature: 0.2,
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "No response generated.";

        return content;

    } catch (error) {
        console.error("OpenAI Chat Error:", error);
        return `Error connecting to OpenAI: ${error instanceof Error ? error.message : "Unknown Error"}`;
    }
};
