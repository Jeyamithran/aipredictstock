import React, { useEffect, useState } from 'react';
import { WATCHLIST_TICKERS } from '../constants';
import { fetchOptionsChain, calculateOptionsFlow, OptionsFlowData } from '../services/polygonService';
import { getFMPQuotes } from '../services/fmpService';
import { TrendingUp, TrendingDown, Minus, Loader2, Activity } from 'lucide-react';

interface MarketPulseProps {
    onSelectTicker: (ticker: string) => void;
    selectedTicker: string;
}

interface TickerPulse {
    ticker: string;
    price: number;
    changePercent: number;
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'LOADING';
    pcr: number;
}

export const MarketPulse: React.FC<MarketPulseProps> = ({ onSelectTicker, selectedTicker }) => {
    const [pulses, setPulses] = useState<TickerPulse[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            try {
                // 1. Get Prices
                const quotes = await getFMPQuotes(WATCHLIST_TICKERS);

                // 2. Initialize Pulse Objects
                const initialPulses: TickerPulse[] = WATCHLIST_TICKERS.map(t => {
                    const q = quotes.find(q => q.ticker === t);
                    return {
                        ticker: t,
                        price: q?.price || 0,
                        changePercent: q?.changePercent || 0,
                        sentiment: 'LOADING',
                        pcr: 0
                    };
                });
                setPulses(initialPulses);

                // 3. Fetch Options Data for ALL tickers (Paid Plan Enabled)
                const updateSentiment = async (ticker: string) => {
                    try {
                        const chain = await fetchOptionsChain(ticker);
                        const flow = calculateOptionsFlow(chain);
                        setPulses(prev => prev.map(p =>
                            p.ticker === ticker ? { ...p, sentiment: flow.sentiment, pcr: flow.putCallRatio } : p
                        ));
                    } catch (e) {
                        setPulses(prev => prev.map(p =>
                            p.ticker === ticker ? { ...p, sentiment: 'NEUTRAL' } : p
                        ));
                    }
                };

                // Execute in parallel for maximum speed
                await Promise.all(WATCHLIST_TICKERS.map(ticker => updateSentiment(ticker)));

            } catch (e) {
                console.error("Pulse Init Error", e);
            } finally {
                setLoading(false);
            }
        };

        init();
    }, []);

    return (
        <div className="mb-6 overflow-x-auto pb-2">
            <div className="flex gap-3 min-w-max">
                {pulses.map((pulse) => (
                    <button
                        key={pulse.ticker}
                        onClick={() => onSelectTicker(pulse.ticker)}
                        className={`flex flex-col min-w-[140px] p-3 rounded-xl border transition-all ${selectedTicker === pulse.ticker
                            ? 'bg-neutral-800 border-purple-500 shadow-lg shadow-purple-900/20'
                            : 'bg-neutral-900/50 border-neutral-800 hover:bg-neutral-800/80'
                            }`}
                    >
                        <div className="flex justify-between items-start w-full mb-2">
                            <span className="font-bold text-white">{pulse.ticker}</span>
                            <span className={`text-xs font-mono ${pulse.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {pulse.changePercent > 0 ? '+' : ''}{pulse.changePercent.toFixed(2)}%
                            </span>
                        </div>

                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-1.5">
                                {pulse.sentiment === 'LOADING' ? (
                                    <Loader2 className="w-4 h-4 text-gray-600 animate-spin" />
                                ) : pulse.sentiment === 'BULLISH' ? (
                                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                                ) : pulse.sentiment === 'BEARISH' ? (
                                    <TrendingDown className="w-4 h-4 text-rose-500" />
                                ) : (
                                    <Minus className="w-4 h-4 text-gray-500" />
                                )}
                                <span className={`text-xs font-bold ${pulse.sentiment === 'BULLISH' ? 'text-emerald-500' :
                                    pulse.sentiment === 'BEARISH' ? 'text-rose-500' :
                                        'text-gray-500'
                                    }`}>
                                    {pulse.sentiment === 'LOADING' ? '...' : pulse.sentiment}
                                </span>
                            </div>
                            {pulse.sentiment !== 'LOADING' && (
                                <span className="text-[10px] text-gray-600 font-mono">PCR: {pulse.pcr.toFixed(2)}</span>
                            )}
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};
