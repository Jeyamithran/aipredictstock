
import React, { useState, useEffect } from 'react';
import { Shield, Zap, AlertTriangle, CheckCircle, XCircle, RefreshCcw, Activity } from 'lucide-react';
import { StockData } from '../types';
import { fetchTickerNews } from '../services/fmpService';
import { analyzeOptions, createDecisionPayload, DecisionOutput } from '../services/decisionEngine';
import { useOptionsStream } from '../hooks/useOptionsStream';
import { fetchOptionsChain } from '../services/polygonService';
import { analyzeOptionsGemini } from '../services/geminiService';

interface OptionDecisionEngineProps {
    stock: StockData;
    indicators?: {
        vwap: number;
        ema9: number;
        ema20: number;
        atr: number;
    } | null;
}

export const OptionDecisionEngine: React.FC<OptionDecisionEngineProps> = ({ stock, indicators }) => {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<DecisionOutput | null>(null);
    const [modelName, setModelName] = useState<string>("GPT-4o Pro");
    const [error, setError] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>([]);

    const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg} `]);

    // Live Tracking for Result
    const streamChannels = [`T.${stock.ticker} `];
    const { messages: liveMessages, status: wsStatus } = useOptionsStream(streamChannels);

    const latestTrade = liveMessages.find(m => m.sym === stock.ticker);

    const runAnalysis = async () => {
        setLoading(true);
        setError(null);
        setResult(null);
        setLogs([]);
        addLog(`Initializing Decision Engine for ${stock.ticker}...`);

        try {
            // 1. Fetch Option Chain (POLYGON Source, User Request)
            addLog("Fetching option chain from Polygon.io...");
            // Use current price to filter for relevant contracts (ATM/OTM)
            const polygonChain = await fetchOptionsChain(stock.ticker, stock.price);

            if (!polygonChain || polygonChain.length === 0) {
                addLog("No options found on Polygon.io, retrying...");
                throw new Error("No option contracts found (Polygon.io).");
            }

            addLog(`Retrieved ${polygonChain.length} contracts from Polygon.`);

            // Map Polygon to internal format expected by Decision Engine
            const mappedChain = polygonChain.map(c => ({
                ticker: c.ticker,
                underlying_ticker: c.underlying_ticker,
                strike_price: c.strike_price,
                contract_type: c.contract_type,
                expiration_date: c.expiration_date,
                details: {
                    contract_type: c.contract_type,
                    strike_price: c.strike_price,
                    expiration_date: c.expiration_date,
                    implied_volatility: c.details?.implied_volatility || 0,
                    open_interest: c.details?.open_interest || 0,
                    volume: c.details?.volume || 0,
                    ask: c.details?.ask || 0,
                    bid: c.details?.bid || 0,
                    greeks: {
                        delta: c.details?.greeks?.delta || 0,
                        gamma: c.details?.greeks?.gamma || 0,
                        theta: c.details?.greeks?.theta || 0,
                        vega: c.details?.greeks?.vega || 0
                    }
                }
            }));

            // 2. Fetch News (for Context)
            addLog("Scanning recent news headlines...");
            const news = await fetchTickerNews(stock.ticker);

            // 3. Prepare Payload (Merge Technicals)
            addLog("Constructing Decision Engine Payload...");

            // Merge props indicators into stock object for the payload creator
            const enrichedStock: StockData = {
                ...stock,
                vwap: indicators?.vwap ?? stock.vwap,
                ema9: indicators?.ema9 ?? stock.ema9,
                ema20: indicators?.ema20 ?? stock.ema20,
                atr: indicators?.atr ?? stock.atr
            };

            const payload = createDecisionPayload(enrichedStock, mappedChain, news);

            // 4. Call GPT-4o Pro
            addLog(" sending data to GPT-4.1 (Risk-First Decision Engine)...");
            const decision = await analyzeOptions(payload);

            addLog("Analysis Complete.");
            setResult(decision);

        } catch (err: any) {
            console.error("Decision Engine Failed", err);
            setError(err.message || "Failed to run analysis");
            addLog(`Error: ${err.message} `);
        } finally {
            setLoading(false);
        }
    };

    const runGeminiAnalysis = async () => {
        setLoading(true);
        setError(null);
        setResult(null);
        setLogs([]);
        setModelName("Gemini 3.0 Pro");
        addLog(`Initializing Second Opinion (Gemini 3.0 Pro) for ${stock.ticker}...`);

        try {
            // Re-use logic: Fetch Chain, News, Enrichment -> Payload
            // 1. Fetch Option Chain
            addLog("Fetching option chain from Polygon.io...");
            const polygonChain = await fetchOptionsChain(stock.ticker, stock.price);
            if (!polygonChain || polygonChain.length === 0) throw new Error("No option contracts found.");
            addLog(`Retrieved ${polygonChain.length} contracts.`);

            // Map Chain
            const mappedChain = polygonChain.map(c => ({
                ticker: c.ticker,
                underlying_ticker: c.underlying_ticker,
                strike_price: c.strike_price,
                contract_type: c.contract_type,
                expiration_date: c.expiration_date,
                details: {
                    contract_type: c.contract_type,
                    strike_price: c.strike_price,
                    expiration_date: c.expiration_date,
                    implied_volatility: c.details?.implied_volatility || 0,
                    open_interest: c.details?.open_interest || 0,
                    volume: c.details?.volume || 0,
                    ask: c.details?.ask || 0,
                    bid: c.details?.bid || 0,
                    greeks: {
                        delta: c.details?.greeks?.delta || 0,
                        gamma: c.details?.greeks?.gamma || 0,
                        theta: c.details?.greeks?.theta || 0,
                        vega: c.details?.greeks?.vega || 0
                    }
                }
            }));

            // 2. Headlines
            addLog("Scanning headlines...");
            const news = await fetchTickerNews(stock.ticker);

            // 3. Payload
            addLog("Constructing Gemini Payload...");
            const enrichedStock: StockData = {
                ...stock,
                vwap: indicators?.vwap ?? stock.vwap,
                ema9: indicators?.ema9 ?? stock.ema9,
                ema20: indicators?.ema20 ?? stock.ema20,
                atr: indicators?.atr ?? stock.atr
            };
            const payload = createDecisionPayload(enrichedStock, mappedChain, news);

            // 4. Call Gemini
            addLog("🧠 Reasoning with Gemini 3.0 Pro (Thinking Mode)...");
            const decisionWithModel = await analyzeOptionsGemini(payload);

            // Extract decision and handle potential model name
            const { modelUsed, ...decision } = decisionWithModel;

            addLog(`Analysis Complete. (Model: ${modelUsed || 'Gemini 3.0 Pro'})`);
            setResult(decision);
            if (modelUsed) setModelName(modelUsed);

        } catch (err: any) {
            console.error("Gemini Engine Failed", err);
            setError(err.message || "Failed to run Gemini analysis");
            addLog(`Error: ${err.message} `);
            setModelName("Error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header / Control Panel */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Shield className="w-6 h-6 text-purple-500" />
                            Option Decision Engine ({modelName})
                        </h2>
                        <p className="text-sm text-gray-400 mt-1">
                            Capital-preserving, false-signal resistant decision framework.
                        </p>
                    </div>
                    <button
                        onClick={runAnalysis}
                        disabled={loading}
                        className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-lg shadow-lg shadow-purple-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {loading ? 'Analyzing Structure...' : 'Run Decision Engine'}
                    </button>
                    <button
                        onClick={runGeminiAnalysis}
                        disabled={loading}
                        className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold rounded-lg shadow-lg shadow-blue-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {loading ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                        Second Opinion (Gemini 3.0)
                    </button>
                </div>

                {/* Logs Console */}
                {logs.length > 0 && (
                    <div className="bg-black/50 rounded-lg p-3 font-mono text-xs text-gray-500 max-h-32 overflow-y-auto border border-neutral-800 mb-4">
                        {logs.map((log, i) => (
                            <div key={i}>{log}</div>
                        ))}
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-lg flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5" />
                        <span>{error}</span>
                    </div>
                )}
            </div>

            {/* Results Display */}
            {result && (
                <div className="animate-in slide-in-from-bottom-5 duration-500">
                    {result.decision === 'TRADE_APPROVED' ? (
                        <div className="bg-gradient-to-br from-emerald-900/20 to-neutral-900 border border-emerald-500/50 rounded-xl p-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <CheckCircle className="w-32 h-32 text-emerald-500" />
                            </div>

                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-emerald-500/20 p-2 rounded-lg">
                                            <CheckCircle className="w-8 h-8 text-emerald-500" />
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-bold text-white">TRADE APPROVED</h3>
                                            <div className="flex items-center gap-2 text-emerald-400 text-sm font-mono">
                                                <span>CONFIDENCE SCORE:</span>
                                                <span className="font-bold text-lg">{result.confidence_score}%</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-emerald-400 font-bold uppercase tracking-wider mb-1">Live Underlying</div>
                                        <div className="text-2xl font-mono text-white flex items-center justify-end gap-2">
                                            {wsStatus === 'authenticated' && <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                            </span>}
                                            ${latestTrade?.p?.toFixed(2) || stock.price.toFixed(2)}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Trade Details */}
                                    <div className="bg-black/40 rounded-lg p-4 border border-emerald-500/20">
                                        <h4 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">Structure</h4>
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <span className="text-gray-400">Direction</span>
                                                <span className={`font - bold text - lg ${result.direction === 'CALL' ? 'text-green-400' : 'text-red-400'} `}>
                                                    {result.direction}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-gray-400">Strike</span>
                                                <span className="font-mono text-white">${result.strike}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-gray-400">Expiration</span>
                                                <span className="text-white">{result.expiration}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Risk Rules */}
                                    <div className="bg-black/40 rounded-lg p-4 border border-emerald-500/20">
                                        <h4 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">Risk Parameters</h4>
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <span className="text-gray-400">Invalidation Level</span>
                                                <span className="font-mono text-rose-400">${result.invalidation.price_level}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-gray-400">Time Stop</span>
                                                <span className="text-orange-400">{result.risk_rules.time_stop_minutes} min</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-gray-400">Max Loss</span>
                                                <span className="text-rose-400">-{result.risk_rules.max_loss_pct}%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Reasoning */}
                                <div className="mt-6 bg-black/40 rounded-lg p-4 border border-emerald-500/10">
                                    <h4 className="text-sm font-bold text-gray-400 mb-2">Entry Reasoning</h4>
                                    <ul className="space-y-1">
                                        {result.entry_reason.map((reason, idx) => (
                                            <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                                                <span className="text-emerald-500 mt-0.5">•</span>
                                                {reason}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="mt-4 text-xs text-neutral-500">
                                    Invalidation Reason: {result.invalidation.reason}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-gradient-to-br from-rose-900/10 to-neutral-900 border border-rose-500/30 rounded-xl p-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <XCircle className="w-32 h-32 text-rose-500" />
                            </div>

                            <div className="relative z-10">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="bg-rose-500/10 p-2 rounded-lg">
                                        <XCircle className="w-8 h-8 text-rose-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold text-white">NO TRADE</h3>
                                        <div className="flex items-center gap-2 text-rose-400 text-sm font-mono">
                                            <span>CATEGORY:</span>
                                            <span className="font-bold uppercase bg-rose-500/20 px-2 rounded">
                                                {result.category}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-black/40 rounded-lg p-6 border border-rose-500/20">
                                    <h4 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-wider">Rejection Reasons</h4>
                                    <ul className="space-y-3">
                                        {result.reason.map((r, idx) => (
                                            <li key={idx} className="flex items-start gap-3 text-gray-300">
                                                <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
                                                <span>{r}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <p className="mt-4 text-sm text-gray-500 italic text-center">
                                    "Missing a trade is free. A bad trade is expensive."
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )
            }
        </div >
    );
};
