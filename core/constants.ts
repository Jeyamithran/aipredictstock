export const UNUSUAL_WHALES_UNIVERSE = [
    // Tech / High Vol
    "SPY", "QQQ", "IWM", "AAPL", "MSFT", "NVDA", "AMD", "TSLA", "AMZN", "GOOGL", "META", "NFLX",
    // Semi / AI
    "SMCI", "AVGO", "MU", "ARM", "INTC", "TSM",
    // Crypto
    "COIN", "MSTR", "MARA",
    // Growth / Meme-ish but liquid
    "PLTR", "SOFI", "HOOD", "RIVN", "DKNG",
    // Financials
    "JPM", "BAC", "GS", "V", "MA",
    // Retail
    "WMT", "TGT", "COST",
    // Energy
    "XOM", "CVX",
    // Industrial
    "BA", "CAT",
    // Pharma
    "LLY", "NVO"
];

// Heuristic Constants
export const UNUSUAL_CONSTANTS = {
    // Universe
    MIN_PRICE: 10.00,

    // Liquidity Gates
    MAX_SPREAD_PCT: 0.08, // 8%
    MIN_TRADE_SIZE: 10, // Lowered to capture retail flow too
    MIN_PREMIUM_USD: 2000, // Lowered drastically to let UI filters decide visibility
    MIN_VOLUME_TODAY: 5,
    MIN_OI: 10,

    // Scoring Multipliers
    SCORE_BOOST_AT_ASK: 15,
    SCORE_BOOST_SWEEP: 20,
    SCORE_BOOST_HIGH_VOL_OI: 10,

    // Risk Flags
    DTE_NEAR_TERM: 14,
    DTE_0DTE: 0
};
