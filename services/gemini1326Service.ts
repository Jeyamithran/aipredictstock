import { GoogleGenAI, Schema, Type } from "@google/genai";

// Define the shape of the payload expected by the "endpoint"
export interface ProgressionState {
  accountSize: number;
  riskPercent: number;
  baseUnit: number;
  multipliers: [number, number, number, number];
  currentLevelIndex: number;
  currentLevel: number; // 1-based
  currentSize: number;
  cyclePnL: number;
  totalPnL: number;
  completedCycles: number;
}

export interface TradeForAi {
  ts: string;
  level: number;
  size: number;
  result: "win" | "loss";
  pnlPercent: number | null;
  pnlAmount: number;
}

export interface MarketSnapshot {
  symbol?: string;
  lastPrice?: number;
  vix?: number;
  trend?: string;
  volatilityRegime?: string;
  session?: string;
  timeToExpiryMinutes?: number;
  extraNotes?: string;
}

export interface Gemini1326Payload {
  progressionState: ProgressionState;
  lastTrades: TradeForAi[];
  marketSnapshot?: MarketSnapshot;
}

// Define the response shape
export interface Gemini1326Response {
  message: string;
  action: {
    direction: "call" | "put" | "flat";
    use1326Step: "advance" | "stay" | "reset" | "pause";
    targetLevelIndex: number; // 0..3
    riskAdjustmentFactor: number;
    maxLossPercentForNextTrade: number;
    confidence: number; // 0..1
    timeHorizonMinutes: number;
  };
}

// Helper to get API key from environment
const getApiKey = () => {
  const runtimeEnv = (typeof window !== 'undefined') ? (window as any).env : {};
  return runtimeEnv?.VITE_GEMINI_API_KEY || (import.meta as any).env.VITE_GEMINI_API_KEY;
};

export const fetch1326Advice = async (payload: Gemini1326Payload): Promise<Gemini1326Response> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Gemini API Key not found");
  }

  const ai = new GoogleGenAI({ apiKey });

  const systemPrompt = `
You are ANTI-GRAVITY GEMINI, a professional SPY 0DTE trading assistant embedded in a live trading control panel.

Your user is an experienced intraday options trader who uses a disciplined 1–3–2–6 position sizing progression:

- Level 1: 1x base unit
- Level 2: 3x base unit
- Level 3: 2x base unit
- Level 4: 6x base unit

Base unit = accountSize * riskPercent / 100.
currentLevelIndex is 0-based (0..3). Level = currentLevelIndex+1.
currentSize = baseUnit * currentMultiplier.

RULES OF THE PROGRESSION (must NEVER be violated):
- Win:
  - If current level is 1–3, advance to the next level.
  - If current level is 4, mark the cycle as completed, reset to Level 1 and reset cyclePnL to 0.
- Loss:
  - Immediately reset to Level 1 and reset cyclePnL to 0.
- The system is ANTI-MARTINGALE: risk increases ONLY when the account is winning, NEVER after losses.
- You are NOT allowed to recommend any martingale doubling-after-loss behavior.

INPUT JSON:
${JSON.stringify(payload, null, 2)}

Your job:
1. Respect the 1–3–2–6 risk rules ALWAYS.
2. First decide whether the user should:
   - take the next trade or sit out (flat),
   - and if trading, whether the bias is CALL, PUT, or still FLAT.
3. Decide what to do with the progression:
   - "advance" (use standard next level),
   - "stay" (ignore progression and repeat current level),
   - "reset" (go back to Level 1 voluntarily even without a loss),
   - "pause" (no trade; preserve current level for later).
4. Keep max loss on a single 0DTE trade conservative; usually 20–35% of that trade’s premium.
5. Focus on:
   - trend alignment,
   - liquidity & volatility,
   - avoiding chop,
   - aligning trade duration with timeToExpiryMinutes,
   - keeping drawdown small relative to account size.

Constraints:
- NEVER claim certain profits or guaranteed outcomes.
- If market conditions are poor (chop, low R:R, or too close to expiry), recommend "flat" direction and "pause".
- If the user is on a losing streak or totalPnL is negative and drawdown is large, you should favor "reset" with reduced riskAdjustmentFactor (e.g. 0.5).
- If the user is on a strong winning streak, you may allow "advance" and riskAdjustmentFactor up to 1.2, but stay conservative.

Your tone must be concise and practical, like a professional prop firm risk manager talking to a skilled trader.
`;

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      message: { type: Type.STRING },
      action: {
        type: Type.OBJECT,
        properties: {
          direction: { type: Type.STRING, enum: ["call", "put", "flat"] },
          use1326Step: { type: Type.STRING, enum: ["advance", "stay", "reset", "pause"] },
          targetLevelIndex: { type: Type.INTEGER },
          riskAdjustmentFactor: { type: Type.NUMBER },
          maxLossPercentForNextTrade: { type: Type.NUMBER },
          confidence: { type: Type.NUMBER },
          timeHorizonMinutes: { type: Type.INTEGER }
        },
        required: [
          "direction",
          "use1326Step",
          "targetLevelIndex",
          "riskAdjustmentFactor",
          "maxLossPercentForNextTrade",
          "confidence",
          "timeHorizonMinutes"
        ]
      }
    },
    required: ["message", "action"]
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp', // Fast, good for logic
      contents: systemPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.1, // Low temp for strict rule adherence
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response from Gemini");
    }

    return JSON.parse(text) as Gemini1326Response;

  } catch (error) {
    console.error("Gemini 1-3-2-6 Service Error:", error);
    throw error;
  }
};
