import React, { useState, useEffect } from 'react';
import { fetchOptionsChain, calculateOptionsFlow, OptionsFlowData, getPolygonApiKey, filterPromisingContracts, OptionContract } from '../services/polygonService';
import { generateOptionStrategy } from '../services/geminiService';
import { StrategyCard } from './StrategyCard';
import { ProfitManager } from './ProfitManager';
import { TradeJournal } from './TradeJournal';
import { RefreshCcw, AlertTriangle, TrendingUp, TrendingDown, Activity, Lock } from 'lucide-react';

import { ChatContext } from '../types';
import { useOptionsStream } from '../hooks/useOptionsStream';

interface OptionsFlowProps {
    ticker: string;
    currentPrice: number;
    changePercent: number;
    trend: string;
    onChat?: (context: ChatContext) => void;
}

interface StrategyResult {
    recommendedContract: string;
    reasoning: string;
    confidence: number;
    maxProfit: string;
    maxLoss: string;
    action: 'BUY_CALL' | 'BUY_PUT' | 'WAIT';
    modelUsed?: string;
    suggestedEntry?: string;
}

interface SimulationConfig {
    price: string;
    contract: string;
    quantity: number;
    strategy: StrategyResult | null;
    availableContracts: { name: string; strike: number; ticker: string }[];
}

