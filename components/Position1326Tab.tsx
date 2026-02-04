import React, { useEffect, useMemo, useState } from "react";
import { fetch1326Advice, Gemini1326Response } from "../services/gemini1326Service";
import { Calculator, Zap, RotateCcw, Save, Trash2, History } from "lucide-react";

const STORAGE_KEY = "antigravity_1326_state_v1";

type TradeResult = "win" | "loss";

export interface Trade {
    ts: string;          // ISO time
    level: number;       // 1–4
    size: number;        // $
    result: TradeResult; // 'win' | 'loss'
    pnlPercent: number | null;
    pnlAmount: number;   // $
}

export interface Position1326State {
    accountSize: number;
    riskPercent: number;
    multipliers: [number, number, number, number]; // [1,3,2,6]
    currentLevelIndex: number; // 0..3 (Level = index+1)
    cyclePnL: number;
    totalPnL: number;
    completedCycles: number;
    trades: Trade[];
}

const defaultState: Position1326State = {
    accountSize: 10000,
    riskPercent: 1.5, // Changed default to 1.5% as 15% is VERY aggressive for real trading
    multipliers: [1, 3, 2, 6],
    currentLevelIndex: 0,
    cyclePnL: 0,
    totalPnL: 0,
    completedCycles: 0,
    trades: []
};

function loadState(): Position1326State {
    if (typeof window === "undefined") return defaultState;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultState;
        const parsed = JSON.parse(raw) as Partial<Position1326State>;
        return {
            ...defaultState,
            ...parsed,
            // Ensure complex objects are restored correctly
            multipliers: parsed.multipliers ?? [1, 3, 2, 6],
            trades: parsed.trades ?? []
        };
    } catch (err) {
        console.error("Failed to load 1-3-2-6 state", err);
        return defaultState;
    }
}

function saveState(state: Position1326State) {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
        console.error("Failed to save 1-3-2-6 state", err);
    }
}

const MAX_TRADES_STORED = 50;

