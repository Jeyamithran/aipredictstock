import React, { useState, useEffect, useRef } from 'react';
import { StockData } from '../types';
import { getFMPQuotes } from '../services/fmpService';
import { ArrowUp, ArrowDown, Activity, Zap, Filter, Lock } from 'lucide-react';

interface SmartLevel2Props {
    ticker: string;
    currentPrice: number;
    onClose?: () => void;
}

interface TradeBlock {
    id: string;
    time: string;
    side: 'BUY' | 'SELL';
    price: number;
    size: number;
    value: number;
    impact: 'HIGH' | 'MED' | 'LOW';
    timestamp: number;
    type?: string;
}

export const SmartLevel2: React.FC<SmartLevel2Props> = ({ ticker, currentPrice }) => {
    const [trades, setTrades] = useState<TradeBlock[]>([]);
    const [lastVolume, setLastVolume] = useState<number>(0);
    const [lastPrice, setLastPrice] = useState<number>(currentPrice);
    const [polling, setPolling] = useState(true);
    const [threshold, setThreshold] = useState<number>(50000); // $50k min value
    const [error, setError] = useState<string | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);

    // Initial load to get baseline volume
    useEffect(() => {
        const init = async () => {
            try {
                const quotes = await getFMPQuotes([ticker]);
                if (quotes.length > 0) {
                    setLastVolume(quotes[0].volume);
                    setLastPrice(quotes[0].price);
                }
            } catch (e) {
                console.error("Failed to init L2", e);
                setError("Failed to connect to exchange.");
            }
        };
        init();
        setTrades([]); // Reset trades on ticker change
    }, [ticker]);

    // Polling Logic
    useEffect(() => {
        if (!polling) return;

        const interval = setInterval(async () => {
            try {
                const quotes = await getFMPQuotes([ticker]);
                if (quotes.length === 0) return;

                const quote = quotes[0];
                const newVol = quote.volume;
                const newPrice = quote.price;

                // Calculate Delta
                if (lastVolume > 0 && newVol > lastVolume) {
                    const deltaVol = newVol - lastVolume;
                    const tradeValue = deltaVol * newPrice;

                    // Infer Side
                    // If price went up or stayed same at high -> BUY
                    // If price went down -> SELL
                    // This is a heuristic since we don't have tick direction
                    let side: 'BUY' | 'SELL' = 'BUY';
                    if (newPrice < lastPrice) side = 'SELL';
                    else if (newPrice > lastPrice) side = 'BUY';
                    else side = Math.random() > 0.5 ? 'BUY' : 'SELL'; // Neutral, random for visual if no price change

                    // Determine Type & Impact
                    let impact: 'HIGH' | 'MED' | 'LOW' = 'LOW';
                    let type = 'Retail Agg';

                    if (tradeValue >= threshold) {
                        impact = tradeValue > 1000000 ? 'HIGH' : tradeValue > 250000 ? 'MED' : 'LOW';
                        type = 'Block Trade';
                    } else {
                        // For small trades, we still show them but marked as Retail Agg
                        type = 'Retail Agg';
                        impact = 'LOW';
                    }

                    const newBlock: TradeBlock = {
                        id: crypto.randomUUID(),
                        time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                        side,
                        price: newPrice,
                        size: deltaVol,
                        value: tradeValue,
                        impact,
                        timestamp: Date.now(),
                        type // Add type to state
                    };

                    setTrades(prev => [newBlock, ...prev].slice(0, 50)); // Keep last 50
                }

                setLastVolume(newVol);
                setLastPrice(newPrice);
                setError(null);

            } catch (e: any) {
                // Silent fail on rate limits, just skip this tick
                if (e.message?.includes("Limit")) {
                    // do nothing
                } else {
                    // console.warn("L2 Poll Error", e);
                }
            }
        }, 3000); // Poll every 3 seconds

        return () => clearInterval(interval);
    }, [ticker, lastVolume, lastPrice, polling, threshold]);

    return (
        <div className="h-[500px] w-full bg-[#0a0a0a] rounded-lg border border-neutral-800 flex flex-col overflow-hidden relative">
            {/* Header */}
            <div className="p-3 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50">
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-purple-500" />
                    <h3 className="text-sm font-bold text-gray-200">Smart Level 2 <span className="text-xs font-normal text-gray-500 ml-1">(Live Flow)</span></h3>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-neutral-800 rounded px-2 py-1">
                        <Filter className="w-3 h-3 text-gray-500" />
                        <select
                            value={threshold}
                            onChange={(e) => setThreshold(Number(e.target.value))}
                            className="bg-transparent text-[10px] text-gray-300 focus:outline-none"
                        >
                            <option value={10000}>&gt; $10k</option>
                            <option value={50000}>&gt; $50k</option>
                            <option value={100000}>&gt; $100k</option>
                            <option value={500000}>&gt; $500k</option>
                            <option value={1000000}>&gt; $1M (Whale)</option>
                        </select>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${polling ? 'bg-emerald-500 animate-pulse' : 'bg-gray-500'}`} />
                </div>
            </div>

            {/* Column Headers */}
            <div className="grid grid-cols-5 gap-2 px-4 py-2 text-[10px] font-bold text-gray-500 uppercase border-b border-neutral-800/50 bg-neutral-900/20">
                <div>Time</div>
                <div>Side</div>
                <div className="text-right">Price</div>
                <div className="text-right">Size</div>
                <div className="text-right">Value</div>
            </div>

            {/* Feed */}
            <div className="flex-1 overflow-y-auto custom-scrollbar relative" ref={scrollRef}>
                {trades.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 opacity-50">
                        <Activity className="w-8 h-8 mb-2" />
                        <p className="text-xs">Waiting for significant trades...</p>
                        <p className="text-[10px] mt-1">Polling live market data</p>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {trades.map((trade) => (
                            <div
                                key={trade.id}
                                className={`grid grid-cols-5 gap-2 px-4 py-2 text-xs border-b border-neutral-800/30 animate-in slide-in-from-top-2 duration-300 ${trade.impact === 'HIGH' ? 'bg-purple-900/10' :
                                        trade.type === 'Retail Agg' ? 'opacity-60' : ''
                                    }`}
                            >
                                <div className="flex flex-col">
                                    <span className="text-gray-400 font-mono">{trade.time}</span>
                                    <span className="text-[9px] text-gray-600 uppercase">{trade.type || 'Block'}</span>
                                </div>
                                <div className="flex items-center">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${trade.side === 'BUY'
                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                        }`}>
                                        {trade.side}
                                    </span>
                                </div>
                                <div className="text-right font-mono text-gray-300">${trade.price.toFixed(2)}</div>
                                <div className="text-right font-mono text-gray-400">{trade.size.toLocaleString()}</div>
                                <div className={`text-right font-mono font-medium ${trade.impact === 'HIGH' ? 'text-purple-400' :
                                    trade.impact === 'MED' ? 'text-blue-400' : 'text-gray-500'
                                    }`}>
                                    ${(trade.value / 1000).toFixed(1)}k
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer / Legend */}
            <div className="p-2 border-t border-neutral-800 bg-neutral-900/30 flex justify-between items-center text-[10px] text-gray-500">
                <div className="flex gap-3">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span> Whale (&gt;$1M)</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Large (&gt;$250k)</span>
                </div>
                <div>
                    Simulated L2 via FMP Delta
                </div>
            </div>
        </div>
    );
};
