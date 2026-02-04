import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, History, Trash2 } from 'lucide-react';

export interface TradeLogEntry {
    id: string;
    date: string;
    ticker: string;
    contractName: string;
    quantity?: number; // Added quantity
    entryPrice: number;
    exitPrice: number;
    pnlPercent: number;
    pnlAmount: number;
    result: 'WIN' | 'LOSS' | 'BE';
    reason: string;
}

export const TradeJournal: React.FC = () => {
    const [trades, setTrades] = useState<TradeLogEntry[]>([]);

    useEffect(() => {
        const storedTrades = localStorage.getItem('trade_journal');
        if (storedTrades) {
            setTrades(JSON.parse(storedTrades).reverse()); // Newest first
        }
    }, []);

    const [showConfirm, setShowConfirm] = useState(false);

    const clearJournal = () => {
        localStorage.removeItem('trade_journal');
        setTrades([]);
        setShowConfirm(false);
    };

    // Stats
    const totalTrades = trades.length;
    const wins = trades.filter(t => t.result === 'WIN').length;
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0.0';
    const totalPnL = trades.reduce((acc, t) => acc + t.pnlAmount, 0);

    return (
        <div className="bg-neutral-900/50 backdrop-blur-sm border border-neutral-800 rounded-xl p-6 mt-6">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-indigo-400" />
                    <h2 className="text-lg font-bold text-white">Trade Journal</h2>
                </div>
                {totalTrades > 0 && (
                    <div className="flex items-center gap-2">
                        {showConfirm ? (
                            <>
                                <span className="text-xs text-red-400 font-bold">Are you sure?</span>
                                <button
                                    onClick={clearJournal}
                                    className="text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 px-2 py-1 rounded border border-red-900/50 transition-colors"
                                >
                                    Yes, Clear
                                </button>
                                <button
                                    onClick={() => setShowConfirm(false)}
                                    className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1"
                                >
                                    Cancel
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setShowConfirm(true)}
                                className="text-xs text-neutral-500 hover:text-red-400 flex items-center gap-1 transition-colors"
                            >
                                <Trash2 className="w-3 h-3" /> Clear History
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-neutral-800/50 p-4 rounded-lg border border-neutral-700/50">
                    <p className="text-xs text-gray-400 uppercase font-bold">Total PnL</p>
                    <p className={`text-xl font-mono font-bold ${totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
                    </p>
                </div>
                <div className="bg-neutral-800/50 p-4 rounded-lg border border-neutral-700/50">
                    <p className="text-xs text-gray-400 uppercase font-bold">Win Rate</p>
                    <p className="text-xl font-mono font-bold text-white">{winRate}%</p>
                </div>
                <div className="bg-neutral-800/50 p-4 rounded-lg border border-neutral-700/50">
                    <p className="text-xs text-gray-400 uppercase font-bold">Trades</p>
                    <p className="text-xl font-mono font-bold text-white">{totalTrades}</p>
                </div>
            </div>

            {/* Trade List */}
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="text-gray-500 border-b border-neutral-800">
                            <th className="pb-3 font-medium">Date</th>
                            <th className="pb-3 font-medium">Qty</th>
                            <th className="pb-3 font-medium">Contract</th>
                            <th className="pb-3 font-medium text-right">Entry</th>
                            <th className="pb-3 font-medium text-right">Exit</th>
                            <th className="pb-3 font-medium text-right">PnL</th>
                            <th className="pb-3 font-medium text-center">Result</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                        {trades.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="py-8 text-center text-gray-600 italic">
                                    No trades recorded yet. Start trading!
                                </td>
                            </tr>
                        ) : (
                            trades.map((trade) => (
                                <tr key={trade.id} className="group hover:bg-neutral-800/30 transition-colors">
                                    <td className="py-3 text-gray-400">{new Date(trade.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                    <td className="py-3 font-mono text-gray-300">{trade.quantity || 10}</td>
                                    <td className="py-3 font-medium text-gray-300">{trade.contractName}</td>
                                    <td className="py-3 text-right text-gray-400">${trade.entryPrice.toFixed(2)}</td>
                                    <td className="py-3 text-right text-gray-400">${trade.exitPrice.toFixed(2)}</td>
                                    <td className={`py-3 text-right font-mono font-bold ${trade.pnlAmount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {trade.pnlAmount >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(1)}%
                                    </td>
                                    <td className="py-3 text-center">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${trade.result === 'WIN' ? 'bg-emerald-900/30 text-emerald-400' :
                                            trade.result === 'LOSS' ? 'bg-rose-900/30 text-rose-400' :
                                                'bg-yellow-900/30 text-yellow-400'
                                            }`}>
                                            {trade.result}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
