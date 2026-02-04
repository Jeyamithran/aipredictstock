import React, { useState, useMemo } from "react";
import { Calculator, TrendingUp, AlertTriangle, RotateCcw } from "lucide-react";

type RiskMode = "aggressive" | "conservative" | "custom";

const PositionSizingTab: React.FC = () => {
    const [accountSize, setAccountSize] = useState<number>(10000);
    const [riskPercent, setRiskPercent] = useState<number>(1); // % per Level 1 unit
    const [riskMode, setRiskMode] = useState<RiskMode>("aggressive");
    const [ticker, setTicker] = useState<string>("SPY");
    const [optionPrice, setOptionPrice] = useState<number>(1.5); // $1.50

    // Sync riskPercent when mode changes (unless custom)
    const handleRiskModeChange = (mode: RiskMode) => {
        setRiskMode(mode);
        if (mode === "aggressive") setRiskPercent(1);
        if (mode === "conservative") setRiskPercent(0.5);
    };

    const unit = useMemo(() => {
        if (accountSize <= 0 || riskPercent <= 0) return 0;
        return accountSize * (riskPercent / 100);
    }, [accountSize, riskPercent]);

    const levels = useMemo(() => {
        const multipliers = [1, 3, 2, 6];
        return multipliers.map((m, idx) => {
            const dollarSize = unit * m;
            const contracts =
                optionPrice > 0 ? Math.floor(dollarSize / (optionPrice * 100)) : 0;
            return {
                level: idx + 1,
                multiplier: `${m}x`,
                dollarSize,
                contracts,
                tp: idx < 3 ? "+20–30%" : "+50–100%",
                sl: idx < 3 ? "−30–35%" : "−50%",
            };
        });
    }, [unit, optionPrice]);

    const formatted = (n: number) =>
        n.toLocaleString(undefined, { maximumFractionDigits: 2 });

    return (
        <div className="h-full w-full bg-[#0a0a0a] text-gray-200 p-6 overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex items-center gap-3 border-b border-neutral-800 pb-4">
                    <div className="p-2 bg-purple-900/30 rounded-lg">
                        <Calculator className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Position Sizing</h2>
                        <p className="text-sm text-gray-400">1-3-2-6 Progression Method for SPY 0DTE</p>
                    </div>
                </div>

                {/* Inputs Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-400 uppercase">Account Size ($)</label>
                        <input
                            type="number"
                            value={accountSize}
                            onChange={(e) => setAccountSize(Number(e.target.value) || 0)}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-white focus:border-purple-500 focus:outline-none transition-colors"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-400 uppercase">Ticker</label>
                        <input
                            type="text"
                            value={ticker}
                            onChange={(e) => setTicker(e.target.value.toUpperCase())}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-white focus:border-purple-500 focus:outline-none transition-colors"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-400 uppercase">Option Price ($)</label>
                        <input
                            type="number"
                            step="0.01"
                            value={optionPrice}
                            onChange={(e) => setOptionPrice(Number(e.target.value) || 0)}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-white focus:border-purple-500 focus:outline-none transition-colors"
                        />
                        <p className="text-[10px] text-gray-500">Approx premium (e.g. 1.5 = $150)</p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-400 uppercase">Risk Mode</label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => handleRiskModeChange("aggressive")}
                                className={`flex-1 py-1.5 px-2 rounded text-xs font-medium transition-all ${riskMode === "aggressive"
                                        ? "bg-rose-900/40 text-rose-400 border border-rose-500/50"
                                        : "bg-neutral-900 text-gray-400 border border-neutral-800 hover:bg-neutral-800"
                                    }`}
                            >
                                Aggressive (1%)
                            </button>
                            <button
                                type="button"
                                onClick={() => handleRiskModeChange("conservative")}
                                className={`flex-1 py-1.5 px-2 rounded text-xs font-medium transition-all ${riskMode === "conservative"
                                        ? "bg-emerald-900/40 text-emerald-400 border border-emerald-500/50"
                                        : "bg-neutral-900 text-gray-400 border border-neutral-800 hover:bg-neutral-800"
                                    }`}
                            >
                                Conservative (0.5%)
                            </button>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] text-gray-500 whitespace-nowrap">Custom Risk %:</span>
                            <input
                                type="number"
                                step="0.1"
                                value={riskPercent}
                                onChange={(e) => {
                                    setRiskMode("custom");
                                    setRiskPercent(Number(e.target.value) || 0);
                                }}
                                className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Unit Summary */}
                <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-4 flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-medium text-gray-300">Level 1 Base Unit</h3>
                        <p className="text-xs text-gray-500">Calculated from {riskPercent}% of Account Size</p>
                    </div>
                    <div className="text-2xl font-mono font-bold text-white">
                        {unit > 0 ? `$${formatted(unit)}` : "—"}
                    </div>
                </div>

                {/* Strategy Table */}
                <div className="border border-neutral-800 rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-neutral-900 border-b border-neutral-800">
                                <th className="p-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Level</th>
                                <th className="p-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Multiplier</th>
                                <th className="p-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Dollar Size</th>
                                <th className="p-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Contracts</th>
                                <th className="p-3 text-xs font-medium text-gray-400 uppercase tracking-wider text-emerald-400">Target (TP)</th>
                                <th className="p-3 text-xs font-medium text-gray-400 uppercase tracking-wider text-rose-400">Stop (SL)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800">
                            {levels.map((row) => (
                                <tr key={row.level} className="hover:bg-neutral-800/30 transition-colors">
                                    <td className="p-3 text-sm font-bold text-white">Level {row.level}</td>
                                    <td className="p-3 text-sm text-blue-400 font-mono">{row.multiplier}</td>
                                    <td className="p-3 text-sm text-gray-300 font-mono">
                                        {unit > 0 ? `$${formatted(row.dollarSize)}` : "—"}
                                    </td>
                                    <td className="p-3 text-sm font-bold text-white bg-neutral-800/50 rounded">
                                        {row.contracts} <span className="text-xs font-normal text-gray-500 ml-1">contracts</span>
                                    </td>
                                    <td className="p-3 text-sm text-emerald-400">{row.tp}</td>
                                    <td className="p-3 text-sm text-rose-400">{row.sl}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Rules Section */}
                <div className="bg-blue-900/10 border border-blue-500/20 rounded-lg p-5">
                    <h3 className="text-sm font-bold text-blue-400 mb-3 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" /> Progression Rules
                    </h3>
                    <ul className="space-y-2 text-sm text-gray-300">
                        <li className="flex items-start gap-2">
                            <span className="text-emerald-500 font-bold">Win:</span>
                            <span>Move to the next level (1 → 2 → 3 → 4). Compounding profits.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-rose-500 font-bold">Loss:</span>
                            <span className="flex items-center gap-1">Reset back to Level 1 immediately. <RotateCcw className="w-3 h-3 text-gray-500" /></span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-orange-400 font-bold">Limit:</span>
                            <span>Max 1–2 full cycles per day to avoid overtrading.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-blue-400 font-bold">Targets:</span>
                            <span>Levels 1–3 aim for +20–30% (Scalp). Level 4 aims for +50–100% (Runner).</span>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default PositionSizingTab;
