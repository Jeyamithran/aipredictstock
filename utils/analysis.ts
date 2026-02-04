// types/sentiment.ts (Optional: define your types clearly)
export type SentimentLabel =
    | 'STRONG_BULLISH'
    | 'BULLISH'
    | 'NEUTRAL'
    | 'BEARISH'
    | 'STRONG_BEARISH'
    | 'REVERSAL_RISK_HIGH' // Contrarian signal (Too many calls)
    | 'REVERSAL_RISK_LOW'; // Contrarian signal (Too many puts)

/**
 * Calculates sentiment based on Put/Call Ratio and total Volume.
 * @param totalPutVol - Total volume of put options
 * @param totalCallVol - Total volume of call options
 * @param minVolumeThreshold - Minimum volume required to trust the signal (default 500)
 */
export function calculateSmartSentiment(
    totalPutVol: number,
    totalCallVol: number,
    minVolumeThreshold: number = 500
): { pcr: number; sentiment: SentimentLabel } {

    const totalVolume = totalPutVol + totalCallVol;

    // 1. Safety Check: If volume is zero or very low, data is noisy. Default to Neutral.
    if (totalCallVol === 0 || totalVolume < minVolumeThreshold) {
        return {
            pcr: totalCallVol > 0 ? Number((totalPutVol / totalCallVol).toFixed(2)) : 1.0,
            sentiment: 'NEUTRAL'
        };
    }

    // 2. Calculate PCR
    const rawPcr = totalPutVol / totalCallVol;
    const pcr = Number(rawPcr.toFixed(2)); // Round to 2 decimals for UI

    let sentiment: SentimentLabel = 'NEUTRAL';

    // 3. Advanced Logic Ladder
    if (pcr >= 1.50) {
        // Extreme fear. Everyone is buying puts. Market might be oversold and bounce up.
        sentiment = 'REVERSAL_RISK_LOW';
    }
    else if (pcr >= 1.10) {
        sentiment = 'STRONG_BEARISH';
    }
    else if (pcr > 0.90) {
        // 0.90 to 1.10 is effectively the transition zone
        sentiment = 'BEARISH';
    }
    else if (pcr >= 0.70 && pcr <= 0.90) {
        // The "Standard" Neutral Zone for stocks (which naturally have a slight Call bias)
        sentiment = 'NEUTRAL';
    }
    else if (pcr >= 0.50) {
        // 0.50 to 0.70 is the healthy Bullish zone
        sentiment = 'BULLISH';
    }
    else {
        // PCR < 0.50: Extreme greed. Everyone is buying calls. Market is likely overextended.
        sentiment = 'REVERSAL_RISK_HIGH';
    }

    return { pcr, sentiment };
}
