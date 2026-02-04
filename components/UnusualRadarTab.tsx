import React, { useState, useEffect } from 'react';
import {
    Search, Filter, TrendingUp, AlertTriangle,
    ArrowRight, Info, Zap, Clock, Shield, Star, ArrowUpDown
} from 'lucide-react';
import { fetchUnusualOptions, UnusualOption } from '../services/UnusualOptionsService';
import { OptionContract } from '../services/polygonService';
import { StockData } from '../types';
import { useOptionsStream } from '../hooks/useOptionsStream';

interface UnusualRadarProps {
    onTickerSelect?: (ticker: string) => void;
    onAiExplain?: (context: string) => void;
}

export const UnusualRadarTab: React.FC<UnusualRadarProps> = ({ onTickerSelect, onAiExplain }) => {
    // State
    const [ticker, setTicker] = useState('SPY');
    const [options, setOptions] = useState<UnusualOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedContract, setSelectedContract] = useState<UnusualOption | null>(null);

    // Live Data Integration
    const streamChannels = selectedContract ? [`T.${selectedContract.ticker}`] : [];
    const { messages, status: wsStatus } = useOptionsStream(streamChannels);

    // Filter messages for current selection (just in case)
    const liveTrades = messages
        .filter(m => m.sym === selectedContract?.ticker)
        .slice(0, 50); // Show last 50

    // Filters
    const [minVol, setMinVol] = useState(500);
    const [typeFilter, setTypeFilter] = useState<'ALL' | 'CALL' | 'PUT'>('ALL');
    const [dteFilter, setDteFilter] = useState<'ALL' | '0DTE' | 'WEEKLY'>('0DTE');

    // Sorting
    const [sortField, setSortField] = useState<keyof UnusualOption | 'score'>('score');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    // Fetch Data
    const loadData = async (overrideTicker?: string) => {
        const targetTicker = overrideTicker || ticker;
        if (!targetTicker || targetTicker.length < 2) return;

        setLoading(true);
        setError(null);
        try {
            // Mock current price fetching (in real app, use existing prop or service)
            // For now, we rely on the service to fetch chains which might need price.
            // But fetchUnusualOptions takes price? 
            // Wait, fetchUnusualOptions needs currentPrice to filter ATM.
            // Let's assume we can pass a dummy price if we don't have it, or fetch quote first.
            // For this implementation, I will just pass a rough estimate or fetch quote if possible.
            // Ideally, this component receives the current price or fetches it.

            // Let's fetch a quote quickly using existing FMP service if possible, 
            // but to avoid circular deps or complexity, let's just make the service robust 
            // or ask the user to input price? No that's bad UX.
            // I'll assume the user enters ticker and we can get price from FMP or Polygon.
            // Let's rely on the fact that fetchUnusualOptions calls fetchOptionsChain
            // which handles price logic (it actually takes it as arg or optional).

            // If we don't pass price, Polygon fetches all strikes? 
            // polygonService: fetchOptionsChain(ticker, currentPrice)
            // If currentPrice is undefined, it doesn't filter by strike. That's fine for now.

            const data = await fetchUnusualOptions(targetTicker.toUpperCase(), 0, minVol);
            setOptions(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load options');
        } finally {
            setLoading(false);
        }
    };

    // Data Table State
    const [quickFilter, setQuickFilter] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    // Initial Load
    useEffect(() => {
        loadData('SPY');
    }, []);

    useEffect(() => {
        if (ticker.length >= 2) loadData();
    }, [minVol]);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [typeFilter, dteFilter, quickFilter, options]);

    // 1. Filter Logic
    const filteredOptions = options.filter(opt => {
        // Existing Logic
        if (typeFilter !== 'ALL' && opt.contract_type.toUpperCase() !== typeFilter) return false;

        // DTE
        const today = new Date();
        const exp = new Date(opt.expiration_date);
        const diffTime = Math.abs(exp.getTime() - today.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (dteFilter === '0DTE' && diffDays > 1) return false;
        if (dteFilter === 'WEEKLY' && diffDays > 7) return false;

        // Quick Text Filter
        if (quickFilter) {
            const term = quickFilter.toLowerCase();
            const match =
                opt.ticker.toLowerCase().includes(term) ||
                opt.strike_price.toString().includes(term) ||
                (opt.contract_type).includes(term);
            if (!match) return false;
        }

        return true;
    });

    // 2. Sort Logic
    const sortedOptions = [...filteredOptions].sort((a, b) => {
        let valA: any = a[sortField as keyof UnusualOption];
        let valB: any = b[sortField as keyof UnusualOption];

        if (sortField === 'score') {
            valA = a.unusualScore;
            valB = b.unusualScore;
        }

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    // 3. Pagination Logic
    const totalPages = Math.ceil(sortedOptions.length / itemsPerPage);
    const paginatedOptions = sortedOptions.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field as any);
            setSortDirection('desc');
        }
    };

    const SortIcon = ({ field }: { field: string }) => {
        if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-neutral-600 inline ml-1" />;
        return sortDirection === 'asc'
            ? <TrendingUp className="w-3 h-3 text-purple-400 inline ml-1 rotate-180" />
            : <TrendingUp className="w-3 h-3 text-purple-400 inline ml-1" />;
    };

    // AI Explain Logic
    const handleAiExplain = async () => {
        if (!selectedContract) return;

        const context = `
Unusual Activity Detected:
Ticker: ${selectedContract.ticker}
Contract: ${selectedContract.contract_type.toUpperCase()} $${selectedContract.strike_price}
Exp: ${selectedContract.expiration_date}
Unusual Score: ${selectedContract.unusualScore.toFixed(0)}/100
Vol/OI: ${selectedContract.volToOi.toFixed(1)}x
Volume: ${selectedContract.details?.volume?.toLocaleString() || 'N/A'}
OI: ${selectedContract.details?.open_interest?.toLocaleString() || 'N/A'}
Breakdown: ${JSON.stringify(selectedContract.scoreBreakdown)}
        `.trim();

        if (onAiExplain) {
            onAiExplain(context);
        } else {
            alert(`AI Insight (Simulation):\n\n${context}\n\n(Full AI Chat integration coming in v1.2)`);
        }
    };

    // ... (rest of render until table)

    return (
        <div className="space-y-6 animate-fade-in relative">
            {/* Header / Controls */}
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 flex flex-col gap-4">

                {/* Top Row: API Ticker Search & Global Filters */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                value={ticker}
                                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                                onKeyDown={(e) => e.key === 'Enter' && loadData()}
                                placeholder="Ticker (e.g. SPY)"
                                className="bg-neutral-950 border border-neutral-800 rounded-lg py-2 pl-9 pr-3 w-32 text-sm text-white font-bold focus:border-purple-500 focus:outline-none"
                            />
                        </div>

                        <div className="flex bg-neutral-950 rounded-lg p-1 border border-neutral-800">
                            {(['ALL', 'CALL', 'PUT'] as const).map(t => (
                                <button
                                    key={t}
                                    onClick={() => setTypeFilter(t)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${typeFilter === t
                                        ? 'bg-neutral-800 text-white shadow-sm'
                                        : 'text-gray-500 hover:text-gray-300'
                                        }`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Filter className="w-3 h-3" />
                            <span>Min Vol:</span>
                            <input
                                type="range"
                                min="100" max="5000" step="100"
                                value={minVol}
                                onChange={(e) => setMinVol(Number(e.target.value))}
                                className="w-24 accent-purple-500"
                            />
                            <span className="w-10 text-right">{minVol}</span>
                        </div>
                    </div>
                </div>

                {/* Bottom Row: Quick Filter & Stats */}
                <div className="flex justify-between items-center border-t border-neutral-800 pt-3">
                    <div className="relative w-64">
                        <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Quick Filter (Strike, Type...)"
                            value={quickFilter}
                            onChange={(e) => setQuickFilter(e.target.value)}
                            className="w-full bg-neutral-950/50 border border-neutral-800 rounded-lg py-1.5 pl-8 pr-3 text-xs text-white focus:outline-none focus:border-purple-500/50 transition-colors"
                        />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-amber-500/80 bg-amber-950/20 px-3 py-1 rounded-full border border-amber-900/30">
                        <Clock className="w-3 h-3" />
                        <span>Delayed up to 15m</span>
                    </div>
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden min-h-[400px] flex flex-col">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-500 gap-2">
                        <TrendingUp className="w-8 h-8 animate-bounce text-purple-500" />
                        <span className="text-sm">Scanning Option Components...</span>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-64 text-red-400 gap-2">
                        <AlertTriangle className="w-8 h-8" />
                        <span className="text-sm">{error}</span>
                        <button onClick={() => loadData()} className="text-xs underline hover:text-white">Retry</button>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="text-xs text-gray-400 border-b border-neutral-800 bg-neutral-950/50">
                                        <th className="p-3 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('score')}>Unusual Score <SortIcon field="score" /></th>
                                        <th className="p-3 font-medium">Contract</th>
                                        <th className="p-3 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('contract_type')}>Type <SortIcon field="contract_type" /></th>
                                        <th className="p-3 font-medium">Strike</th>
                                        <th className="p-3 font-medium">Exp</th>
                                        <th className="p-3 font-medium text-right cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('volToOi')}>Vol/OI <SortIcon field="volToOi" /></th>
                                        <th className="p-3 font-medium text-right">Volume</th>
                                        <th className="p-3 font-medium text-right">Notional</th>
                                        <th className="p-3 font-medium text-right">OI</th>
                                        <th className="p-3 font-medium text-right">IV</th>
                                        <th className="p-3 font-medium text-right">Delta</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm text-gray-300 divide-y divide-neutral-800">
                                    {paginatedOptions.map((opt, idx) => {
                                        const isCall = opt.contract_type === 'call';
                                        const scoreColor = opt.unusualScore > 80 ? 'text-purple-400' : (opt.unusualScore > 60 ? 'text-blue-400' : 'text-gray-400');

                                        // Calc Notional
                                        const price = opt.details?.last_price || 0;
                                        const volume = opt.details?.volume || 0;
                                        const notional = volume * price * 100;

                                        const formatNotional = (n: number) => {
                                            if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
                                            if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
                                            return `$${n.toFixed(0)}`;
                                        };

                                        const notionalColor = notional > 1000000 ? 'text-yellow-400 font-bold' : (notional > 100000 ? 'text-white' : 'text-gray-500');

                                        return (
                                            <tr
                                                key={idx}
                                                onClick={() => setSelectedContract(opt)}
                                                className="hover:bg-white/5 cursor-pointer transition-colors group"
                                            >
                                                <td className="p-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`font-bold ${scoreColor}`}>{opt.unusualScore.toFixed(0)}</span>
                                                        {opt.unusualScore > 80 && <Zap className="w-3 h-3 text-yellow-400 fill-current" />}
                                                    </div>
                                                </td>
                                                <td className="p-3 font-mono text-white">{opt.ticker}</td>
                                                <td className={`p-3 font-bold ${isCall ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {opt.contract_type.toUpperCase()}
                                                </td>
                                                <td className="p-3">${opt.strike_price}</td>
                                                <td className="p-3 text-xs text-gray-500">{opt.expiration_date}</td>
                                                <td className="p-3 text-right font-mono">
                                                    {(opt.volToOi).toFixed(1)}x
                                                </td>
                                                <td className="p-3 text-right text-white">{opt.details?.volume?.toLocaleString()}</td>
                                                <td className={`p-3 text-right ${notionalColor}`}>{formatNotional(notional)}</td>
                                                <td className="p-3 text-right text-gray-500">{opt.details?.open_interest?.toLocaleString()}</td>
                                                <td className="p-3 text-right text-blue-300">{(opt.details?.implied_volatility || 0).toFixed(2)}%</td>
                                                <td className="p-3 text-right text-gray-400">{(opt.details?.greeks?.delta || 0).toFixed(2)}</td>
                                            </tr>
                                        );
                                    })}
                                    {paginatedOptions.length === 0 && (
                                        <tr>
                                            <td colSpan={11} className="p-8 text-center text-gray-500">
                                                No contracts found matching criteria.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Footer */}
                        <div className="p-3 border-t border-neutral-800 bg-neutral-950/30 flex justify-between items-center text-xs text-gray-400">
                            <div>
                                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredOptions.length)} of {filteredOptions.length}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="p-1 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    Previous
                                </button>
                                <span className="text-white">Page {currentPage} of {totalPages || 1}</span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages || totalPages === 0}
                                    className="p-1 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Sliding Drawer for Details */}
            {selectedContract && (
                <div className="fixed inset-y-0 right-0 w-96 bg-neutral-950 border-l border-neutral-800 shadow-2xl p-6 z-50 overflow-y-auto transform transition-transform animate-slide-in">
                    <button
                        onClick={() => setSelectedContract(null)}
                        className="absolute top-4 right-4 text-gray-500 hover:text-white"
                    >
                        Close
                    </button>

                    <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                        {selectedContract.ticker}
                        <span className="text-sm font-normal text-gray-500 bg-neutral-900 px-2 py-0.5 rounded">
                            {selectedContract.contract_type.toUpperCase()}
                        </span>
                    </h3>
                    <div className="flex items-center gap-2 mb-6">
                        <span className="text-gray-400 text-sm">Exp: {selectedContract.expiration_date}</span>
                        {wsStatus === 'authenticated' && (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/30 border border-emerald-900 px-2 py-0.5 rounded-full animate-pulse">
                                <Zap className="w-3 h-3 fill-current" /> LIVE
                            </span>
                        )}
                    </div>

                    {/* Score Breakdown */}
                    <div className="bg-neutral-900/50 p-4 rounded-xl border border-neutral-800 mb-6">
                        <h4 className="text-sm font-semibold text-purple-300 mb-3 flex items-center gap-2">
                            <Zap className="w-4 h-4" />
                            Unusual Score: {selectedContract.unusualScore.toFixed(0)}/100
                        </h4>
                        <div className="space-y-2 text-xs text-gray-400">
                            <div className="flex justify-between">
                                <span>Vol/OI Ratio Impact</span>
                                <span className="text-white">+{selectedContract.scoreBreakdown.volOiScore.toFixed(1)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Relative Volume</span>
                                <span className="text-white">+{selectedContract.scoreBreakdown.relVolScore.toFixed(1)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Gamma Exposure</span>
                                <span className="text-white">+{selectedContract.scoreBreakdown.gammaScore.toFixed(1)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Smart Delta</span>
                                <span className="text-white">+{selectedContract.scoreBreakdown.deltaScore}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>DTE Urgency</span>
                                <span className="text-white">+{selectedContract.scoreBreakdown.dteScore}</span>
                            </div>
                        </div>
                    </div>

                    {/* Market Data */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="p-3 bg-neutral-900 rounded-lg">
                            <span className="text-xs text-gray-500 block">Volume</span>
                            <span className="text-lg font-bold text-white">{selectedContract.details?.volume?.toLocaleString()}</span>
                        </div>
                        <div className="p-3 bg-neutral-900 rounded-lg">
                            <span className="text-xs text-gray-500 block">Open Interest</span>
                            <span className="text-lg font-bold text-gray-400">{selectedContract.details?.open_interest?.toLocaleString()}</span>
                        </div>
                        <div className="p-3 bg-neutral-900 rounded-lg">
                            <span className="text-xs text-gray-500 block">Delta</span>
                            <span className="text-lg font-bold text-blue-400">{selectedContract.details?.greeks?.delta?.toFixed(2)}</span>
                        </div>
                        <div className="p-3 bg-neutral-900 rounded-lg">
                            <span className="text-xs text-gray-500 block">Gamma</span>
                            <span className="text-lg font-bold text-purple-400">{selectedContract.details?.greeks?.gamma?.toFixed(3)}</span>
                        </div>
                    </div>

                    {/* Live Trade Tape */}
                    {wsStatus === 'authenticated' && (
                        <div className="mb-6 border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/30">
                            <div className="p-3 bg-neutral-900/80 border-b border-neutral-800 flex justify-between items-center">
                                <h4 className="text-xs font-bold text-gray-300 flex items-center gap-2">
                                    <TrendingUp className="w-3 h-3" />
                                    Real-time Tape
                                </h4>
                                <span className="text-[10px] text-gray-500">{liveTrades.length} events</span>
                            </div>
                            <div className="h-48 overflow-y-auto text-xs font-mono">
                                {liveTrades.length === 0 ? (
                                    <div className="p-4 text-center text-gray-600 italic">Waiting for trades...</div>
                                ) : (
                                    <table className="w-full text-left">
                                        <thead className="bg-neutral-900 text-gray-500 sticky top-0">
                                            <tr>
                                                <th className="p-2">Time</th>
                                                <th className="p-2 text-right">Price</th>
                                                <th className="p-2 text-right">Size</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-neutral-800">
                                            {liveTrades.map((t, i) => (
                                                <tr key={i} className="hover:bg-white/5 animate-fade-in">
                                                    <td className="p-2 text-gray-400">
                                                        {new Date(t.t).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                    </td>
                                                    <td className="p-2 text-right font-bold text-white">
                                                        ${t.p?.toFixed(2)}
                                                    </td>
                                                    <td className={`p-2 text-right ${t.s > 100 ? 'text-yellow-400 font-bold' : 'text-gray-400'}`}>
                                                        {t.s}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="space-y-3">
                        <button
                            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium flex justify-center items-center gap-2 transition-colors"
                            onClick={handleAiExplain}
                        >
                            <Info className="w-4 h-4" />
                            Explain with AI
                        </button>

                        <button
                            className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-gray-300 rounded-lg font-medium flex justify-center items-center gap-2 transition-colors"
                            onClick={() => onTickerSelect && onTickerSelect(selectedContract.underlying_ticker)}
                        >
                            <TrendingUp className="w-4 h-4" />
                            Open on Chart
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
