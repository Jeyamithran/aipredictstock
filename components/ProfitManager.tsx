import React, { useState, useEffect, useRef } from 'react';
import { PlayCircle, StopCircle, AlertTriangle, TrendingUp, Shield, Activity, Volume2, VolumeX, Target, DollarSign, Sparkles } from 'lucide-react';
import { generateExitStrategy } from '../services/geminiService';
import { fetchContractTrades, analyzeInstitutionalIntent } from '../services/polygonService';
import { ChatContext } from '../types';

interface ProfitManagerProps {
    entryPrice: number;
    currentPrice: number; // Controlled by parent
    contracts: number;
    ticker: string; // Underlying (SPY)
    contractName: string;
    optionTicker?: string; // The specific polygon ID (O:SPY...)
    changePercent: number;
    onClosePosition: () => void;
    onChat?: (context: ChatContext) => void;
}

export const ProfitManager: React.FC<ProfitManagerProps> = ({
    entryPrice,
    currentPrice,
    contracts: initialContracts,
    ticker,
    contractName,
    optionTicker,
    changePercent,
    onClosePosition,
    onChat
}) => {
    // Internal state for position management
    const [contracts, setContracts] = useState(initialContracts);
    const [realizedPnL, setRealizedPnL] = useState(0);
    const [stopLoss, setStopLoss] = useState(entryPrice * 0.8);
    const [isMuted, setIsMuted] = useState(false);

    // Sync state if props change (Backup to the key prop)
    useEffect(() => {
        setContracts(initialContracts);
        setStopLoss(entryPrice * 0.8);
    }, [initialContracts, entryPrice]);

    // AI State
    const [aiAdvice, setAiAdvice] = useState<{
        action: 'SELL_ALL' | 'SELL_PARTIAL' | 'HOLD';
        quantityToSell: number;
        reasoning: string;
        newStopLoss?: number;
    } | null>(null);
    const [loadingAi, setLoadingAi] = useState(false);

    // Trigger Refs (Prevents spamming the AI)
    const hasTriggered20 = useRef(false);
    const hasTriggered50 = useRef(false);
    const hasTriggeredSmartStop = useRef(false);
    const hasTriggeredHardStop = useRef(false);

    // Calculated Stats
    const unrealizedPnL = (currentPrice - entryPrice) * contracts * 100;
    const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
    const totalPnL = realizedPnL + unrealizedPnL;

    // --- AUDIO SYSTEM ---
    const speak = (text: string) => {
        if (isMuted || !('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        // Optimization: Get voices once, or rely on default to prevent lag
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
    };

    // --- TRIGGER LOGIC ---
    useEffect(() => {
        const checkTriggers = async () => {
            if (loadingAi || contracts <= 0) return;

            let triggerHit = false;
            let contextOverride = null;

            // 1. HARD STOP (-30%) - Pure Math, No AI
            if (pnlPercent <= -30 && !hasTriggeredHardStop.current) {
                hasTriggeredHardStop.current = true;
                speak("Danger. Hard Stop Hit. Selling All.");

                setAiAdvice({
                    action: 'SELL_ALL',
                    quantityToSell: contracts,
                    reasoning: "🛡️ HARD STOP (-30%) Triggered. Capital Preservation Protocol.",
                    newStopLoss: 0
                });
                return; // Stop processing other triggers
            }

            // 2. SMART STOP (-10%) - The Whale Check
            if (pnlPercent <= -10 && !hasTriggeredSmartStop.current && pnlPercent > -30) {
                hasTriggeredSmartStop.current = true;
                triggerHit = true;
                speak("Warning. Smart Stop Triggered. Checking Whale Flow.");

                let intent = {
                    aggressionScore: 0.5,
                    isHedge: false,
                    flowType: 'RETAIL',
                    whaleConfidence: 'LOW'
                };

                // CRITICAL FIX: Only fetch if we have a real Option Ticker
                // Attempting to fetch 'SPY' trades will destroy logic.
                if (optionTicker && optionTicker.startsWith('O:')) {
                    try {
                        const recentTrades = await fetchContractTrades(optionTicker);
                        intent = analyzeInstitutionalIntent(
                            recentTrades,
                            // Use simple trend logic or pass trend prop. Here we assume bearish if losing money.
                            'BEARISH',
                            contractName.toLowerCase().includes('call') ? 'call' : 'put'
                        ) as any;
                    } catch (err) {
                        console.error("Failed to fetch whale data", err);
                    }
                } else {
                    console.log("Simulating Whale Data (No Real Ticker Available)");
                }

                contextOverride = {
                    rsi: 30, // Simulated Oversold
                    tapeAggression: intent.aggressionScore > 0.6 ? "High Buying (Dip Buy)" : "Heavy Selling (Exit)",
                    whaleStatus: intent.flowType === 'BLOCK' ? "Passive" : "Aggressive Sweep",
                    isHedge: intent.isHedge
                };
            }

            // 3. PROFIT TARGETS
            if (pnlPercent >= 20 && !hasTriggered20.current) {
                hasTriggered20.current = true;
                triggerHit = true;
                speak("Target Hit. Plus twenty percent.");
            }

            if (pnlPercent >= 50 && !hasTriggered50.current) {
                hasTriggered50.current = true;
                triggerHit = true;
                speak("Boom. Plus fifty percent. Major target.");
            }

            // EXECUTE AI ANALYSIS
            if (triggerHit) {
                setLoadingAi(true);
                const defaultContext = {
                    rsi: pnlPercent > 0 ? 75 : 40,
                    resistanceDist: "0.05",
                    tapeAggression: pnlPercent > 0 ? "High Buying" : "Mixed"
                };

                try {
                    const advice = await generateExitStrategy(
                        { entryPrice, currentPrice, contracts, pnlPercent },
                        contextOverride || defaultContext
                    );
                    setAiAdvice(advice);
                } catch (e) {
                    console.error("AI Error", e);
                } finally {
                    setLoadingAi(false);
                }
            }
        };

        checkTriggers();
    }, [pnlPercent, contracts, entryPrice, currentPrice, optionTicker, contractName]);

    const handleSell = (quantity: number) => {
        const portionPnL = (currentPrice - entryPrice) * quantity * 100;
        const portionPnLPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

        setRealizedPnL(prev => prev + portionPnL);

        // LOGGING
        const logEntry = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            ticker: ticker,
            contractName: contractName,
            quantity: quantity,
            entryPrice: entryPrice,
            exitPrice: currentPrice,
            pnlPercent: portionPnLPercent,
            pnlAmount: portionPnL,
            result: portionPnLPercent > 0 ? 'WIN' : portionPnLPercent < 0 ? 'LOSS' : 'BE',
            reason: aiAdvice?.reasoning || "Manual Action"
        };

        const existingLog = JSON.parse(localStorage.getItem('trade_journal') || '[]');
        localStorage.setItem('trade_journal', JSON.stringify([...existingLog, logEntry]));

        if (quantity >= contracts) {
            setContracts(0);
            onClosePosition();
        } else {
            setContracts(prev => prev - quantity);
            if (aiAdvice?.action === 'SELL_PARTIAL') setAiAdvice(null); // Clear advice after taking it
        }
    };

    if (contracts <= 0) return null; // Or return summary view

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="bg-neutral-800/50 p-4 flex justify-between items-center border-b border-neutral-700">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg"><Target className="w-5 h-5 text-purple-400" /></div>
                    <div>
                        <h3 className="text-sm font-bold text-white">Active Position</h3>
                        <p className="text-xs text-gray-500">{contractName} {optionTicker?.startsWith('O:') ? '(REAL DATA)' : '(SIM)'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {onChat && (
                        <button
                            onClick={() => onChat({
                                ticker: ticker,
                                currentPrice: currentPrice,
                                changePercent: changePercent,
                                analysis: aiAdvice?.reasoning || "Active Position Management",
                                strategy: contractName,
                                tradeSetup: {
                                    entry: entryPrice.toFixed(2),
                                    target: (entryPrice * 1.2).toFixed(2),
                                    stopLoss: (entryPrice * 0.8).toFixed(2)
                                }
                            })}
                            className="text-gray-400 hover:text-indigo-400"
                            title="Ask AI Manager"
                        >
                            <Sparkles size={16} />
                        </button>
                    )}
                    <button onClick={() => setIsMuted(!isMuted)} className="text-gray-400 hover:text-white">
                        {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                    <div className={`px-3 py-1 rounded font-mono font-bold ${pnlPercent >= 0 ? 'text-emerald-400 bg-emerald-900/20' : 'text-rose-400 bg-rose-900/20'}`}>
                        {pnlPercent > 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                    </div>
                </div>
            </div>

            {/* Main PnL */}
            <div className="p-6 text-center">
                <div className="text-sm text-gray-400">Unrealized P&L</div>
                <div className={`text-4xl font-mono font-bold my-2 ${pnlPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500 flex justify-center gap-4">
                    <span>Entry: ${entryPrice.toFixed(2)}</span>
                    <span>Current: ${currentPrice.toFixed(2)}</span>
                </div>
            </div>

            {/* AI Section */}
            {(aiAdvice || loadingAi) && (
                <div className="px-6 pb-6">
                    <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-4">
                        {loadingAi ? (
                            <div className="flex items-center gap-2 text-indigo-300"><Activity className="animate-spin w-4 h-4" /> Analyzing Whale Flow...</div>
                        ) : (
                            <>
                                <div className="font-bold text-white mb-1">{aiAdvice?.action.replace('_', ' ')}</div>
                                <p className="text-sm text-indigo-200 mb-3">{aiAdvice?.reasoning}</p>
                                <div className="flex gap-2">
                                    {aiAdvice?.action !== 'HOLD' && (
                                        <button onClick={() => handleSell(aiAdvice!.quantityToSell)} className="flex-1 bg-indigo-600 hover:bg-indigo-500 py-2 rounded text-white text-sm font-bold">
                                            Execute Sell
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Controls */}
            <div className="p-4 grid grid-cols-2 gap-3 border-t border-neutral-800">
                <button onClick={() => handleSell(Math.ceil(contracts / 2))} className="bg-neutral-800 py-2 rounded text-sm hover:bg-neutral-700">Sell 50%</button>
                <button onClick={() => handleSell(contracts)} className="bg-rose-900/20 text-rose-400 py-2 rounded text-sm hover:bg-rose-900/40">Close All</button>
            </div>
        </div>
    );
};
