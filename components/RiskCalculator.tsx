import React, { useState, useEffect } from 'react';
import { Calculator, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

interface RiskCalculatorProps {
    currentPrice?: number;
    ticker?: string;
}

const RiskCalculator: React.FC<RiskCalculatorProps> = ({ currentPrice, ticker }) => {
    const [isOpen, setIsOpen] = useState(false);

    // State for inputs
    const [capital, setCapital] = useState<number>(() => {
        const saved = localStorage.getItem('riskCalc_capital');
        return saved ? parseFloat(saved) : 100000;
    });
    const [riskPercent, setRiskPercent] = useState<number>(() => {
        const saved = localStorage.getItem('riskCalc_riskPercent');
        return saved ? parseFloat(saved) : 2;
    });
    const [entryPrice, setEntryPrice] = useState<number | ''>('');
    const [stopLoss, setStopLoss] = useState<number | ''>('');
    const [targetPrice, setTargetPrice] = useState<number | ''>('');

    // Reset inputs when ticker changes
    useEffect(() => {
        setStopLoss('');
        setTargetPrice('');
        if (currentPrice) {
            setEntryPrice(currentPrice);
        } else {
            setEntryPrice('');
        }
    }, [ticker, currentPrice]);

    // Persist settings
    useEffect(() => {
        localStorage.setItem('riskCalc_capital', capital.toString());
    }, [capital]);

    useEffect(() => {
        localStorage.setItem('riskCalc_riskPercent', riskPercent.toString());
    }, [riskPercent]);

    // Calculations
    const maxRiskAmount = (capital * riskPercent) / 100;

    const entry = Number(entryPrice) || 0;
    const stop = Number(stopLoss) || 0;
    const target = Number(targetPrice) || 0;

    const isLong = entry > stop;
    const riskPerShare = Math.abs(entry - stop);

    // Reward calculation handles both Long and Short
    // Long: Target - Entry
    // Short: Entry - Target
    const rewardPerShare = isLong ? target - entry : entry - target;

    const positionSize = riskPerShare > 0 ? Math.floor(maxRiskAmount / riskPerShare) : 0;
    const capitalUsed = positionSize * entry;

    const potentialLoss = positionSize * riskPerShare * -1; // Always negative
    const potentialProfit = positionSize * rewardPerShare;

    const riskRewardRatio = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0;
    const breakEvenWinRate = (riskPerShare + rewardPerShare) > 0
        ? (riskPerShare / (riskPerShare + rewardPerShare)) * 100
        : 0;

    // Formatting helper
    const formatCurrency = (val: number) => val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    const formatNumber = (val: number) => val.toLocaleString('en-US', { maximumFractionDigits: 2 });

    return (
        <div className="bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden transition-all duration-300">
            <div
                className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50 cursor-pointer hover:bg-neutral-800/50 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                        <Calculator className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                            Risk Calculator
                            {ticker && <span className="text-xs font-normal text-gray-500">({ticker})</span>}
                        </h3>
                        <p className="text-xs text-gray-500">Position sizing & risk management</p>
                    </div>
                </div>
                <div className="text-gray-500">
                    {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
            </div>

            {isOpen && (
                <div className="p-6 animate-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Inputs Column */}
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Total Capital</label>
                                    <input
                                        type="number"
                                        value={capital}
                                        onChange={(e) => setCapital(parseFloat(e.target.value) || 0)}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white focus:border-blue-500 outline-none text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Risk %</label>
                                    <input
                                        type="number"
                                        value={riskPercent}
                                        onChange={(e) => setRiskPercent(parseFloat(e.target.value) || 0)}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white focus:border-blue-500 outline-none text-sm"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Entry Price</label>
                                <input
                                    type="number"
                                    value={entryPrice}
                                    onChange={(e) => setEntryPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                    placeholder="0.00"
                                    className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white focus:border-blue-500 outline-none text-sm"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Stop Loss</label>
                                    <input
                                        type="number"
                                        value={stopLoss}
                                        onChange={(e) => setStopLoss(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                        placeholder="0.00"
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white focus:border-rose-500 outline-none text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Target</label>
                                    <input
                                        type="number"
                                        value={targetPrice}
                                        onChange={(e) => setTargetPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                        placeholder="0.00"
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white focus:border-emerald-500 outline-none text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Results Column */}
                        <div className="bg-neutral-800/50 rounded-lg p-4 space-y-3 border border-neutral-700/50">
                            <div className="flex justify-between items-center pb-2 border-b border-neutral-700">
                                <span className="text-gray-400 text-sm">Max Risk Amount</span>
                                <span className="text-rose-400 font-mono font-bold">{formatCurrency(maxRiskAmount)}</span>
                            </div>

                            <div className="flex justify-between items-center">
                                <span className="text-gray-400 text-sm">Position Size</span>
                                <span className="text-blue-400 font-mono font-bold text-lg">{formatNumber(positionSize)} shares</span>
                            </div>

                            <div className="flex justify-between items-center">
                                <span className="text-gray-400 text-sm">Capital Used</span>
                                <span className="text-white font-mono">{formatCurrency(capitalUsed)}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <div className="bg-rose-500/10 rounded p-2 border border-rose-500/20">
                                    <div className="text-xs text-rose-400 mb-1">Potential Loss</div>
                                    <div className="text-rose-300 font-mono font-bold">{formatCurrency(potentialLoss)}</div>
                                </div>
                                <div className="bg-emerald-500/10 rounded p-2 border border-emerald-500/20">
                                    <div className="text-xs text-emerald-400 mb-1">Potential Profit</div>
                                    <div className="text-emerald-300 font-mono font-bold">{formatCurrency(potentialProfit)}</div>
                                </div>
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t border-neutral-700">
                                <div className="text-center flex-1 border-r border-neutral-700">
                                    <div className="text-xs text-gray-500">Risk/Reward</div>
                                    <div className={`font-bold ${riskRewardRatio >= 2 ? 'text-emerald-400' : 'text-yellow-400'} `}>
                                        1 : {formatNumber(riskRewardRatio)}
                                    </div>
                                </div>
                                <div className="text-center flex-1">
                                    <div className="text-xs text-gray-500">Break-even Win Rate</div>
                                    <div className="text-gray-300 font-bold">{formatNumber(breakEvenWinRate)}%</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RiskCalculator;
