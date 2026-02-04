import React from "react";
import { useAntigravityTracker } from "../hooks/useAntigravityTracker";
import { Rocket, Trophy, AlertTriangle, RotateCcw, TrendingUp } from 'lucide-react';

interface AntigravityTabProps {
    runAI?: (payload: any) => Promise<void>;
}

export default function AntigravityTab({ runAI }: AntigravityTabProps) {
    const {
        form,
        handleFormChange,
        currentLevel,
        stats,
        history,
        savedSessions,
        dailySummary,
        equityCurve,
        levels,
        baseUnit,
        computeRow,
        recordTrade,
        resetCurrentSession,
        saveAndClearSession,
        clearAllHistory,
        probCycleWin,
    } = useAntigravityTracker(10000, 1.5, 15);

    const onRunAI = async () => {
        if (!runAI) return;

        const payload = {
            form,
            currentLevel,
            levels: levels.map((l) => {
                const r = computeRow(l);
                return {
                    level: l.id,
                    multiplier: l.multiplier,
                    size: r.size,
                    contracts: r.contracts,
                    tpPct: r.tpPct,
                    slPct: r.slPct,
                };
            }),
            stats,
            history,
            dailySummary,
            probCycleWin,
        };

        await runAI(payload);
    };

    // Simple SVG equity curve (index on x, equity on y)
    const renderEquityCurve = () => {
        if (!equityCurve || equityCurve.length === 0) return null;

        const xs = equityCurve.map((p) => p.x);
        const ys = equityCurve.map((p) => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const pad = 10;
        const width = 260;
        const height = 120;

        const scaleX = (x: number) =>
            pad +
            ((x - minX) / Math.max(1, maxX - minX)) * (width - 2 * pad);
        const scaleY = (y: number) =>
            height -
            pad -
            ((y - minY) / Math.max(1, maxY - minY)) * (height - 2 * pad);

        const points = equityCurve
            .map((p) => `${scaleX(p.x)},${scaleY(p.y)}`)
            .join(" ");

        return (
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32 border border-neutral-800 rounded bg-neutral-900/50">
                <polyline
                    points={points}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
        );
    };

    return (
        <div className="antigravity p-6 space-y-6 bg-[#0a0a0a] text-gray-200 min-h-screen">
            <div className="flex items-center gap-3 mb-2">
                <div className="bg-purple-600/20 p-2 rounded-lg">
                    <Rocket className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">Antigravity Positioning</h2>
                    <p className="text-xs text-gray-500">Live 1-3-2-6 Sequence Tracker</p>
                </div>
            </div>

            {/* Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-neutral-900/30 p-4 rounded-xl border border-neutral-800">
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Account Size ($)</label>
                    <input
                        type="number"
                        className="bg-neutral-950 border border-neutral-800 rounded px-3 py-2 w-full text-white focus:border-purple-500 focus:outline-none"
                        value={form.account}
                        onChange={(e) => handleFormChange("account", parseFloat(e.target.value))}
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Option Price ($)</label>
                    <input
                        type="number"
                        step="0.01"
                        className="bg-neutral-950 border border-neutral-800 rounded px-3 py-2 w-full text-white focus:border-purple-500 focus:outline-none"
                        value={form.optionPrice}
                        onChange={(e) => handleFormChange("optionPrice", parseFloat(e.target.value))}
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Risk % (Base Unit)</label>
                    <input
                        type="number"
                        step="0.5"
                        className="bg-neutral-950 border border-neutral-800 rounded px-3 py-2 w-full text-white focus:border-purple-500 focus:outline-none"
                        value={form.riskPercent}
                        onChange={(e) => handleFormChange("riskPercent", parseFloat(e.target.value))}
                    />
                </div>
                <div className="md:col-span-3 text-xs text-gray-500 flex justify-end">
                    <strong>Base Unit:</strong> <span className="text-emerald-400 ml-1">${baseUnit.toFixed(2)}</span>
                </div>
            </div>


            {/* Position Sizing */}
            <div className="bg-neutral-900/30 rounded-xl border border-neutral-800 overflow-hidden">
                <div className="p-4 border-b border-neutral-800 bg-neutral-900/50">
                    <h3 className="font-semibold text-sm text-gray-300">Position Sizing (1-3-2-6)</h3>
                </div>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-neutral-800 text-gray-500 text-xs uppercase">
                            <th className="text-left p-3">Level</th>
                            <th className="text-left p-3">Multiplier</th>
                            <th className="text-left p-3">Dollar Size</th>
                            <th className="text-left p-3">Contracts</th>
                            <th className="text-left p-3">TP</th>
                            <th className="text-left p-3">SL</th>
                        </tr>
                    </thead>
                    <tbody>
                        {levels.map((lvl) => {
                            const r = computeRow(lvl);
                            const isCurrent = lvl.id === currentLevel;
                            return (
                                <tr
                                    key={lvl.id}
                                    className={`border-b border-neutral-800/50 transition-colors ${isCurrent ? "bg-purple-900/20" : "hover:bg-neutral-800/30"}`}
                                >
                                    <td className="p-3 font-mono">
                                        {isCurrent && <span className="mr-2 text-purple-400">▶</span>}
                                        {lvl.id}
                                    </td>
                                    <td className="p-3 text-gray-400">{lvl.multiplier}x</td>
                                    <td className="p-3 font-mono text-emerald-400">${r.size.toFixed(2)}</td>
                                    <td className="p-3 font-bold text-white">{r.contracts}</td>
                                    <td className="p-3 text-emerald-300">{r.tpText}</td>
                                    <td className="p-3 text-rose-300">{r.slText}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Live trade buttons */}
            <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-sm text-gray-400 uppercase tracking-wider mb-1">Current Level</div>
                        <div className="text-3xl font-bold text-white flex items-baseline gap-2">
                            {currentLevel} <span className="text-lg text-gray-600 font-normal">/ 4</span>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            className="px-6 py-3 border border-emerald-500/30 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-sm font-bold transition-all shadow-lg shadow-emerald-900/20 flex items-center gap-2"
                            onClick={() => recordTrade("win")}
                        >
                            <Trophy className="w-4 h-4" />
                            WIN (Level {currentLevel})
                        </button>
                        <button
                            className="px-6 py-3 border border-rose-500/30 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-sm font-bold transition-all shadow-lg shadow-rose-900/20 flex items-center gap-2"
                            onClick={() => recordTrade("lose")}
                        >
                            <AlertTriangle className="w-4 h-4" />
                            LOSE (Level {currentLevel})
                        </button>
                    </div>
                </div>
                <div className="text-xs text-gray-500 bg-neutral-950/50 p-2 rounded border border-neutral-800/50">
                    ℹ️ After each real trade, click <strong>WIN</strong> or <strong>LOSE</strong>.
                    The sequence auto-advances on wins and resets to Level 1 on any loss.
                </div>
            </div>

            {/* Summary boxes */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-4">
                    <h4 className="font-semibold text-gray-300 mb-3 flex items-center gap-2">
                        <RotateCcw className="w-4 h-4 text-blue-400" />
                        Sequence Stats
                    </h4>
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span className="text-gray-500">Total Trades</span>
                            <span className="text-white font-mono">{stats.totalTrades}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Completed Cycles</span>
                            <span className="text-emerald-400 font-mono font-bold">{stats.completedCycles}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Broken Cycles</span>
                            <span className="text-rose-400 font-mono">{stats.brokenCycles}</span>
                        </div>
                    </div>
                </div>

                <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-4">
                    <h4 className="font-semibold text-gray-300 mb-3 text-emerald-400">Wins by Level</h4>
                    <div className="grid grid-cols-2 gap-2">
                        {[1, 2, 3, 4].map(l => (
                            <div key={l} className="flex justify-between bg-neutral-950/30 p-1.5 rounded">
                                <span className="text-gray-500">L{l}</span>
                                <span className="text-white font-mono">{stats.winsByLevel[l]}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-4">
                    <h4 className="font-semibold text-gray-300 mb-3 text-rose-400">Losses by Level</h4>
                    <div className="grid grid-cols-2 gap-2">
                        {[1, 2, 3, 4].map(l => (
                            <div key={l} className="flex justify-between bg-neutral-950/30 p-1.5 rounded">
                                <span className="text-gray-500">L{l}</span>
                                <span className="text-white font-mono">{stats.lossesByLevel[l]}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* PnL + equity + probability */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-4 space-y-3">
                    <h4 className="font-semibold text-gray-300 mb-1 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                        PnL & Equity
                    </h4>
                    <div className="flex justify-between items-center p-2 bg-neutral-950/50 rounded border border-neutral-800/50">
                        <span className="text-gray-400">Realized PnL</span>
                        <span className={`font-mono font-bold ${stats.realizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {stats.realizedPnL >= 0 ? '+' : ''}${stats.realizedPnL.toFixed(2)}
                        </span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-neutral-950/50 rounded border border-neutral-800/50">
                        <span className="text-gray-400">Current Account</span>
                        <span className="font-mono font-bold text-white">${form.account.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-neutral-950/50 rounded border border-neutral-800/50">
                        <span className="text-gray-400">Cycle Win Prob (p=0.55)</span>
                        <span className="font-mono text-blue-400">{(probCycleWin * 100).toFixed(2)}%</span>
                    </div>
                </div>

                {/* Equity curve */}
                <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-4 space-y-2">
                    <h4 className="font-semibold text-gray-300 mb-1">Equity Curve</h4>
                    {renderEquityCurve()}
                    <div className="text-[10px] text-gray-500 text-center">
                        X-axis: trade count · Y-axis: equity
                    </div>
                </div>
            </div>

            {/* Daily summary */}
            <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-4">
                <h4 className="font-semibold text-gray-300 mb-3">Daily Summary</h4>
                {dailySummary.length === 0 ? (
                    <div className="text-xs text-gray-500 text-center py-4">No trades logged yet.</div>
                ) : (
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-neutral-800 text-gray-500">
                                <th className="text-left p-2">Day</th>
                                <th className="text-left p-2">Trades</th>
                                <th className="text-left p-2">Day PnL</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dailySummary.map((d) => (
                                <tr key={d.dayKey} className="border-b border-neutral-800/50">
                                    <td className="p-2 font-mono text-gray-300">{d.dayKey}</td>
                                    <td className="p-2 text-white">{d.trades}</td>
                                    <td className={`p-2 font-mono font-bold ${d.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {d.pnl >= 0 ? '+' : ''}${d.pnl.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Saved Sessions */}
            {savedSessions.length > 0 && (
                <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="font-semibold text-gray-300">Saved Sessions</h4>
                        <button
                            onClick={clearAllHistory}
                            className="text-xs text-rose-400 hover:text-rose-300 underline"
                        >
                            Clear All History
                        </button>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                        {savedSessions.map((session) => (
                            <div key={session.id} className="flex justify-between items-center bg-neutral-950/50 p-2 rounded border border-neutral-800/50 text-xs">
                                <div>
                                    <div className="text-gray-400">{new Date(session.date).toLocaleString()}</div>
                                    <div className="text-gray-500">{session.stats.totalTrades} trades</div>
                                </div>
                                <div className="text-right">
                                    <div className={`font-mono font-bold ${session.stats.realizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {session.stats.realizedPnL >= 0 ? '+' : ''}${session.stats.realizedPnL.toFixed(2)}
                                    </div>
                                    <div className="text-gray-500">End Balance: ${session.finalAccount.toFixed(0)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-neutral-800">
                <button
                    className="px-4 py-2 border border-neutral-700 rounded-lg text-xs text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                    onClick={() => resetCurrentSession(true)}
                >
                    Reset Current (Discard)
                </button>

                <button
                    className="px-4 py-2 border border-emerald-500/30 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold transition-all"
                    onClick={saveAndClearSession}
                >
                    Save & Clear Session
                </button>

                {runAI && (
                    <button
                        className="px-4 py-2 border border-blue-500/30 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-bold transition-all ml-auto"
                        onClick={onRunAI}
                    >
                        Send to Antigravity AI
                    </button>
                )}
            </div>
        </div>
    );
}
