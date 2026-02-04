import React, { useState, useEffect } from 'react';
import { ODTEOption, ODTESimulationPosition } from '../../types';
import { PlayCircle, StopCircle, TrendingUp, TrendingDown, Clock, AlertTriangle } from 'lucide-react';

interface ODTETradeSimulatorProps {
    activePositions: ODTESimulationPosition[];
    onClosePosition: (id: string, price: number) => void;
    onUpdatePosition: (id: string, updates: Partial<ODTESimulationPosition>) => void;
    currentPrices: Record<string, number>; // Map of ticker to current price for PnL
}

export const ODTETradeSimulator: React.FC<ODTETradeSimulatorProps> = ({ activePositions, onClosePosition, onUpdatePosition, currentPrices }) => {

    // Calculate Totals
    const INITIAL_CAPITAL = 25000;
    const usedCapital = activePositions.reduce((sum, pos) => sum + (pos.entryPrice * pos.quantity * 100), 0);
    const buyingPower = INITIAL_CAPITAL - usedCapital;

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden h-full">
            <div className="p-4 border-b border-neutral-800 bg-neutral-900/50 flex justify-between items-center">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <PlayCircle className="w-4 h-4 text-blue-400" />
                    Live 0DTE Simulator
                </h3>
                <span className="text-xs font-mono text-gray-500">
                    <span className={`${buyingPower < 0 ? 'text-red-400' : 'text-emerald-400'}`}>${buyingPower.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> Buying Power
                </span>
            </div>

            <div className="p-4 overflow-auto max-h-[400px]">
                {activePositions.length === 0 ? (
                    <div className="text-center py-8 text-gray-600 text-sm">
                        No active 0DTE positions.
                        <br /> Select an option from the Scanner to trade.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {activePositions.map(pos => {
                            const currentPrem = currentPrices[pos.option.ticker] || pos.entryPrice; // Fallback
                            const pnl = (currentPrem - pos.entryPrice) * pos.quantity * 100;
                            const isProfitable = pnl >= 0;

                            // Calculate simple decay cost (Theta * minutes elapsed)
                            const minsElapsed = (Date.now() - pos.entryTime) / 60000;
                            const thetaCost = Math.abs((pos.option.theta / 390) * minsElapsed * pos.quantity * 100);

                            return (
                                <div key={pos.id} className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-3">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <div className="font-bold text-white flex items-center gap-2">
                                                {pos.option.ticker}
                                                <span className={`text-[10px] px-1.5 rounded ${pos.option.type === 'call' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                                    {pos.option.strike}{pos.option.type === 'call' ? 'C' : 'P'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <div className="flex items-center gap-1 bg-neutral-900/50 rounded px-1.5 py-0.5 border border-neutral-700">
                                                    <span className="text-[10px] text-gray-500">Entry:</span>
                                                    <span className="text-gray-400 text-xs">$</span>
                                                    <input
                                                        type="number"
                                                        className="bg-transparent text-xs text-white w-12 outline-none"
                                                        value={pos.entryPrice}
                                                        onChange={(e) => onUpdatePosition(pos.id, { entryPrice: parseFloat(e.target.value) || 0 })}
                                                        step="0.01"
                                                    />
                                                </div>
                                                <div className="flex items-center gap-1 bg-neutral-900/50 rounded px-1.5 py-0.5 border border-neutral-700">
                                                    <span className="text-[10px] text-gray-500">Qty:</span>
                                                    <input
                                                        type="number"
                                                        className="bg-transparent text-xs text-white w-8 outline-none text-center"
                                                        value={pos.quantity}
                                                        onChange={(e) => onUpdatePosition(pos.id, { quantity: parseInt(e.target.value) || 1 })}
                                                        min="1"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className={`font-bold text-lg ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {isProfitable ? '+' : ''}${pnl.toFixed(2)}
                                            </div>
                                            <div className="text-[10px] text-gray-500 flex items-center justify-end gap-1">
                                                <Clock className="w-3 h-3" /> Decay: -${thetaCost.toFixed(2)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Warnings */}
                                    {thetaCost > 50 && (
                                        <div className="flex items-center gap-1 text-[10px] text-orange-400 mb-2 bg-orange-500/10 px-2 py-1 rounded">
                                            <AlertTriangle className="w-3 h-3" /> High Theta Decay - Consider Closing
                                        </div>
                                    )}

                                    <div className="flex gap-2 mt-2">
                                        <button
                                            onClick={() => onClosePosition(pos.id, currentPrem)}
                                            className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded py-1.5 text-xs font-medium transition-colors"
                                        >
                                            Close Position
                                        </button>
                                        <button className="flex-1 bg-neutral-700 hover:bg-neutral-600 text-gray-300 rounded py-1.5 text-xs font-medium transition-colors">
                                            Edit Stop
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
