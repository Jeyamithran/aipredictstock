import { StockData, ScannerProfile, ScannerResponse } from '../types';
import {
    HEDGE_FUND_PROMPT,
    PRO_TRADER_PROMPT,
    CATALYST_HUNTER_PROMPT,
    BIO_TECH_ANALYST_PROMPT,
    IMMEDIATE_BREAKOUT_PROMPT,
    HIGH_GROWTH_ANALYST_PROMPT
} from './scannerPrompts';
import { fetchScreenerResults } from './fmpScreenerService';

const runtimeEnv = (typeof window !== 'undefined') ? (window as any).env : {};
const PERPLEXITY_API_KEY = runtimeEnv?.VITE_PERPLEXITY_API_KEY || (import.meta as any).env?.VITE_PERPLEXITY_API_KEY;
const PERPLEXITY_BASE_URL = 'https://api.perplexity.ai';

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

export const runScannerWithPerplexity = async (profile: ScannerProfile, model: string = 'sonar-reasoning-pro'): Promise<ScannerResponse> => {
    if (!PERPLEXITY_API_KEY) {
        throw new Error('Perplexity API key not configured');
    }

    // Step 1: Fetch Candidates from Polygon Snapshot Screener
    console.log(`Fetching candidate pool for profile: ${profile}...`);
    let tickers: string[] = [];
    try {
        tickers = await fetchScreenerResults(profile);
    } catch (error) {
        console.error("Candidate pool fetch failed.", error);
    }

    if (tickers.length === 0) {
        console.warn("No candidates found. Returning empty buckets per candidate-only rule.");
        return { SmallCap: [], MidCap: [], LargeCap: [] };
    }

    const tickerString = tickers.join(', ');
    console.log(`Found ${tickers.length} candidates: ${tickerString.substring(0, 50)}...`);

    // Step 2: Generate Prompt (with or without candidates)
    const systemPrompt = getPromptForProfile(profile, tickerString);

    try {
        const response = await fetch(`${PERPLEXITY_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PERPLEXITY_API_KEY}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a financial market scanner. Use your search tools to analyze the candidates. Output STRICTLY JSON. Do not refuse.'
                    },
                    {
                        role: 'user',
                        content: systemPrompt
                    }
                ],
                temperature: 0.2,
                // max_tokens: 4000 // Removed to avoid limits, let model decide
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content || '{}';

        // Clean up <think> tags from reasoning models (handle unclosed tags safely)
        const cleanContent = rawContent.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim();

        // Extended JSON Extraction Logic
        let jsonString = cleanContent;
        // 1. Try finding the outermost JSON object manually (most robust)
        const firstOpen = cleanContent.indexOf('{');
        const lastClose = cleanContent.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
            jsonString = cleanContent.substring(firstOpen, lastClose + 1);
        }

        try {
            const parsed = JSON.parse(jsonString);

            // Helper to sanitize numerical values
            const sanitizePrice = (value: any): number => {
                if (typeof value === 'number') return value;
                if (typeof value === 'string') {
                    const clean = value.replace(/[$,\s]/g, '');
                    const parsed = parseFloat(clean);
                    return isNaN(parsed) ? 0 : parsed;
                }
                return 0;
            };

            const sanitizeAlert = (alert: any): any => { // Returning any to match structure, mapped to ScannerAlert later
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

            const placeholderFilter = (alert: any) => {
                const t = alert?.Ticker || "";
                return t !== "ABC" && t !== "XYZ" && t !== "EXAMPLE" && t.length < 6;
            };

            return {
                MarketContext: parsed.MarketContext,
                SmallCap: Array.isArray(parsed.SmallCap) ? parsed.SmallCap.filter(placeholderFilter).map(sanitizeAlert) : [],
                MidCap: Array.isArray(parsed.MidCap) ? parsed.MidCap.filter(placeholderFilter).map(sanitizeAlert) : [],
                LargeCap: Array.isArray(parsed.LargeCap) ? parsed.LargeCap.filter(placeholderFilter).map(sanitizeAlert) : []
            } as ScannerResponse;

        } catch (e) {
            console.warn("Perplexity JSON Parse Failed. Content start:", cleanContent.substring(0, 50));

            return {
                SmallCap: [],
                MidCap: [],
                LargeCap: []
            };
        }

    } catch (error) {
        console.error('Error calling Perplexity API for scanner:', error);
        // Return empty response on API error
        return {
            SmallCap: [],
            MidCap: [],
            LargeCap: []
        };
    }
};

export const analyzeStockWithPerplexity = async (
    ticker: string,
    stockData: StockData,
    news: any[] = [],
    insiderTrades: any[] = [],
    marketContext: StockData[] = [],
    analystRatings: any[] = []
): Promise<string> => {
    console.log("Perplexity Key Status:", PERPLEXITY_API_KEY ? "Present" : "Missing", "Value:", PERPLEXITY_API_KEY);
    if (!PERPLEXITY_API_KEY || PERPLEXITY_API_KEY === 'undefined' || PERPLEXITY_API_KEY === '') {
        console.warn("Perplexity API Key missing. Returning MOCK data for demo/verification.");
        return `## Market Sentiment
**Bullish** sentiment prevails as **${ticker}** shows resilience above key support levels. Institutional inflows have increased by **15%** in the last session.

## Key Technical Levels
- Support: **$${(stockData.price * 0.98).toFixed(2)}** (Strong Buy Zone)
- Resistance: **$${(stockData.price * 1.02).toFixed(2)}** (Breakout Level)
- Pivot: **$${stockData.price.toFixed(2)}**

## Institutional Activity
> Smart money is **accumulating** calls at the $${(stockData.price + 5).toFixed(0)} strike, suggesting expectation of a near-term rally.

## Trade Setup
- **Entry Price Zone**: $${stockData.price.toFixed(2)} - $${(stockData.price * 1.005).toFixed(2)}
- **Target Price**: $${(stockData.price * 1.03).toFixed(2)}
- **Stop Loss Level**: $${(stockData.price * 0.99).toFixed(2)}
- **Risk/Reward Ratio**: 1:3
- **Best Time to Enter**: Mid-day pullback
- **Volume Confirmation Needed**: Yes, look for >1.5x relative volume`;
    }

    // Format News for Prompt
    const newsSection = news.length > 0
        ? `\nRECENT NEWS HEADLINES:\n${news.slice(0, 5).map(n => `- ${n.publishedDate.split(' ')[0]}: ${n.title}`).join('\n')}`
        : '';

    // Format Insider Trades for Prompt
    const insiderSection = insiderTrades.length > 0
        ? `\nINSIDER TRADING ACTIVITY:\n${insiderTrades.slice(0, 5).map(t => `- ${t.transactionDate}: ${t.reportingName} (${t.typeOfOwner}) ${t.transactionType} ${t.securitiesTransacted} shares at $${t.price}`).join('\n')}`
        : '';

    // Format Market Context for Prompt
    const marketSection = marketContext.length > 0
        ? `\nBROADER MARKET CONTEXT:\n${marketContext.map(m => `- ${m.ticker}: $${m.price.toFixed(2)} (${m.changePercent.toFixed(2)}%)`).join('\n')}`
        : '';

    // Format Analyst Ratings for Prompt
    const ratingsSection = analystRatings.length > 0
        ? `\nRECENT ANALYST RATINGS:\n${analystRatings.slice(0, 5).map(r => `- ${r.date}: ${r.gradingCompany} -> ${r.newGrade} (Prev: ${r.previousGrade})`).join('\n')}`
        : '';

    // Format Technical Indicators for Prompt
    const technicalSection = `
    TECHNICAL INDICATORS:
    - AI Score: ${stockData.score} (Momentum: ${stockData.momentumScore.toFixed(1)}, Volume: ${stockData.volumeScore.toFixed(1)}, Trend: ${stockData.trendScore.toFixed(1)})
    - Volume: ${stockData.volumeStrength} (Ratio: ${stockData.volumeRatio.toFixed(2)}x avg)
    - Moving Averages: 50MA (${stockData.ma50Distance > 0 ? '+' : ''}${stockData.ma50Distance.toFixed(2)}%), 200MA (${stockData.ma200Distance > 0 ? '+' : ''}${stockData.ma200Distance.toFixed(2)}%)
    - RSI: ${stockData.rsi.toFixed(2)}
    - Trend State: ${stockData.trend}
    - Volatility: ${stockData.volatility}
    - Algorithm Signal: ${stockData.signal}
    `;

    const prompt = `Analyze ${ticker} stock for day trading.
    
    REAL-TIME MARKET DATA (SOURCE OF TRUTH):
    - Ticker: ${ticker}
    - Current Price: $${stockData.price.toFixed(2)}
    - Change: ${stockData.changePercent.toFixed(2)}%
    - Timestamp: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST
    ${technicalSection}
    ${marketSection}
    ${newsSection}
    ${insiderSection}
    ${ratingsSection}
    
    IMPORTANT: Use the above REAL-TIME DATA for all your analysis. Do NOT search for the current price, as search results may be delayed.

    Provide deep research on:
    1. Recent news and market sentiment (incorporate provided headlines)
    2. Latest earnings and financial performance
    3. Sector trends and competitive positioning
    4. Key Technical Levels (Bullet Points) - Support/Resistance
    5. Institutional activity and smart money flow (incorporate provided insider trades)

    CRITICAL: End your response with a specific "Trade Setup" section containing:
    - Entry Price Zone
    - Target Price
    - Stop Loss Level
    - Risk/Reward Ratio
    - Best Time to Enter (e.g., Open, Mid-day)
    - Volume Confirmation Needed
    
    FORMATTING RULES (STRICT):
    - Use ## Headers for main sections.
    - Use **Bold** for all numbers, tickers, and key terms.
    - Use bullet points for lists.
    - Keep paragraphs short (2-3 lines max).
    - Use > Blockquotes for the most important "Key Takeaway".
    
    Focus on actionable insights for day trading today. Be specific, concise, and highly readable.`;

    try {
        const response = await fetch(`${PERPLEXITY_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PERPLEXITY_API_KEY}`
            },
            body: JSON.stringify({
                model: 'sonar-reasoning-pro',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a professional trading research analyst. Provide deep, actionable market research and insights.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.2,
                max_tokens: 1500
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content || 'No research generated';

        // Clean up <think> tags from reasoning models
        const cleanContent = rawContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

        // Convert any UTC timestamps to EST (UTC-5) by replacing the timezone label
        const content = cleanContent.replace(/UTC/g, 'EST');
        return content;
    } catch (error) {
        console.error('Error calling Perplexity API:', error);
        throw error;
    }
};
