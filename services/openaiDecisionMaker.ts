import { UnusualTradeCandidate } from '../core/unusualOptionsRules';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export interface AIAnalysisResult {
    top_picks: {
        contract: string;
        why_unusual: string;
        directional_bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
        liquidity_ok: boolean;
        top_risks: string[];
        invalid_if: string;
    }[];
}

export const analyzeUnusualActivity = async (candidates: UnusualTradeCandidate[]): Promise<AIAnalysisResult | null> => {
    // 1. Get Key
    const apiKey = (import.meta as any).env?.VITE_OPENAI_API_KEY || localStorage.getItem('openai_api_key');

    if (!apiKey) {
        console.warn("OpenAI Key Missing");
        return null;
    }

    if (candidates.length === 0) return null;

    // PROPRIETARY FLOW ANALYSIS LOGIC REDACTED
    // The real engine ranks candidates based on Vol/OI ratio, Intent, and Momentum.

    console.log("Analyzing Unusual Activity (Showcase Mode)");

    // Return a dummy result or null
    return {
        top_picks: candidates.slice(0, 3).map(c => ({
            contract: c.contract,
            why_unusual: "High volume relative to OI (Showcase Sample)",
            directional_bias: c.intent.includes("BULL") ? "BULLISH" : "BEARISH",
            liquidity_ok: true,
            top_risks: ["Volatility", "Theta Decay"],
            invalid_if: "Price rejects reversal zone"
        }))
    };
};
