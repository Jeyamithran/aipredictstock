import React, { useState, useEffect, useRef } from 'react';
import { TrendingDown, Search, Activity, Zap, ChevronRight, Loader2 } from 'lucide-react';
import { scanMarketForHighShortInterest, getShortInterest } from '../services/shortInterestService';
import { ShortInterestResult } from '../types';
import {
    WATCHLIST_TICKERS,
    SECTOR_AI,
    SECTOR_CLOUD,
    SECTOR_QUANTUM,
    SECTOR_CRYPTO,
    SHORT_SQUEEZE_CANDIDATES
} from '../constants';

interface ShortInterestPageProps {
    onTickerSelect?: (ticker: string) => void;
}

const ALL_TICKERS = Array.from(new Set([
    ...WATCHLIST_TICKERS,
    ...SECTOR_AI,
    ...SECTOR_CLOUD,
    ...SECTOR_QUANTUM,
    ...SECTOR_CRYPTO,
    ...SHORT_SQUEEZE_CANDIDATES,
    'SPY', 'QQQ', 'DIA', 'IWM'
])).sort();

const ShortInterestPage: React.FC<ShortInterestPageProps> = ({ onTickerSelect }) => {
    const [ticker, setTicker] = useState('SPY');
    const [data, setData] = useState<ShortInterestResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Search Suggestions State
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const searchRef = useRef<HTMLDivElement>(null);

    // Top Lists State
    const [watchList, setWatchList] = useState<ShortInterestResult[]>([]);
    const [loadingWatch, setLoadingWatch] = useState(true);

    // Initial load
    useEffect(() => {
        loadData('SPY');
        loadWatchList();

        // Click outside to close suggestions
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const loadWatchList = async () => {
        setLoadingWatch(true);
        try {
            // Use the dynamic market scanner
            const results = await scanMarketForHighShortInterest();

            // Limit to top 12 for display
            setWatchList(results.slice(0, 12));
        } catch (e) {
            console.error("Failed to load watchlist", e);
        } finally {
            setLoadingWatch(false);
        }
    };

    const loadData = async (searchTicker: string) => {
        setLoading(true);
        setError(null);
        setShowSuggestions(false);
        try {
            const results = await getShortInterest(searchTicker);
            if (results && results.length > 0) {
                setData(results);
                setTicker(searchTicker);
            } else {
                setData([]);
                setError(`No short interest data found for ${searchTicker}`);
            }
        } catch (e) {
            console.error(e);
            setError("Failed to fetch data. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase();
        setTicker(val);

        if (val.length > 0) {
            const filtered = ALL_TICKERS.filter(t => t.startsWith(val)).slice(0, 8);
            setSuggestions(filtered);
            setShowSuggestions(true);
        } else {
            setShowSuggestions(false);
        }
    };

    const handleSuggestionClick = (suggestion: string) => {
        setTicker(suggestion);
        loadData(suggestion);
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (ticker.trim()) {
            loadData(ticker.toUpperCase());
        }
    };

    return (
        <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500 overflow-y-auto custom-scrollbar pb-10">
            {/* Header Section */}
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                        <TrendingDown className="w-8 h-8 text-red-500" />
                        Short Interest Terminal
                    </h2>
                    <p className="text-gray-400 mt-1">
                        Track bearish sentiment and potential short squeeze setups.
                    </p>
                </div>

                <form onSubmit={handleSearchSubmit} className="flex gap-2 w-full md:w-auto relative" ref={searchRef}>
                    <div className="relative w-full md:w-64">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            value={ticker}
                            onChange={handleSearchChange}
                            onFocus={() => ticker && handleSearchChange({ target: { value: ticker } } as any)}
                            placeholder="Ticker (e.g. TSLA)"
                            className="bg-neutral-800 text-white pl-9 pr-4 py-2 rounded-lg border border-neutral-700 outline-none focus:border-red-500 w-full"
                        />
                        {/* Autocomplete Dropdown */}
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl overflow-hidden">
                                {suggestions.map(s => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => handleSuggestionClick(s)}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-neutral-700 transition-colors flex justify-between group"
                                    >
                                        <span className="font-bold">{s}</span>
                                        <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 text-gray-400" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                        {loading ? 'Scanning...' : 'Analyze'}
                    </button>
                </form>
            </div>

            {/* Quick Watch Section (Top 10) */}
            <div className="shrink-0">
                <div className="flex items-center gap-2 mb-3 px-1">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">High Short Interest Watch</h3>
                </div>

                {loadingWatch ? (
                    <div className="flex items-center gap-2 text-gray-500 text-sm p-4">
                        <Loader2 className="animate-spin w-4 h-4" /> Loading high interest candidates...
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {watchList.map((item) => (
                            <button
                                key={item.ticker}
                                onClick={() => loadData(item.ticker)}
                                className={`bg-neutral-900/50 border border-neutral-800 hover:border-neutral-600 rounded-lg p-3 text-left transition-all group ${item.ticker === ticker ? 'ring-1 ring-red-500 border-red-500/50 bg-red-900/10' : ''}`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className="font-bold text-white group-hover:text-red-400 transition-colors">{item.ticker}</span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${item.days_to_cover > 5 ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                        {item.days_to_cover.toFixed(1)}d
                                    </span>
                                </div>
                                <div className="text-xs text-gray-500">
                                    SI: <span className="text-gray-300">{(item.short_interest / 1000000).toFixed(1)}M</span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Main Content Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">

                {/* Left: Data Table */}
                <div className="lg:col-span-2 bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden flex flex-col min-h-[400px]">
                    <div className="p-4 border-b border-neutral-800 bg-neutral-900/80 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-white">Historical Short Data: {data.length > 0 ? (data[0].ticker || ticker) : ''}</h3>
                    </div>

                    <div className="overflow-x-auto flex-1 custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-neutral-800/50 sticky top-0">
                                <tr className="text-gray-400 text-xs uppercase tracking-wider">
                                    <th className="p-4 font-medium">Settlement Date</th>
                                    <th className="p-4 font-medium text-right">Short Interest</th>
                                    <th className="p-4 font-medium text-right">Avg Daily Vol</th>
                                    <th className="p-4 font-medium text-right">Days To Cover</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-800 text-sm">
                                {data.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-neutral-800/30 transition-colors">
                                        <td className="p-4 text-gray-300 font-medium">{row.settlement_date}</td>
                                        <td className="p-4 text-right text-yellow-400 font-mono">
                                            {row.short_interest.toLocaleString()}
                                        </td>
                                        <td className="p-4 text-right text-gray-400 font-mono">
                                            {(row.avg_daily_volume / 1000000).toFixed(2)}M
                                        </td>
                                        <td className="p-4 text-right">
                                            <span className={`px-2 py-1 rounded font-bold font-mono ${row.days_to_cover > 5 ? 'bg-red-500/20 text-red-400' :
                                                row.days_to_cover > 2 ? 'bg-yellow-500/20 text-yellow-400' :
                                                    'bg-green-500/20 text-green-400'
                                                }`}>
                                                {row.days_to_cover.toFixed(2)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {!loading && data.length === 0 && !error && (
                                    <tr>
                                        <td colSpan={4} className="p-12 text-center text-gray-500">
                                            <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                            <p>No data available for {ticker}</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right: Insights / Stats */}
                <div className="space-y-6">
                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-5">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Latest Stats</h3>
                        {data.length > 0 ? (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center py-2 border-b border-neutral-800">
                                    <span className="text-gray-400">Days To Cover</span>
                                    <span className={`text-xl font-bold ${data[0].days_to_cover > 5 ? 'text-red-500' : 'text-white'}`}>
                                        {data[0].days_to_cover.toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-neutral-800">
                                    <span className="text-gray-400">Short Interest</span>
                                    <span className="text-xl font-bold text-yellow-400">
                                        {(data[0].short_interest / 1000000).toFixed(2)}M
                                    </span>
                                </div>
                                <div className="mt-4 pt-2">
                                    <button
                                        onClick={() => onTickerSelect?.(ticker)}
                                        className="w-full bg-neutral-800 hover:bg-neutral-700 text-blue-400 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Activity size={16} />
                                        View {ticker} Charts
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-gray-500 text-sm text-center py-8">
                                Loading stats...
                            </div>
                        )}
                    </div>

                    <div className="bg-blue-900/20 border border-blue-500/20 rounded-xl p-5">
                        <h4 className="text-blue-400 font-bold flex items-center gap-2 mb-2">
                            <Activity size={16} /> Pro Tip
                        </h4>
                        <p className="text-sm text-blue-200/80 leading-relaxed">
                            High <strong>Days To Cover (&gt;5.0)</strong> combined with rising price action often signals a potential
                            <strong> Short Squeeze</strong>. Watch for high volume breakouts on these tickers.
                        </p>
                    </div>
                </div>

            </div>

            {error && (
                <div className="fixed bottom-8 right-8 bg-red-900/90 text-white px-6 py-4 rounded-xl shadow-lg border border-red-500/50 animate-in slide-in-from-bottom-5">
                    <div className="font-bold mb-1">Error</div>
                    <div className="text-sm opacity-90">{error}</div>
                </div>
            )}
        </div>
    );
};

export default ShortInterestPage;