export const Position1326Tab: React.FC = () => {
    const [state, setState] = useState<Position1326State>(defaultState);
    const [pnlPercentInput, setPnlPercentInput] = useState<string>("");
    const [aiAdvice, setAiAdvice] = useState<Gemini1326Response | null>(null);
    const [aiLoading, setAiLoading] = useState<boolean>(false);
    const [aiError, setAiError] = useState<string>("");

    useEffect(() => {
        setState(loadState());
    }, []);

    useEffect(() => {
        saveState(state);
    }, [state]);

    const { accountSize, riskPercent, multipliers, currentLevelIndex } = state;

    const baseUnit = useMemo(
        () => (accountSize * riskPercent) / 100,
        [accountSize, riskPercent]
    );

    const currentLevel = currentLevelIndex + 1; // 1..4
    const currentMultiplier = multipliers[currentLevelIndex];
    const currentSize = baseUnit * currentMultiplier;
    const isLastLevel = currentLevelIndex === multipliers.length - 1;

    const handleNumericChange = (field: keyof Position1326State, value: string) => {
        const num = Number(value);
        setState(prev => ({
            ...prev,
            [field]: Number.isFinite(num) ? num : 0
        }));
    };

    const handleResetCycle = () => {
        setState(prev => ({
            ...prev,
            currentLevelIndex: 0,
            cyclePnL: 0
        }));
        setPnlPercentInput("");
    };

    const handleClearHistory = () => {
        if (confirm("Are you sure you want to clear all trade history?")) {
            setState(prev => ({
                ...prev,
                trades: [],
                totalPnL: 0,
                completedCycles: 0,
                cyclePnL: 0,
                currentLevelIndex: 0
            }));
        }
    };

    const recordTrade = (result: TradeResult) => {
        const rawPnlPercent =
            pnlPercentInput.trim() === "" ? null : Number(pnlPercentInput);
        const pnlPercent =
            rawPnlPercent === null || Number.isNaN(rawPnlPercent)
                ? null
                : rawPnlPercent;

        let pnlAmount = 0;
        if (pnlPercent !== null) {
            pnlAmount = (currentSize * Math.abs(pnlPercent)) / 100;
            if (result === "loss") {
                pnlAmount = -Math.abs(pnlAmount);
            } else {
                pnlAmount = Math.abs(pnlAmount);
            }
        }

        const trade: Trade = {
            ts: new Date().toISOString(),
            level: currentLevel,
            size: currentSize,
            result,
            pnlPercent,
            pnlAmount
        };

        setState(prev => {
            const newCyclePnL = prev.cyclePnL + pnlAmount;
            const newTotalPnL = prev.totalPnL + pnlAmount;

            let newLevelIndex = prev.currentLevelIndex;
            let newCompletedCycles = prev.completedCycles;

            // Determine finalCyclePnL based on trade result and level progression
            const finalCyclePnL = result === "win" && isLastLevel ? 0 : (result === "loss" ? 0 : newCyclePnL);
            const newAccountSize = prev.accountSize + pnlAmount;

            if (result === "win") {
                if (isLastLevel) {
                    newCompletedCycles += 1;
                    newLevelIndex = 0; // reset to Level 1
                } else {
                    newLevelIndex += 1;
                }
            } else {
                // loss -> reset to Level 1
                newLevelIndex = 0;
            }

            const trades = [trade, ...prev.trades];
            if (trades.length > MAX_TRADES_STORED) {
                trades.length = MAX_TRADES_STORED;
            }

            return {
                ...prev,
                accountSize: newAccountSize,
                currentLevelIndex: newLevelIndex,
                completedCycles: newCompletedCycles,
                cyclePnL: finalCyclePnL,
                totalPnL: newTotalPnL,
                trades
            };
        });

        setPnlPercentInput("");
    };

    const handleWin = () => recordTrade("win");
    const handleLoss = () => recordTrade("loss");

    // 🔥 Gemini "world-class assistant" hook
    const handleAskAiAdvice = async () => {
        try {
            setAiLoading(true);
            setAiError("");
            setAiAdvice(null);

            // You can also pass live market snapshot here from your other tabs if connected.
            // For now we pass basic snapshot.
            const payload = {
                progressionState: {
                    accountSize,
                    riskPercent,
                    baseUnit,
                    multipliers,
                    currentLevelIndex,
                    currentLevel,
                    currentSize,
                    cyclePnL: state.cyclePnL,
                    totalPnL: state.totalPnL,
                    completedCycles: state.completedCycles
                },
                lastTrades: state.trades.slice(0, 10).map(t => ({
                    ...t,
                    ts: t.ts
                })),
                marketSnapshot: {
                    session: "RTH",
                    // In a real integration, we'd inject current price/trend here
                    extraNotes: "User requested advice on next trade."
                }
            };

            const advice = await fetch1326Advice(payload);
            setAiAdvice(advice);

        } catch (err: unknown) {
            console.error(err);
            setAiError("Failed to get AI advice. Check Gemini API Key.");
        } finally {
            setAiLoading(false);
        }
    };

    return (
        <div className="p-4 md:p-6 text-gray-200 bg-[#050505] min-h-screen">
            <div className="flex items-center gap-3 mb-6">
                <div className="bg-purple-600/20 p-2 rounded-lg">
                    <Calculator className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">Positioning – 1–3–2–6 (SPY 0DTE)</h2>
                    <p className="text-xs text-gray-500">Anti-Martingale Position Sizing System</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Column: Controls & Map */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Account & Risk */}
                    <section className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-5">
                        <h3 className="font-semibold text-gray-300 mb-4 flex items-center gap-2">
                            <Save className="w-4 h-4 text-emerald-400" />
                            Account &amp; Risk
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Account Size ($)</label>
                                <input
                                    type="number"
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                                    value={accountSize}
                                    onChange={e => handleNumericChange("accountSize", e.target.value)}
                                    min={0}
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Risk % (Level 1)</label>
                                <input
                                    type="number"
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                                    value={riskPercent}
                                    onChange={e => handleNumericChange("riskPercent", e.target.value)}
                                    min={0}
                                    max={100}
                                    step={0.1}
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Base Unit ($)</label>
                                <input
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-emerald-400 font-mono focus:outline-none"
                                    value={baseUnit.toFixed(2)}
                                    disabled
                                />
                            </div>
                        </div>
                    </section>

                    {/* Level table */}
                    <section className="bg-neutral-900/30 border border-neutral-800 rounded-xl overflow-hidden">
                        <div className="p-4 border-b border-neutral-800 bg-neutral-950/30 flex justify-between items-center">
                            <h3 className="font-semibold text-gray-300">Level Map</h3>
                            <div className="text-xs text-gray-500">
                                Current: <span className="text-white font-bold">Level {currentLevel}</span>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-neutral-800 text-gray-500 text-xs uppercase bg-neutral-950/50">
                                        <th className="p-3 text-left">Level</th>
                                        <th className="p-3 text-left">Multiplier</th>
                                        <th className="p-3 text-left">Size ($)</th>
                                        <th className="p-3 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {multipliers.map((m, idx) => {
                                        const size = baseUnit * m;
                                        const active = idx === currentLevelIndex;
                                        return (
                                            <tr
                                                key={idx}
                                                className={`border-b border-neutral-800/50 transition-colors ${active ? "bg-purple-900/20" : "hover:bg-neutral-800/20"}`}
                                            >
                                                <td className="p-3 font-mono text-gray-300">{idx + 1}</td>
                                                <td className="p-3 text-gray-400">{m}x</td>
                                                <td className="p-3 font-mono text-emerald-400">${size.toFixed(2)}</td>
                                                <td className="p-3 text-center">
                                                    {active && <span className="inline-block px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-xs font-bold border border-purple-500/30">CURRENT</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 bg-neutral-950/30 border-t border-neutral-800 text-xs text-gray-400 leading-relaxed">
                            {isLastLevel
                                ? "🚀 FINAL LEVEL: If this trade wins, the cycle completes and restarts at Level 1. Lock in profits!"
                                : `🎯 NEXT STEP: If this trade wins, you advance to Level ${currentLevel + 1}. If it loses, reset to Level 1.`}
                        </div>
                    </section>

                    {/* Trade result input */}
                    <section className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-5">
                        <h3 className="font-semibold text-gray-300 mb-2">Log Trade Result</h3>
                        <p className="text-xs text-gray-500 mb-4">
                            Mark the result of your {currentLevelIndex === 3 ? "FINAL" : "current"} trade.
                            Enter P&amp;L % for accurate tracking (optional).
                        </p>
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="w-32">
                                <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">P&amp;L % (Opt)</label>
                                <input
                                    type="number"
                                    placeholder="e.g. 25"
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white placeholder-gray-700 focus:border-purple-500 focus:outline-none"
                                    value={pnlPercentInput}
                                    onChange={e => setPnlPercentInput(e.target.value)}
                                />
                            </div>
                            <button
                                onClick={handleWin}
                                className="flex-1 min-w-[100px] bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-600/50 py-2 px-4 rounded font-bold transition-all flex justify-center items-center gap-2"
                            >
                                ✅ Win
                            </button>
                            <button
                                onClick={handleLoss}
                                className="flex-1 min-w-[100px] bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-600/50 py-2 px-4 rounded font-bold transition-all flex justify-center items-center gap-2"
                            >
                                ❌ Loss
                            </button>
                            <button
                                onClick={handleResetCycle}
                                className="bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 px-3 rounded border border-gray-700 transition-all"
                                title="Manual Reset"
                            >
                                <RotateCcw className="w-4 h-4" />
                            </button>
                        </div>
                    </section>

                </div>

                {/* Right Column: AI & Stats */}
                <div className="space-y-6">

                    {/* AI Assistant */}
                    <section className="bg-gradient-to-br from-purple-900/20 to-indigo-900/20 border border-purple-500/30 rounded-xl p-5 relative overflow-hidden">
                        <div className="relative z-10">
                            <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                                <Zap className="w-4 h-4 text-yellow-400" />
                                Gemini Risk Manager
                            </h3>
                            <p className="text-xs text-gray-400 mb-4">
                                Get professional execution advice based on your current 1-3-2-6 progression state.
                            </p>
                            <button
                                onClick={handleAskAiAdvice}
                                disabled={aiLoading}
                                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-purple-900/20 flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {aiLoading ? (
                                    <>
                                        <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></span>
                                        Analyzing...
                                    </>
                                ) : (
                                    <>
                                        🤖 Ask Gemini for Advice
                                    </>
                                )}
                            </button>

                            {aiError && <p className="text-xs text-rose-400 mt-2 bg-rose-950/30 p-2 rounded border border-rose-500/20">{aiError}</p>}
                        </div>
                    </section>

                    {/* AI Response Display */}
                    {aiAdvice && (
                        <div className="bg-neutral-900/80 border border-indigo-500/30 rounded-xl p-4 animate-fade-in relative">
                            <div className="absolute top-0 right-0 p-2 opacity-10">
                                <Zap className="w-12 h-12" />
                            </div>
                            <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-2">Advice Received</h4>
                            <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap mb-4">
                                {aiAdvice.message}
                            </p>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-neutral-950/50 p-2 rounded border border-neutral-800">
                                    <span className="text-gray-500 block">Action</span>
                                    <span className="font-bold text-white uppercase">{aiAdvice.action.direction}</span>
                                </div>
                                <div className="bg-neutral-950/50 p-2 rounded border border-neutral-800">
                                    <span className="text-gray-500 block">Progression</span>
                                    <span className="font-bold text-emerald-400 uppercase">{aiAdvice.action.use1326Step}</span>
                                </div>
                                <div className="bg-neutral-950/50 p-2 rounded border border-neutral-800">
                                    <span className="text-gray-500 block">Confidence</span>
                                    <span className="font-bold text-blue-400">{(aiAdvice.action.confidence * 100).toFixed(0)}%</span>
                                </div>
                                <div className="bg-neutral-950/50 p-2 rounded border border-neutral-800">
                                    <span className="text-gray-500 block">Max Loss</span>
                                    <span className="font-bold text-rose-400">{aiAdvice.action.maxLossPercentForNextTrade}%</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Stats */}
                    <section className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-5">
                        <h3 className="font-semibold text-gray-300 mb-4 flex items-center gap-2">
                            <History className="w-4 h-4 text-gray-500" />
                            Session Stats
                        </h3>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center pb-2 border-b border-neutral-800/50">
                                <span className="text-sm text-gray-500">Completed Cycles</span>
                                <span className="text-emerald-400 font-mono font-bold text-lg">{state.completedCycles}</span>
                            </div>
                            <div className="flex justify-between items-center pb-2 border-b border-neutral-800/50">
                                <span className="text-sm text-gray-500">Current Cycle P&amp;L</span>
                                <span className={`font-mono font-bold ${state.cyclePnL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    ${state.cyclePnL.toFixed(2)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center pb-2 border-b border-neutral-800/50">
                                <span className="text-sm text-gray-500">Total P&amp;L</span>
                                <span className={`font-mono font-bold ${state.totalPnL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    ${state.totalPnL.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            {/* Recent trades */}
            <section className="mt-8">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-gray-300">Recent Trades</h3>
                    {state.trades.length > 0 && (
                        <button onClick={handleClearHistory} className="text-xs text-rose-500 hover:text-rose-400 flex items-center gap-1">
                            <Trash2 className="w-3 h-3" /> Clear History
                        </button>
                    )}
                </div>

                <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl overflow-hidden">
                    {state.trades.length === 0 ? (
                        <div className="p-8 text-center text-gray-600 text-sm">
                            No trades recorded yet. Start logging above.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-neutral-950/50 text-gray-500 text-xs border-b border-neutral-800">
                                        <th className="p-3 text-left">Time</th>
                                        <th className="p-3 text-left">Level</th>
                                        <th className="p-3 text-left">Size ($)</th>
                                        <th className="p-3 text-center">Result</th>
                                        <th className="p-3 text-right">P&amp;L %</th>
                                        <th className="p-3 text-right">P&amp;L ($)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-800/50">
                                    {state.trades.slice(0, 10).map((t, idx) => (
                                        <tr key={idx} className="hover:bg-neutral-800/30 transition-colors">
                                            <td className="p-3 text-gray-400 font-mono text-xs">{new Date(t.ts).toLocaleTimeString()}</td>
                                            <td className="p-3 text-gray-300">{t.level}</td>
                                            <td className="p-3 text-gray-400 font-mono">${t.size.toFixed(2)}</td>
                                            <td className="p-3 text-center">
                                                {t.result === "win" ?
                                                    <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-bold uppercase"><Zap className="w-3 h-3" /> Win</span> :
                                                    <span className="inline-flex items-center gap-1 text-rose-400 text-xs font-bold uppercase"><History className="w-3 h-3" /> Loss</span>
                                                }
                                            </td>
                                            <td className={`p-3 text-right font-mono ${t.pnlPercent && t.pnlPercent > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                {t.pnlPercent === null ? "-" : `${t.pnlPercent}%`}
                                            </td>
                                            <td className={`p-3 text-right font-mono font-bold ${t.pnlAmount >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                ${t.pnlAmount.toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
};