export const OptionsFlow: React.FC<OptionsFlowProps> = ({ ticker, currentPrice: initialPrice, changePercent, trend, onChat }) => {
    const [data, setData] = useState<OptionsFlowData | null>(null);
    const [fullChain, setFullChain] = useState<OptionContract[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [apiKey, setApiKey] = useState(getPolygonApiKey());

    // Strategy State
    const [strategy, setStrategy] = useState<StrategyResult | null>(null);
    const [strategyLoading, setStrategyLoading] = useState(false);

    // Live Flow Stream
    // Collect top tickers to subscribe
    const topContractTickers = data ? [...data.topCalls, ...data.topPuts].map(c => `T.${c.ticker}`) : [];
    const { messages: flowMessages, status: wsStatus } = useOptionsStream(topContractTickers);

    // Helper to get live volume
    const getLiveVolume = (contractTicker: string, initialVol: number) => {
        // Sum up NEW volume from stream
        const newVol = flowMessages
            .filter(m => m.sym === contractTicker)
            .reduce((acc, curr) => acc + (curr.s || 0), 0);
        return initialVol + newVol;
    };

    // Simulation State
    const [activePosition, setActivePosition] = useState<{
        entryPrice: number;
        contracts: number;
        contractName: string;
        optionTicker?: string;
        underlyingEntryPrice: number; // Lock stock price at entry
    } | null>(null);

    // Simulation Modal State
    const [showSimulationModal, setShowSimulationModal] = useState(false);
    const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>({
        price: '',
        contract: '',
        quantity: 10,
        strategy: null,
        availableContracts: []
    });

    const loadData = async () => {
        if (!apiKey) {
            setError("Polygon API Key Required");
            return;
        }

        setLoading(true);
        setError(null);
        setStrategy(null); // Reset strategy on new data load
        try {
            const chain = await fetchOptionsChain(ticker, initialPrice);
            if (chain.length === 0) {
                // If no data (weekend), keep error but allow demo mode to function if needed
                setError("No options data found (Market Closed). Switch to Demo Mode to test.");
            } else {
                setFullChain(chain);
                const flow = calculateOptionsFlow(chain);
                setData(flow);
            }
        } catch (e: any) {
            setError(e.message || "Failed to load options data");
        } finally {
            setLoading(false);
        }
    };

    // Auto-load on mount or when ticker/key changes
    useEffect(() => {
        if (apiKey) {
            // Reset data immediately when ticker changes to avoid showing stale data
            setData(null);
            setFullChain([]);
            setStrategy(null);
            loadData();
        }
    }, [ticker, apiKey]);

    const handleSaveKey = (key: string) => {
        localStorage.setItem('polygon_api_key', key);
        setApiKey(key);
        setError(null);
    };

    const handleGenerateStrategy = async () => {
        if (!data || fullChain.length === 0) return;

        setStrategyLoading(true);
        try {
            // 1. Filter candidates (Now Async)
            const candidates = await filterPromisingContracts(fullChain, data.sentiment);

            // 2. Ask Gemini
            const result = await generateOptionStrategy(
                ticker,
                initialPrice,
                trend,
                data.sentiment,
                candidates
            );
            setStrategy(result);
        } catch (e) {
            console.error("Strategy Gen Error", e);
        } finally {
            setStrategyLoading(false);
        }
    };

    // Helper to get available contracts (Real or Mock)
    const getAvailableContracts = (currentPrice: number, chain: OptionContract[], strategyContractName?: string) => {
        let optionsList: { name: string; strike: number; ticker: string }[] = [];

        // 1. Try to get real contracts from chain
        if (chain.length > 0) {
            // Find nearest expiration
            const expirations = Array.from(new Set(chain.map(c => c.expiration_date))).sort();
            const nearestExp = expirations[0];

            // Filter for nearest expiration and reasonable strikes (ATM +/- 10%)
            const relevant = chain.filter(c =>
                c.expiration_date === nearestExp &&
                Math.abs(c.strike_price - currentPrice) / currentPrice < 0.1
            );

            if (relevant.length > 0) {
                optionsList = relevant.sort((a, b) => a.strike_price - b.strike_price).map(c => ({
                    name: `${ticker} ${c.strike_price}C ${c.expiration_date}`,
                    strike: c.strike_price,
                    ticker: c.ticker // Pass full option ticker (e.g. O:SPY...)
                }));
            }
        } else {
            // 2. Fallback to Mock Contracts (if API down or empty)
            const baseStrike = Math.floor(currentPrice);
            const strikes = [baseStrike - 2, baseStrike - 1, baseStrike, baseStrike + 1, baseStrike + 2];
            const mockDate = new Date();
            mockDate.setDate(mockDate.getDate() + (5 - mockDate.getDay() + 7) % 7); // Next Friday
            const dateStr = mockDate.toISOString().split('T')[0];

            optionsList = strikes.map(s => ({
                name: `${ticker} ${s}C ${dateStr} (MOCK)`,
                strike: s,
                ticker: `MOCK:${ticker}${s}C` // Mock ticker
            }));
        }

        // If strategy suggested a specific contract, try to match it to a REAL ticker from fullChain
        if (strategyContractName && chain.length > 0) {
            const exists = optionsList.find(o => o.name === strategyContractName);
            if (!exists) {
                optionsList.push({
                    name: strategyContractName,
                    strike: 0,
                    ticker: `MOCK:STRATEGY` // Fallback if not found
                });
            }
        }

        return optionsList;
    };

    const handleSimulateTrade = (strategy: StrategyResult) => {
        const contracts = getAvailableContracts(initialPrice, fullChain, strategy.recommendedContract);

        setSimulationConfig({
            price: strategy.suggestedEntry || "2.00",
            contract: strategy.recommendedContract, // Default selection
            quantity: 10,
            strategy: strategy,
            availableContracts: contracts
        });
        setShowSimulationModal(true);
    };

    const confirmSimulation = () => {
        if (!simulationConfig.price || !simulationConfig.contract) return;

        // Find selected contract object to get the full ticker
        const selectedContract = simulationConfig.availableContracts.find(c => c.name === simulationConfig.contract);
        const optionTicker = selectedContract?.ticker || `MOCK:${ticker}`;

        setActivePosition({
            entryPrice: parseFloat(simulationConfig.price),
            contracts: simulationConfig.quantity,
            contractName: simulationConfig.contract,
            optionTicker: optionTicker, // Pass full ticker
            underlyingEntryPrice: initialPrice // Capture snapshot of stock price
        });
        setShowSimulationModal(false);
    };

    if (!apiKey) {
        return (
            <div className="h-[500px] flex flex-col items-center justify-center bg-neutral-900/50 border border-neutral-800 rounded-lg p-6 text-center">
                <Lock className="w-12 h-12 text-gray-600 mb-4" />
                <h3 className="text-lg font-bold text-white mb-2">Polygon.io Access Required</h3>
                <p className="text-sm text-gray-400 mb-4 max-w-xs">
                    To view Options Flow & Greeks, please enter your Polygon.io API Key.
                    (Free tier works, but has rate limits).
                </p>
                <input
                    type="text"
                    placeholder="Enter API Key (e.g. xxxx...)"
                    className="bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white w-64 mb-2 focus:border-purple-500 focus:outline-none"
                    onChange={(e) => handleSaveKey(e.target.value)}
                />
                <p className="text-[10px] text-gray-600">Key is saved locally in your browser.</p>
            </div>
        );
    }

    return (
        <div className="h-[600px] w-full bg-[#0a0a0a] rounded-lg border border-neutral-800 flex flex-col overflow-hidden relative">
            {/* Simulation Modal */}
            {showSimulationModal && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm rounded-xl">
                    <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl w-96 space-y-4 shadow-2xl">
                        <h3 className="text-lg font-bold text-white">Simulate Trade</h3>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs text-gray-400">Entry Price</label>
                                <input
                                    type="text"
                                    value={simulationConfig.price}
                                    onChange={(e) => setSimulationConfig(prev => ({ ...prev, price: e.target.value }))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs text-gray-400">Quantity</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={simulationConfig.quantity}
                                    onChange={(e) => setSimulationConfig(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-gray-400">Contract Selection</label>
                            <select
                                value={simulationConfig.contract}
                                onChange={(e) => setSimulationConfig(prev => ({ ...prev, contract: e.target.value }))}
                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:border-blue-500 outline-none appearance-none"
                            >
                                <option value="" disabled>Select a Contract</option>
                                {simulationConfig.availableContracts.map((c, i) => (
                                    <option key={i} value={c.name}>
                                        {c.name}
                                    </option>
                                ))}
                                {/* Fallback option if current strategy contract isn't in list */}
                                {!simulationConfig.availableContracts.find(c => c.name === simulationConfig.contract) && simulationConfig.contract && (
                                    <option value={simulationConfig.contract}>{simulationConfig.contract}</option>
                                )}
                            </select>
                        </div>

                        <div className="flex space-x-3 pt-2">
                            <button
                                onClick={() => setShowSimulationModal(false)}
                                className="flex-1 py-2 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmSimulation}
                                className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors font-medium"
                            >
                                Start Simulation
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="p-3 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50">
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-500" />
                    <h3 className="text-sm font-bold text-gray-200">Options Flow <span className="text-xs font-normal text-gray-500 ml-1">(Greeks & Vol)</span></h3>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={loadData}
                        disabled={loading}
                        className="flex items-center gap-1 px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-xs text-gray-300 transition-colors disabled:opacity-50"
                    >
                        <RefreshCcw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {error ? (
                <div className="flex-1 flex flex-col items-center justify-center text-rose-400 p-4 text-center">
                    <AlertTriangle className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-sm font-medium">{error}</p>
                    <p className="text-xs opacity-60 mt-1">Try refreshing in a minute (Rate Limits).</p>
                </div>
            ) : !data ? (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                    <p className="text-sm">Loading Options Chain...</p>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">

                    {/* Active Position Manager */}
                    {activePosition ? (
                        <ProfitManager
                            key={activePosition.contractName} // FORCE RESET on new position
                            entryPrice={activePosition.entryPrice}
                            // Simulate Option Price movement correlated to LIVE Stock Price
                            // Delta 0.5 approx
                            currentPrice={activePosition.entryPrice + ((initialPrice - activePosition.underlyingEntryPrice) * 0.5)}
                            contracts={activePosition.contracts}
                            ticker={ticker}
                            contractName={activePosition.contractName}
                            optionTicker={activePosition.optionTicker} // Pass full ticker
                            changePercent={changePercent}
                            onClosePosition={() => setActivePosition(null)}
                            onChat={onChat}
                        />
                    ) : (
                        /* Strategy Card */
                        <StrategyCard
                            strategy={strategy}
                            loading={strategyLoading}
                            onGenerate={handleGenerateStrategy}
                            onSimulate={() => strategy && handleSimulateTrade(strategy)}
                            onChat={strategy ? () => onChat?.({
                                ticker: ticker,
                                currentPrice: initialPrice,
                                changePercent: changePercent,
                                analysis: strategy.reasoning,
                                strategy: `Recommended Action: ${strategy.action}\nContract: ${strategy.recommendedContract}\nProfit Target: ${strategy.maxProfit}\nRisk: ${strategy.maxLoss}`,
                                tradeSetup: {
                                    entry: strategy.suggestedEntry || "Market",
                                    target: strategy.maxProfit,
                                    stopLoss: strategy.maxLoss
                                }
                            }) : undefined}
                        />
                    )}

                    {/* Sentiment Banner */}
                    <div className={`p-3 rounded-lg border flex justify-between items-center ${data.sentiment === 'BULLISH' ? 'bg-emerald-900/20 border-emerald-500/30' :
                        data.sentiment === 'STRONG_BULLISH' ? 'bg-emerald-950/40 border-emerald-400/50' :
                            data.sentiment === 'BEARISH' ? 'bg-rose-900/20 border-rose-500/30' :
                                data.sentiment === 'STRONG_BEARISH' ? 'bg-red-950/40 border-red-500/50' :
                                    data.sentiment === 'REVERSAL_RISK_HIGH' ? 'bg-orange-900/20 border-orange-500/30' :
                                        data.sentiment === 'REVERSAL_RISK_LOW' ? 'bg-blue-900/20 border-blue-500/30' :
                                            'bg-neutral-800/30 border-neutral-700'
                        }`}>
                        <div>
                            <h4 className="text-xs text-gray-400 uppercase font-bold">Flow Sentiment</h4>
                            <div className={`text-lg font-bold flex items-center gap-2 ${data.sentiment === 'BULLISH' ? 'text-emerald-400' :
                                data.sentiment === 'STRONG_BULLISH' ? 'text-emerald-300' :
                                    data.sentiment === 'BEARISH' ? 'text-rose-400' :
                                        data.sentiment === 'STRONG_BEARISH' ? 'text-red-500' :
                                            data.sentiment === 'REVERSAL_RISK_HIGH' ? 'text-orange-400' :
                                                data.sentiment === 'REVERSAL_RISK_LOW' ? 'text-blue-400' :
                                                    'text-gray-300'
                                }`}>
                                {data.sentiment === 'BULLISH' && <TrendingUp className="w-5 h-5" />}
                                {data.sentiment === 'STRONG_BULLISH' && <TrendingUp className="w-5 h-5" />}
                                {data.sentiment === 'BEARISH' && <TrendingDown className="w-5 h-5" />}
                                {data.sentiment === 'STRONG_BEARISH' && <TrendingDown className="w-5 h-5" />}
                                {data.sentiment === 'REVERSAL_RISK_HIGH' && <AlertTriangle className="w-5 h-5" />}
                                {data.sentiment === 'REVERSAL_RISK_LOW' && <RefreshCcw className="w-5 h-5" />}
                                {data.sentiment === 'NEUTRAL' && <Activity className="w-5 h-5" />}

                                {data.sentiment.replace(/_/g, ' ')}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-gray-400">Put/Call Ratio</div>
                            <div className="text-lg font-mono text-white">{data.putCallRatio.toFixed(2)}</div>
                        </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-neutral-900/50 p-3 rounded border border-neutral-800">
                            <div className="text-xs text-gray-500 mb-1">Total Call Vol</div>
                            <div className="text-sm font-mono text-emerald-400">{data.totalCallVol.toLocaleString()}</div>
                        </div>
                        <div className="bg-neutral-900/50 p-3 rounded border border-neutral-800">
                            <div className="text-xs text-gray-500 mb-1">Total Put Vol</div>
                            <div className="text-sm font-mono text-rose-400">{data.totalPutVol.toLocaleString()}</div>
                        </div>
                    </div>


                    {/* Top Contracts */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Calls */}
                        <div>
                            <h5 className="text-xs font-bold text-emerald-400 mb-2 uppercase border-b border-emerald-500/20 pb-1">Top Calls (Vol)</h5>
                            <div className="space-y-1">
                                {data.topCalls.map((c, i) => (
                                    <div key={i} className="flex justify-between text-[10px] bg-neutral-900/30 p-1.5 rounded">
                                        <span className="text-gray-300 font-mono">${c.strike_price} C</span>
                                        <span className="text-gray-500">{c.expiration_date}</span>
                                        <span className="text-emerald-300 font-bold animate-pulse">
                                            {getLiveVolume(c.ticker, c.details?.volume || 0).toLocaleString()}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Puts */}
                        <div>
                            <h5 className="text-xs font-bold text-rose-400 mb-2 uppercase border-b border-rose-500/20 pb-1">Top Puts (Vol)</h5>
                            <div className="space-y-1">
                                {data.topPuts.map((c, i) => (
                                    <div key={i} className="flex justify-between text-[10px] bg-neutral-900/30 p-1.5 rounded">
                                        <span className="text-gray-300 font-mono">${c.strike_price} P</span>
                                        <span className="text-gray-500">{c.expiration_date}</span>
                                        <span className="text-rose-300 font-bold animate-pulse">
                                            {getLiveVolume(c.ticker, c.details?.volume || 0).toLocaleString()}
                                        </span>
                                    </div>

                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Trade Journal */}
                    <TradeJournal />
                </div>
            )
            }
        </div >
    );
};
