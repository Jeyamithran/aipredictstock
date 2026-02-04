import React from 'react';
import { ODTESimulationPosition } from '../../types';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { History, TrendingUp, TrendingDown, DollarSign, Award } from 'lucide-react';

interface TradeJournalProps {
    history: ODTESimulationPosition[];
    onClearHistory: () => void;
}

export const TradeJournal: React.FC<TradeJournalProps> = ({ history, onClearHistory }) => {
    // Calculate Stats
    const totalTrades = history.length;
    const closedTrades = history.filter(t => t.status === 'CLOSED');
    const winningTrades = closedTrades.filter(t => (t.pnl || 0) > 0);
    const losingTrades = closedTrades.filter(t => (t.pnl || 0) <= 0);

    const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
    const totalPnL = closedTrades.reduce((acc, curr) => acc + (curr.pnl || 0), 0);
    const avgWin = winningTrades.length > 0 ? winningTrades.reduce((acc, curr) => acc + (curr.pnl || 0), 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? losingTrades.reduce((acc, curr) => acc + (curr.pnl || 0), 0) / losingTrades.length : 0;

    // Prepare Chart Data (Equity Curve)
    // Sort by exit time ascending
    const sortedHistory = [...closedTrades].sort((a, b) => (a.exitTime || 0) - (b.exitTime || 0));
    let runningPnL = 0;
    const chartData = sortedHistory.map((t, index) => {
        runningPnL += (t.pnl || 0);
        return {
            trade: index + 1,
            pnl: runningPnL,
            ticker: t.option.ticker
        };
    });

    if (history.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 bg-neutral-900/30 rounded-lg p-8">
                <History className="w-12 h-12 mb-4 opacity-30" />
                <h3 className="text-lg font-semibold text-gray-400">Trade Journal Empty</h3>
                <p className="text-sm">Complete a simulated trade to see analytics.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-neutral-900/80 border border-neutral-800 rounded-lg overflow-hidden font-sans">
            {/* Header / Top Stats */}
            <div className="flex-none p-4 border-b border-neutral-800 grid grid-cols-4 gap-4">
                <div className="bg-neutral-950 p-3 rounded border border-neutral-800">
                    <div className="text-xs text-gray-500 uppercase flex items-center gap-1">
                        <DollarSign className="w-3 h-3" /> Net P&L
                    </div>
                    <div className={`text-xl font-bold font-mono ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ${totalPnL.toFixed(2)}
                    </div>
                </div>
                <div className="bg-neutral-950 p-3 rounded border border-neutral-800">
                    <div className="text-xs text-gray-500 uppercase flex items-center gap-1">
                        <Award className="w-3 h-3" /> Win Rate
                    </div>
                    <div className="text-xl font-bold font-mono text-purple-400">
                        {winRate.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-gray-600">{winningTrades.length}W - {losingTrades.length}L</div>
                </div>
                <div className="bg-neutral-950 p-3 rounded border border-neutral-800">
                    <div className="text-xs text-gray-500 uppercase flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-green-500" /> Avg Win
                    </div>
                    <div className="text-lg font-bold font-mono text-green-400">
                        ${avgWin.toFixed(2)}
                    </div>
                </div>
                <div className="bg-neutral-950 p-3 rounded border border-neutral-800">
                    <div className="text-xs text-gray-500 uppercase flex items-center gap-1">
                        <TrendingDown className="w-3 h-3 text-red-500" /> Avg Loss
                    </div>
                    <div className="text-lg font-bold font-mono text-red-400">
                        ${avgLoss.toFixed(2)}
                    </div>
                </div>
            </div>

            {/* Content: Chart + Table */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* Left: Equity Curve (40%) */}
                <div className="w-full md:w-[40%] p-4 border-r border-neutral-800 flex flex-col">
                    <h3 className="text-xs font-semibold text-gray-400 mb-2">Equity Curve</h3>
                    <div className="flex-1 min-h-[150px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                                <XAxis dataKey="trade" hide />
                                <YAxis
                                    tick={{ fill: '#6B7280', fontSize: 10 }}
                                    domain={['auto', 'auto']}
                                    width={40}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#171717', borderColor: '#333' }}
                                    itemStyle={{ color: '#E5E7EB', fontSize: '12px' }}
                                />
                                <ReferenceLine y={0} stroke="#4B5563" strokeDasharray="3 3" />
                                <Line
                                    type="monotone"
                                    dataKey="pnl"
                                    stroke="#8B5CF6"
                                    dot={{ fill: '#8B5CF6', r: 2 }}
                                    strokeWidth={2}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <button
                        onClick={onClearHistory}
                        className="mt-4 text-xs text-red-500 hover:text-red-400 border border-neutral-800 hover:border-red-900 rounded py-1 px-3 self-center"
                    >
                        Reset Journal
                    </button>
                </div>

                {/* Right: History Table (60%) */}
                <div className="w-full md:w-[60%] flex flex-col bg-neutral-900/50">
                    <div className="flex-none px-4 py-2 border-b border-neutral-800 bg-neutral-900">
                        <h3 className="text-xs font-semibold text-gray-400">Trade History</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-neutral-950 sticky top-0">
                                <tr>
                                    <th className="p-2 text-[10px] text-gray-500 font-medium">Time</th>
                                    <th className="p-2 text-[10px] text-gray-500 font-medium">Contract</th>
                                    <th className="p-2 text-[10px] text-gray-500 font-medium text-right">Qty</th>
                                    <th className="p-2 text-[10px] text-gray-500 font-medium text-right">Entry</th>
                                    <th className="p-2 text-[10px] text-gray-500 font-medium text-right">Exit</th>
                                    <th className="p-2 text-[10px] text-gray-500 font-medium text-right">P&L</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-800">
                                {sortedHistory.slice().reverse().map((trade) => (
                                    <tr key={trade.id} className="hover:bg-neutral-800/50 text-xs">
                                        <td className="p-2 text-gray-400 font-mono">
                                            {trade.exitTime ? new Date(trade.exitTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                        </td>
                                        <td className="p-2 font-mono">
                                            <span className={trade.option.type === 'call' ? 'text-green-300' : 'text-red-300'}>
                                                {trade.option.ticker.split(':')[1]}
                                            </span>
                                        </td>
                                        <td className="p-2 text-right text-gray-300 font-mono">{trade.quantity}</td>
                                        <td className="p-2 text-right text-gray-400 font-mono">${trade.entryPrice.toFixed(2)}</td>
                                        <td className="p-2 text-right text-gray-400 font-mono">${trade.exitPrice?.toFixed(2)}</td>
                                        <td className={`p-2 text-right font-mono font-bold ${(trade.pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {(trade.pnl || 0) >= 0 ? '+' : ''}${(trade.pnl || 0).toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
