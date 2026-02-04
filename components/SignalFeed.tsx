
import React from 'react';
import { TradeSignal } from '../types';
import { Trash2, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface SignalFeedProps {
  signals: TradeSignal[];
  onClear: () => void;
}

export const SignalFeed: React.FC<SignalFeedProps> = ({ signals, onClear }) => {
  if (signals.length === 0) return null;

  const getSignalColor = (signal: string) => {
    if (signal === 'BUY') return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
    if (signal === 'SELL') return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
    return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
  };

  return (
    <div className="mt-8 bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden animate-fade-in">
      <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-purple-500" />
          AI Signal Feed
        </h3>
        <button 
          onClick={onClear}
          className="text-xs text-gray-500 hover:text-red-400 flex items-center gap-1 px-2 py-1 rounded hover:bg-neutral-800 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Clear Log
        </button>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="text-xs text-gray-500 uppercase bg-neutral-950">
            <tr>
              <th className="px-4 py-3 whitespace-nowrap">Time</th>
              <th className="px-4 py-3 whitespace-nowrap">Symbol</th>
              <th className="px-4 py-3 whitespace-nowrap">Mode</th>
              <th className="px-4 py-3 whitespace-nowrap">Analysis</th>
              <th className="px-4 py-3 whitespace-nowrap">Signal</th>
              <th className="px-4 py-3 whitespace-nowrap">Entry</th>
              <th className="px-4 py-3 whitespace-nowrap">Stop</th>
              <th className="px-4 py-3 whitespace-nowrap">Target</th>
              <th className="px-4 py-3 whitespace-nowrap">RR</th>
              <th className="px-4 py-3 whitespace-nowrap text-right">Conf%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {signals.map((s) => (
              <tr key={s.id} className="hover:bg-white/5 transition-colors group">
                <td className="px-4 py-3 font-mono text-gray-400 whitespace-nowrap">
                  {new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="px-4 py-3 font-bold text-white">{s.ticker}</td>
                <td className="px-4 py-3 text-gray-300">{s.mode}</td>
                <td className="px-4 py-3 text-gray-400">
                    <span className="bg-neutral-800 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider">
                        {s.analysisType}
                    </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getSignalColor(s.signal)}`}>
                    {s.signal}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-gray-300">{s.entry}</td>
                <td className="px-4 py-3 font-mono text-rose-300/80">{s.stopLoss}</td>
                <td className="px-4 py-3 font-mono text-emerald-300/80">{s.target}</td>
                <td className="px-4 py-3 font-mono text-gray-300">{s.rr}</td>
                <td className="px-4 py-3 text-right font-mono">
                    <div className="flex items-center justify-end gap-1">
                        <div className="w-16 h-1 bg-neutral-800 rounded-full overflow-hidden">
                            <div 
                                className={`h-full ${s.confidence > 70 ? 'bg-emerald-500' : s.confidence > 40 ? 'bg-yellow-500' : 'bg-red-500'}`} 
                                style={{ width: `${s.confidence}%` }}
                            ></div>
                        </div>
                        <span className="text-xs text-gray-400">{s.confidence}%</span>
                    </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
