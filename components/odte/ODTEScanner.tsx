import React, { useState, useMemo } from 'react';
import { ODTEOption } from '../../types';
import { Activity, ArrowRight, TrendingUp, AlertTriangle, Search, Filter, ArrowUp, ArrowDown } from 'lucide-react';

interface ODTEScannerProps {
    opportunities: ODTEOption[];
    onSelectOption: (option: ODTEOption) => void;
    lastUpdated: Date;
    onAddTicker?: (ticker: string) => void;
}

type SortField = 'ticker' | 'strike' | 'premium' | 'volumeRatio' | 'delta' | 'theta';
type SortDirection = 'asc' | 'desc';

export const ODTEScanner: React.FC<ODTEScannerProps> = ({ opportunities, onSelectOption, lastUpdated, onAddTicker }) => {

    // State for Sorting and Filtering
    const [searchQuery, setSearchQuery] = useState('');
    const [sortField, setSortField] = useState<SortField>('volumeRatio');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [activeFilter, setActiveFilter] = useState<'ALL' | 'CALLS' | 'PUTS' | 'HIGH_VOL' | 'ATM'>('ALL');

    // Handle Sort Click
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc'); // Default to desc for most metrics
        }
    };

    // Derived Data
    const processedData = useMemo(() => {
        let data = [...opportunities];

        // 1. Text Search
        if (searchQuery) {
            const lowerQ = searchQuery.toLowerCase();
            data = data.filter(opt =>
                opt.ticker.toLowerCase().includes(lowerQ) ||
                opt.strike.toString().includes(lowerQ)
            );
        }

        // 2. Smart Filters
        switch (activeFilter) {
            case 'CALLS':
                data = data.filter(opt => opt.type === 'call');
                break;
            case 'PUTS':
                data = data.filter(opt => opt.type === 'put');
                break;
            case 'HIGH_VOL':
                data = data.filter(opt => opt.volumeRatio > 20);
                break;
            case 'ATM':
                data = data.filter(opt => Math.abs(opt.delta) >= 0.45 && Math.abs(opt.delta) <= 0.55);
                break;
        }

        // 3. Sorting
        data.sort((a, b) => {
            let valA: any = a[sortField];
            let valB: any = b[sortField];

            // Handle special cases or nested props if any (currently flat)
            // Theta is negative, we usually want to sort by magnitude or raw value? 
            // Let's sort raw value.

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        return data;
    }, [opportunities, searchQuery, sortField, sortDirection, activeFilter]);

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <div className="w-3 h-3" />;
        return sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
    };

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden h-full flex flex-col shadow-xl">
            {/* Header Area */}
            <div className="p-4 border-b border-neutral-800 bg-neutral-900/50 flex flex-col gap-4">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Activity className="w-4 h-4 text-emerald-400" />
                            0DTE Scanner Results
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                            Scanning for &gt;10x Volume Anomalies expiring TODAY
                        </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Live
                        </span>
                        <span>Updated: {lastUpdated.toLocaleTimeString()}</span>
                    </div>
                </div>

                {/* Controls: Search & Filters */}
                <div className="flex flex-col gap-3">
                    <div className="relative w-full">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Add Ticker or Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && searchQuery.length >= 2 && onAddTicker) {
                                    // If strict ticker format (letters only), add it
                                    // For now, assume any 2+ char string is a potential ticker add
                                    onAddTicker(searchQuery.toUpperCase());
                                    // Don't clear query, let it filter the result list which should populate soon
                                }
                            }}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2 pl-9 pr-3 text-sm text-gray-300 focus:outline-none focus:border-indigo-500/50 transition-colors"
                        />
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
                        {(['ALL', 'CALLS', 'PUTS', 'HIGH_VOL', 'ATM'] as const).map(filter => (
                            <button
                                key={filter}
                                onClick={() => setActiveFilter(filter)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${activeFilter === filter
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                                    : 'bg-neutral-800 text-gray-400 hover:text-gray-200 hover:bg-neutral-700'
                                    }`}
                            >
                                {filter.replace('_', ' ')}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Table Area */}
            <div className="overflow-auto flex-1 scrollbar-thin scrollbar-thumb-neutral-800 hover:scrollbar-thumb-neutral-700">
                {processedData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-gray-500 gap-2">
                        {opportunities.length === 0 ? (
                            <>
                                <AlertTriangle className="w-6 h-6 opacity-50" />
                                <p className="text-sm">No 10x volume anomalies found yet.</p>
                                <p className="text-xs animate-pulse opacity-50">Scanning market...</p>
                            </>
                        ) : (
                            <>
                                <Search className="w-6 h-6 opacity-50" />
                                <p className="text-sm">No results match your filter.</p>
                            </>
                        )}
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-neutral-950/90 text-gray-400 text-[11px] uppercase tracking-wider sticky top-0 z-10 backdrop-blur-sm shadow-sm ring-1 ring-white/5">
                            <tr>
                                <th
                                    className="p-3 font-semibold cursor-pointer hover:text-white select-none group transition-colors"
                                    onClick={() => handleSort('ticker')}
                                >
                                    <div className="flex items-center gap-1">Symbol <SortIcon field="ticker" /></div>
                                </th>
                                <th
                                    className="p-3 font-semibold cursor-pointer hover:text-white select-none group transition-colors"
                                    onClick={() => handleSort('strike')}
                                >
                                    <div className="flex items-center gap-1">Strike <SortIcon field="strike" /></div>
                                </th>
                                <th
                                    className="p-3 font-semibold text-right cursor-pointer hover:text-white select-none group transition-colors"
                                    onClick={() => handleSort('premium')}
                                >
                                    <div className="flex items-center justify-end gap-1">Prem <SortIcon field="premium" /></div>
                                </th>
                                <th
                                    className="p-3 font-semibold text-right cursor-pointer hover:text-white select-none group transition-colors"
                                    onClick={() => handleSort('volumeRatio')}
                                >
                                    <div className="flex items-center justify-end gap-1">Vol Ratio <SortIcon field="volumeRatio" /></div>
                                </th>
                                <th
                                    className="p-3 font-semibold text-right cursor-pointer hover:text-white select-none group transition-colors"
                                    onClick={() => handleSort('delta')}
                                >
                                    <div className="flex items-center justify-end gap-1">Delta <SortIcon field="delta" /></div>
                                </th>
                                <th
                                    className="p-3 font-semibold text-right cursor-pointer hover:text-white select-none group transition-colors"
                                    onClick={() => handleSort('theta')}
                                >
                                    <div className="flex items-center justify-end gap-1">Theta/m <SortIcon field="theta" /></div>
                                </th>
                                <th className="p-3 font-semibold text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800 text-sm">
                            {processedData.map((opt, idx) => {
                                const isCall = opt.type === 'call';
                                const volRatio = opt.volumeRatio.toFixed(1);
                                const isExtreme = opt.volumeRatio > 15;

                                return (
                                    <tr key={`${opt.ticker}-${idx}`} className="hover:bg-white/5 transition-colors group">
                                        <td className="p-3">
                                            <div className="font-bold text-white group-hover:text-indigo-300 transition-colors">{opt.ticker}</div>
                                            <div className="text-[10px] text-gray-500 font-mono tracking-tight">{opt.expiration}</div>
                                        </td>
                                        <td className="p-3">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-mono text-gray-300">{opt.strike}</span>
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${isCall ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                                                    {isCall ? 'C' : 'P'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-3 text-right font-mono text-gray-300">
                                            ${opt.premium.toFixed(2)}
                                        </td>
                                        <td className="p-3 text-right">
                                            <div className={`inline-flex items-center gap-1 font-bold ${isExtreme ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.3)]' : 'text-blue-400'}`}>
                                                {volRatio}x
                                                {isExtreme && <TrendingUp className="w-3 h-3" />}
                                            </div>
                                            <div className="text-[10px] text-gray-600 font-mono">
                                                {(opt.volume / 1000).toFixed(1)}k Vol
                                            </div>
                                        </td>
                                        <td className="p-3 text-right font-mono text-gray-400">
                                            {opt.delta.toFixed(2)}
                                        </td>
                                        <td className="p-3 text-right font-mono text-rose-400/80">
                                            {(opt.theta / 390).toFixed(4)}
                                        </td>
                                        <td className="p-3 text-right">
                                            <button
                                                onClick={() => onSelectOption(opt)}
                                                className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded-lg transition-all hover:scale-105 active:scale-95"
                                                title="Trade this option"
                                            >
                                                <ArrowRight className="w-4 h-4 text-indigo-400" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
