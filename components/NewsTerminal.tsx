import React, { useState, useEffect } from 'react';
import { Newspaper, TrendingUp, TrendingDown, Activity, Zap, Globe, Cpu, Cloud, Lock, Bitcoin, RefreshCcw } from 'lucide-react';
import { StockData, StockNews, MarketBriefing } from '../types';
import { getFMPQuotes, fetchGeneralNews, fetchMarketActives } from '../services/fmpService';
import { fetchDynamicScreener } from '../services/fmpScreenerService';
import { generateMarketBriefing } from '../services/geminiService';
import { SECTOR_QUANTUM, SECTOR_CRYPTO } from '../constants';

interface NewsTerminalProps {
    onTickerSelect?: (ticker: string) => void;
}

const NewsTerminal: React.FC<NewsTerminalProps> = ({ onTickerSelect }) => {
    const [loading, setLoading] = useState(true);
    const [briefing, setBriefing] = useState<string | null>(null);
    const [generatingBriefing, setGeneratingBriefing] = useState(false);

    // Data States
    const [macroData, setMacroData] = useState<StockData[]>([]);
    const [aiSector, setAiSector] = useState<StockData[]>([]);
    const [cloudSector, setCloudSector] = useState<StockData[]>([]);
    const [cryptoSector, setCryptoSector] = useState<StockData[]>([]);
    const [movers, setMovers] = useState<StockData[]>([]);
    const [news, setNews] = useState<StockNews[]>([]);
    const [briefingHistory, setBriefingHistory] = useState<MarketBriefing[]>([]);

    const [selectedBriefingId, setSelectedBriefingId] = useState<string | null>(null);

    useEffect(() => {
        loadDashboardData();
        loadBriefingHistory();
    }, []);

    const loadBriefingHistory = () => {
        try {
            const saved = localStorage.getItem('market_briefing_history');
            if (saved) {
                const parsed = JSON.parse(saved);
                setBriefingHistory(parsed);
                if (parsed.length > 0 && !briefing) {
                    setBriefing(parsed[0].content);
                    setSelectedBriefingId(parsed[0].id);
                }
            }
        } catch (e) {
            console.error("Failed to load briefing history", e);
        }
    };

    const saveBriefingToHistory = (text: string) => {
        const newBriefing: MarketBriefing = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            content: text,
            dateStr: new Date().toLocaleString()
        };

        const updated = [newBriefing, ...briefingHistory].slice(0, 50);
        setBriefingHistory(updated);
        localStorage.setItem('market_briefing_history', JSON.stringify(updated));
        setSelectedBriefingId(newBriefing.id);
    };

    const loadDashboardData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Macro Data
            const macroTickers = ['SPY', 'QQQ', 'DIA', 'IWM', 'VIX', 'BTCUSD', 'EURUSD'];
            const macroRes = await getFMPQuotes(macroTickers);
            setMacroData(macroRes);

            // 2. Fetch Sector Data
            const aiTickers = await fetchDynamicScreener({
                sector: 'Technology',
                industry: 'Semiconductors',
                volumeMoreThan: 1000000,
                limit: 10
            });

            const cloudTickers = await fetchDynamicScreener({
                sector: 'Technology',
                industry: 'Software - Infrastructure',
                volumeMoreThan: 500000,
                limit: 10
            });

            const [aiRes, cloudRes, cryptoRes] = await Promise.all([
                getFMPQuotes(aiTickers.length > 0 ? aiTickers : ['NVDA', 'AMD', 'TSM', 'AVGO', 'MU']),
                getFMPQuotes(cloudTickers.length > 0 ? cloudTickers : ['MSFT', 'AMZN', 'GOOGL', 'ORCL', 'SNOW']),
                getFMPQuotes(SECTOR_CRYPTO)
            ]);

            const sortByChange = (a: StockData, b: StockData) => b.changePercent - a.changePercent;

            setAiSector([...aiRes].sort(sortByChange));
            setCloudSector([...cloudRes].sort(sortByChange));
            setCryptoSector([...cryptoRes].sort(sortByChange));

            // 3. Fetch Movers
            let actives: StockData[] = [];
            try {
                const activesRes = await fetchMarketActives();
                if (activesRes && activesRes.active && activesRes.active.length > 0) {
                    actives = activesRes.active;
                } else {
                    const fallbackActives = ['TSLA', 'NVDA', 'AMD', 'AAPL', 'MSFT', 'PLTR', 'AMZN', 'GOOGL', 'META', 'COIN'];
                    actives = await getFMPQuotes(fallbackActives);
                }
            } catch (err) {
                console.warn("Failed to fetch actives, using fallback", err);
                const fallbackActives = ['TSLA', 'NVDA', 'AMD', 'AAPL', 'MSFT', 'PLTR', 'AMZN', 'GOOGL', 'META', 'COIN'];
                actives = await getFMPQuotes(fallbackActives);
            }
            setMovers(actives.slice(0, 15));

            // 4. Fetch News
            const newsRes = await fetchGeneralNews(20);
            setNews(newsRes);

            // 5. Generate Briefing
            if (!briefing) {
                generateBriefing(macroRes, newsRes, actives);
            }

        } catch (e) {
            console.error("Failed to load news terminal data", e);
        } finally {
            setLoading(false);
        }
    };

    const generateBriefing = async (macro: StockData[], newsItems: StockNews[], activeStocks: StockData[]) => {
        setGeneratingBriefing(true);
        try {
            const marketSummary = {
                indices: macro.map(m => ({ ticker: m.ticker, price: m.price, change: m.changePercent })),
                topMovers: activeStocks.slice(0, 5).map(m => ({ ticker: m.ticker, change: m.changePercent }))
            };
            const text = await generateMarketBriefing(marketSummary, newsItems);
            setBriefing(text);
            saveBriefingToHistory(text);
        } catch (e) {
            console.error("Failed to generate briefing", e);
        } finally {
            setGeneratingBriefing(false);
        }
    };

    const getBriefingTitle = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'AI Morning Note';
        if (hour < 16) return 'AI Mid-Day Update';
        return 'AI Post-Market Wrap';
    };

    const renderTickerRow = (stock: StockData) => (
        <div
            key={stock.ticker}
            onClick={() => onTickerSelect?.(stock.ticker)}
            className="flex justify-between items-center py-2 border-b border-neutral-800 hover:bg-neutral-800/30 px-2 transition-colors cursor-pointer group"
        >
            <div className="flex items-center gap-2">
                <span className={`font-bold group-hover:underline ${stock.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>{stock.ticker}</span>
                <span className="text-xs text-gray-500">${stock.price.toFixed(2)}</span>
            </div>
            <div className="flex flex-col items-end">
                <span className={`text-xs font-medium ${stock.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {stock.changePercent > 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                </span>
                <span className="text-[10px] text-gray-600">
                    Vol: {(stock.volume / 1000000).toFixed(1)}M
                </span>
                <span className="text-[9px] text-gray-700">
                    Avg: {(stock.avgVolume / 1000000).toFixed(1)}M
                </span>
            </div>
        </div>
    );

    const renderMacroItem = (ticker: string, label: string) => {
        const data = macroData.find(d => d.ticker === ticker);
        if (!data) return null;
        const isGreen = data.changePercent >= 0;
        return (
            <div key={ticker} className="flex flex-col items-center px-4 border-r border-neutral-800 last:border-0 min-w-[80px]">
                <span className="text-xs text-gray-500 font-bold">{label}</span>
                <span className={`text-sm font-mono font-bold ${isGreen ? 'text-green-400' : 'text-red-400'}`}>
                    {data.price.toFixed(2)}
                </span>
                <span className={`text-[10px] ${isGreen ? 'text-green-500' : 'text-red-500'}`}>
                    {isGreen ? '+' : ''}{data.changePercent.toFixed(2)}%
                </span>
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500">
            {/* Macro Bar */}
            <div className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-3 flex overflow-x-auto custom-scrollbar items-center shadow-lg backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-2 mr-4 text-blue-400 font-bold text-sm whitespace-nowrap">
                    <Globe size={16} /> GLOBAL MARKETS
                </div>
                {renderMacroItem('SPY', 'S&P 500')}
                {renderMacroItem('QQQ', 'NASDAQ')}
                {renderMacroItem('DIA', 'DOW')}
                {renderMacroItem('IWM', 'RUSSELL')}
                {renderMacroItem('VIX', 'VIX')}
                {renderMacroItem('BTCUSD', 'BITCOIN')}
                {renderMacroItem('EURUSD', 'EUR/USD')}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
                {/* Left Column: AI Briefing & News (Width 7) */}
                <div className="lg:col-span-7 space-y-6">
                    {/* Market Briefing */}
                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden flex flex-col h-[500px]">
                        <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/80 backdrop-blur-sm">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Zap className="w-5 h-5 text-yellow-400" />
                                {getBriefingTitle()}
                            </h3>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-2 mr-2">
                                    {briefingHistory.length > 0 && (
                                        <div className="flex items-center gap-1">
                                            <select
                                                value={selectedBriefingId || ''}
                                                onChange={(e) => {
                                                    const id = e.target.value;
                                                    const selected = briefingHistory.find(b => b.id === id);
                                                    if (selected) {
                                                        setBriefing(selected.content);
                                                        setSelectedBriefingId(id);
                                                    }
                                                }}
                                                className="bg-neutral-800 text-xs text-gray-300 border border-neutral-700 rounded px-2 py-1 outline-none focus:border-blue-500"
                                            >
                                                {briefingHistory.map(b => (
                                                    <option key={b.id} value={b.id}>
                                                        {new Date(b.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(b.timestamp).toLocaleDateString()}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={() => {
                                                    if (!selectedBriefingId) return;
                                                    const updated = briefingHistory.filter(b => b.id !== selectedBriefingId);
                                                    setBriefingHistory(updated);
                                                    localStorage.setItem('market_briefing_history', JSON.stringify(updated));

                                                    if (updated.length > 0) {
                                                        setBriefing(updated[0].content);
                                                        setSelectedBriefingId(updated[0].id);
                                                    } else {
                                                        setBriefing(null);
                                                        setSelectedBriefingId(null);
                                                    }
                                                }}
                                                className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-2 py-1 rounded transition-colors"
                                                title="Delete this briefing"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => generateBriefing(macroData, news, movers)}
                                    disabled={generatingBriefing}
                                    className="text-xs bg-neutral-800 hover:bg-neutral-700 text-gray-300 px-3 py-1 rounded-md transition-colors disabled:opacity-50"
                                >
                                    {generatingBriefing ? 'Generating...' : 'Refresh Briefing'}
                                </button>
                            </div>
                        </div>
                        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-[#0a0a0a]">
                            {generatingBriefing ? (
                                <div className="flex flex-col items-center justify-center h-full space-y-4">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                                    <p className="text-gray-400 text-sm animate-pulse">Analyzing market structure...</p>
                                </div>
                            ) : briefing ? (
                                <div className="prose prose-invert prose-sm max-w-none">
                                    <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-300">
                                        {briefing}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-full text-gray-500">
                                    Click refresh to generate market briefing
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Live Wire News */}
                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden min-h-[400px] flex flex-col">
                        <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Newspaper className="w-5 h-5 text-purple-400" /> Live Wire
                            </h3>
                        </div>
                        <div className="divide-y divide-neutral-800 max-h-[400px] overflow-y-auto custom-scrollbar flex-1">
                            {loading && news.length === 0 && (
                                <div className="p-8 text-center text-gray-500">
                                    <RefreshCcw className="w-6 h-6 animate-spin mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">Loading Live Wire...</p>
                                </div>
                            )}
                            {!loading && news.length === 0 && (
                                <div className="p-8 text-center text-gray-500">
                                    <Newspaper className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                    <p className="text-sm">No breaking news available.</p>
                                    <p className="text-xs mt-1 opacity-50">Check connection or API limit.</p>
                                </div>
                            )}
                            {news.map((item, idx) => (
                                <div key={idx} className="p-4 hover:bg-neutral-800/30 transition-colors group">
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <button
                                                    onClick={() => onTickerSelect?.(item.symbol)}
                                                    className="text-xs font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded hover:bg-blue-400/20 transition-colors cursor-pointer"
                                                >
                                                    {item.symbol}
                                                </button>
                                                <span className="text-xs text-gray-500">{new Date(item.publishedDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <a
                                                href={item.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sm font-medium text-gray-200 group-hover:text-blue-400 transition-colors leading-snug hover:underline block"
                                            >
                                                {item.title}
                                            </a>
                                        </div>
                                        {item.image && (
                                            <img src={item.image} alt="" className="w-16 h-16 object-cover rounded-md opacity-70 group-hover:opacity-100 transition-opacity" />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column: Data Terminals (Width 5) */}
                <div className="lg:col-span-5 space-y-6">
                    {/* Sector Watchlists */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* AI Sector */}
                        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden">
                            <div className="p-3 border-b border-neutral-800 bg-neutral-900/80 flex items-center gap-2">
                                <Cpu className="w-4 h-4 text-green-400" />
                                <span className="text-sm font-bold text-gray-300">AI & Semis</span>
                            </div>
                            <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
                                {aiSector.map(renderTickerRow)}
                            </div>
                        </div>

                        {/* Crypto Sector */}
                        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden">
                            <div className="p-3 border-b border-neutral-800 bg-neutral-900/80 flex items-center gap-2">
                                <Bitcoin className="w-4 h-4 text-orange-400" />
                                <span className="text-sm font-bold text-gray-300">Crypto Plays</span>
                            </div>
                            <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
                                {cryptoSector.map(renderTickerRow)}
                            </div>
                        </div>

                        {/* Cloud Sector */}
                        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden">
                            <div className="p-3 border-b border-neutral-800 bg-neutral-900/80 flex items-center gap-2">
                                <Cloud className="w-4 h-4 text-blue-400" />
                                <span className="text-sm font-bold text-gray-300">Cloud & SaaS</span>
                            </div>
                            <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
                                {cloudSector.map(renderTickerRow)}
                            </div>
                        </div>

                        {/* Top Movers */}
                        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden">
                            <div className="p-3 border-b border-neutral-800 bg-neutral-900/80 flex items-center gap-2">
                                <Activity className="w-4 h-4 text-purple-400" />
                                <span className="text-sm font-bold text-gray-300">Active Movers</span>
                            </div>
                            <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
                                {movers.map(renderTickerRow)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
};

export default NewsTerminal;
