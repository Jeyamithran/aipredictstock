// AI Predict Pro v1.1 - Interactive Trading Assistant

import React, { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, Search, Activity, Settings, Calculator, Cpu, RefreshCcw, Trash2, Clock, Zap, Shield, Plus, BarChart3, MousePointerClick, Target, Ban, MessageCircle, ArrowUpRight, ArrowDownRight, ThumbsUp, ThumbsDown, TrendingDown } from 'lucide-react';
import { StockChart } from './components/StockChart';
import { ScriptViewer } from './components/ScriptViewer';
import { SignalFeed } from './components/SignalFeed';
import { AIChatPanel } from './components/AIChatPanel';
import RiskCalculator from './components/RiskCalculator';
import FundamentalTabs from './components/FundamentalTabs';
import NewsTerminal from './components/NewsTerminal';
import { Position1326Tab } from './components/Position1326Tab';
import { UnusualRadarTab } from './components/UnusualRadarTab';
import { UnusualOptionsTab } from './components/UnusualOptionsTab';
import ShortInterestPage from './components/ShortInterestPage';
import ODTEDashboard from './components/ODTEDashboard';
import HttpAuth from './components/HttpAuth';
import { analyzeStockWithOptionsAI } from './services/geminiService';
import { saveFeedback } from './services/feedbackService';
import {
    getFMPQuotes,
    getHistoricalCandles,
    calculateSupertrend,
    getStockChartData,
    calculateVWAP,
    calculateEMA,
    calculateATR,
    fetchTickerNews,
    fetchTickerInsiderTrades,
    fetchMarketContext,
    fetchAnalystRatings,
    fetchSMA,
    fetchEMA,
    fetchADX
} from './services/fmpService';
import { StockData, ChartPoint, StockNews, InsiderTrade, SMAData, AnalysisResult, TradeSignal, ChatContext, SignalType, MarketContext, AnalystRating, EMAData, ADXData } from './types';
import ScannerDashboard from './components/Scanner/ScannerDashboard';
import { WATCHLIST_TICKERS } from './constants';
import { MetricCard } from './components/MetricCard';


import { OptionsFlow } from './components/OptionsFlow';
import { MarketPulse } from './components/MarketPulse';
import { OptionDecisionEngine } from './components/OptionDecisionEngine';

const App: React.FC = () => {
    const [stocks, setStocks] = useState<StockData[]>([]);
    const [selectedStock, setSelectedStock] = useState<StockData | null>(null);
    const [chartData, setChartData] = useState<ChartPoint[]>([]);
    const [chartError, setChartError] = useState<string | null>(null);
    const [aiAnalysis, setAiAnalysis] = useState<AnalysisResult | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [usingRealData, setUsingRealData] = useState(false);

    // View Mode State
    const [viewMode, setViewMode] = useState<'chart' | 'options' | 'gpt' | 'finder'>('chart');
    const [feedbackGiven, setFeedbackGiven] = useState(false);

    const handleFeedback = (rating: 'POSITIVE' | 'NEGATIVE') => {
        if (!selectedStock || !aiAnalysis?.optionsStrategy) return; // Added optional chaining for aiAnalysis

        saveFeedback(
            selectedStock.ticker,
            aiAnalysis.optionsStrategy,
            rating
        );
        setFeedbackGiven(true);
    };

    // Signal Feed State
    const [signalHistory, setSignalHistory] = useState<TradeSignal[]>([]);

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    // Watchlist State (Single source of truth)
    const [watchlist, setWatchlist] = useState<string[]>([]);

    const [isLoadingData, setIsLoadingData] = useState(false);
    const [dataError, setDataError] = useState<string | null>(null);
    const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

    // Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatContext, setChatContext] = useState<ChatContext | null>(null);

    const technicalsRef = useRef<HTMLDivElement>(null);

    // Chart Timeframe State
    const [timeframe, setTimeframe] = useState<'1min' | '5min' | '15min' | '30min' | '1hour' | '4hour'>('15min');
    const [smaData, setSmaData] = useState<SMAData[]>([]);
    const [emaData, setEmaData] = useState<EMAData[]>([]);
    const [adxData, setAdxData] = useState<ADXData[]>([]);


    // Tab State
    const [activeTab, setActiveTab] = useState<'dashboard' | 'scanner' | 'news' | 'position' | 'radar' | 'short' | 'odte'>('scanner');
    const [watchlistSort, setWatchlistSort] = useState<'default' | 'bullish' | 'bearish'>('default');


    // Initial Data Load
    useEffect(() => {
        const savedKey = localStorage.getItem('fmp_api_key');
        const savedWatchlistStr = localStorage.getItem('user_watchlist');
        const savedSignalsStr = localStorage.getItem('trade_signal_history');

        let initialWatchlist: string[] = [];

        if (savedWatchlistStr) {
            initialWatchlist = JSON.parse(savedWatchlistStr);
        } else {
            // Seed with defaults if empty
            initialWatchlist = [...WATCHLIST_TICKERS];
            localStorage.setItem('user_watchlist', JSON.stringify(initialWatchlist));
        }

        if (savedSignalsStr) {
            setSignalHistory(JSON.parse(savedSignalsStr));
        }

        setWatchlist(initialWatchlist);



        // DEBUG: Check environment variables (Runtime & Build-time)
        const runtimeEnv = (window as any).env || {};
        const viteEnv = (import.meta as any).env;

        // Load data using environment API key (Runtime env, Vite env, Node env, or saved key)
        if (savedKey || runtimeEnv.VITE_FMP_API_KEY || viteEnv.VITE_FMP_API_KEY || (typeof process !== 'undefined' && process.env?.FMP_API_KEY)) {
            fetchRealData(initialWatchlist);
        }
    }, []);

    // Live Polling: Refresh data every 60 seconds if we have real data
    useEffect(() => {
        if (!usingRealData || !selectedStock || watchlist.length === 0) return;

        const interval = setInterval(() => {
            // 1. Update quotes for current watchlist
            getFMPQuotes(watchlist).then(updatedStocks => {
                if (updatedStocks && updatedStocks.length > 0) {
                    setStocks(updatedStocks);
                    // Update selected stock reference to keep UI fresh
                    setStocks(prev => {
                        const updatedSelected = updatedStocks.find(s => s.ticker === selectedStock.ticker);
                        if (updatedSelected) setSelectedStock(updatedSelected);
                        return updatedStocks;
                    });
                }
            }).catch(err => console.error("Auto-refresh quote failed", err));

            // 2. Update Chart (Candles might close)
            getStockChartData(selectedStock.ticker, timeframe).then(data => {
                if (data.length > 0) {
                    setChartData(data);
                    setChartError(null);
                }
            }).catch(err => {
                console.error("Auto-refresh chart failed", err);
                setChartError(err.message);
            });

            setLastRefreshed(new Date());

        }, 60000); // 60 seconds

        return () => clearInterval(interval);
    }, [usingRealData, selectedStock, watchlist, timeframe]);

    const fetchRealData = async (tickersToFetch: string[]) => {
        if (tickersToFetch.length === 0) {
            setStocks([]);
            setUsingRealData(true); // technically true, just empty
            return;
        }

        setIsLoadingData(true);
        setDataError(null);

        try {
            const realStocks = await getFMPQuotes(tickersToFetch);
            if (realStocks && realStocks.length > 0) {
                setStocks(realStocks);
                // Keep selected if available, else reset
                if (selectedStock) {
                    const current = realStocks.find(s => s.ticker === selectedStock.ticker);
                    setSelectedStock(current || realStocks[0]);
                } else {
                    setSelectedStock(realStocks[0]);
                }
                setUsingRealData(true);
                setLastRefreshed(new Date());
            } else {
                setStocks([]);
                setUsingRealData(false);
            }
        } catch (err: any) {
            console.error("FMP Fetch Error:", err);
            setUsingRealData(false);
            setStocks([]);

            let msg = err.message || "Failed to connect";

            if (msg.includes("Legacy Endpoint")) {
                msg = "Upgrade FMP Plan (Legacy Endpoint)";
            } else if (msg.includes("Invalid API KEY")) {
                msg = "Invalid FMP API Key";
            } else if (msg.includes("Limit Reach")) {
                msg = "API Rate Limit Reached";
            } else if (msg.includes("403")) {
                msg = "Access Denied (403)";
            } else if (msg.includes("404")) {
                msg = "Data Not Found (404)";
            }

            setDataError(msg);
        } finally {
            setIsLoadingData(false);
        }
    };

    const handleAddStock = async () => {
        const ticker = searchQuery.toUpperCase().trim();
        if (!ticker) return;

        // Check if already in watchlist (local state check)
        if (watchlist.includes(ticker)) {
            setSearchQuery('');
            const existing = stocks.find(s => s.ticker === ticker);
            if (existing) setSelectedStock(existing);
            else {
                // It's in watchlist but maybe fetch failed earlier, try refetching all
                fetchRealData(watchlist);
            }
            return;
        }

        setIsSearching(true);

        try {
            const newStocks = await getFMPQuotes([ticker]);
            if (newStocks && newStocks.length > 0) {
                const newStock = newStocks[0];

                // Update State
                const updatedWatchlist = [ticker, ...watchlist];
                setWatchlist(updatedWatchlist);
                setStocks(prev => [newStock, ...prev]);
                setSelectedStock(newStock);

                // Persist
                localStorage.setItem('user_watchlist', JSON.stringify(updatedWatchlist));

                setSearchQuery('');
            } else {
                alert("Symbol not found or API error. Please check ticker and try again.");
            }
        } catch (e) {
            alert("Failed to fetch symbol. Check API Key.");
        } finally {
            setIsSearching(false);
        }
    };

    const handleRemoveStock = (tickerToRemove: string) => {
        const updatedWatchlist = watchlist.filter(t => t !== tickerToRemove);
        setWatchlist(updatedWatchlist);
        setStocks(prev => prev.filter(s => s.ticker !== tickerToRemove));
        localStorage.setItem('user_watchlist', JSON.stringify(updatedWatchlist));

        if (selectedStock?.ticker === tickerToRemove) {
            // If we removed the selected stock, select the first one available, or null
            const remaining = stocks.filter(s => s.ticker !== tickerToRemove);
            setSelectedStock(remaining.length > 0 ? remaining[0] : null);
            if (remaining.length === 0) {
                setChartData([]);
                setAiAnalysis(null);
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleAddStock();
        }
    };

    // Chart Data Load
    useEffect(() => {
        const loadChart = async () => {
            if (!selectedStock) return;

            setChartData([]); // Reset chart
            setChartError(null);
            setSmaData([]); // Reset SMA data
            setEmaData([]); // Reset EMA data
            setAdxData([]); // Reset ADX data

            try {
                const [realHistory, smaRes, emaRes, adxRes] = await Promise.all([
                    getStockChartData(selectedStock.ticker, timeframe),
                    fetchSMA(selectedStock.ticker, 10, timeframe),
                    fetchEMA(selectedStock.ticker, 10, timeframe),
                    fetchADX(selectedStock.ticker, 10, timeframe)
                ]);

                if (realHistory.length > 0) {
                    setChartData(realHistory);
                }
                setSmaData(smaRes);
                setEmaData(emaRes);
                setAdxData(adxRes);
            } catch (e: any) {
                console.error("Chart Fetch Error", e);
                setChartError(e.message || "Failed to load chart");
            }
        };

        loadChart();
    }, [selectedStock, timeframe]); // Add timeframe dependency

    // Calculate Indicators from Chart Data
    const indicators = React.useMemo(() => {
        if (!chartData || chartData.length === 0) return null;

        // Map ChartPoint to FMPCandle format
        const candles = chartData.map(p => ({
            date: p.time,
            open: p.open || 0,
            high: p.high || 0,
            low: p.low || 0,
            close: p.close || 0,
            volume: p.volume || 0
        }));

        const vwap = calculateVWAP(candles);
        const ema9 = calculateEMA(candles, 9);
        const ema20 = calculateEMA(candles, 20);
        const atr = calculateATR(candles, 14);

        return { vwap, ema9, ema20, atr };
    }, [chartData]);

    const sortedStocks = React.useMemo(() => {
        let result = [...stocks];
        if (watchlistSort === 'bullish') {
            return result.sort((a, b) => (b.score || 0) - (a.score || 0)); // High score first
        } else if (watchlistSort === 'bearish') {
            return result.sort((a, b) => (a.score || 0) - (b.score || 0)); // Low score first
        }
        return result; // Default (chronological add order)
    }, [stocks, watchlistSort]);


    const handleAnalyze = async () => {
        if (!selectedStock) return;
        setAnalyzing(true);

        try {
            // Initialize analysis result with loading state
            setAiAnalysis({
                ticker: selectedStock.ticker,
                perplexityResearch: undefined,
                analysis: '',
                optionsStrategy: '',
                tradeSetup: null,
                loading: true
            });

            // STAGE 1: Perplexity Research
            let perplexityResearch = '';
            try {
                const { analyzeStockWithPerplexity } = await import('./services/perplexityService');

                const news = await fetchTickerNews(selectedStock.ticker);
                const insider = await fetchTickerInsiderTrades(selectedStock.ticker);
                const market = await fetchMarketContext();
                const ratings = await fetchAnalystRatings(selectedStock.ticker);

                perplexityResearch = await analyzeStockWithPerplexity(
                    selectedStock.ticker,
                    selectedStock,
                    news,
                    insider,
                    market,
                    ratings
                );
            } catch (error) {
                perplexityResearch = 'Perplexity research unavailable.';
                setAiAnalysis(prev => ({
                    ...prev,
                    perplexityResearch: 'Research unavailable (Perplexity API error)',
                    loading: true
                }));
            }

            // Fetch full history to calculate Supertrend properly
            let supertrend = null;
            try {
                const candles = await getHistoricalCandles(selectedStock.ticker);
                supertrend = calculateSupertrend(candles);
            } catch (e) {
                console.warn("Failed to calc supertrend", e);
            }

            // STAGE 2: Gemini Strategy Synthesis (with Perplexity context)

            // POLYGON.IO DATA OVERRIDE
            // User Request: "lets use polygon io" for the analysis source of truth.
            let analysisStock = { ...selectedStock };
            try {
                const { fetchPolygonStockSnapshot } = await import('./services/polygonService');
                const polygonSnapshot = await fetchPolygonStockSnapshot(selectedStock.ticker);

                if (polygonSnapshot && polygonSnapshot.lastTrade) {
                    console.log("Using Polygon.io Snapshot for Analysis:", polygonSnapshot);
                    analysisStock = {
                        ...analysisStock,
                        price: polygonSnapshot.lastTrade.p,
                        changePercent: polygonSnapshot.todaysChangePerc,
                        volume: polygonSnapshot.day.v,
                        lastDataTimestamp: polygonSnapshot.updated / 1000000 // Nanoseconds to Milliseconds
                    };
                    // Append a note to the perplexity research or analysis context to confirm source
                    perplexityResearch = (perplexityResearch || '') + `\n\n[DATA SOURCE NOTE]: Analysis using REAL-TIME PRICE from POLYGON.IO: $${analysisStock.price} `;
                }
            } catch (err) {
                console.warn("Polygon Snapshot Failed, falling back to FMP for analysis price.", err);
            }

            const geminiResult = await analyzeStockWithOptionsAI(analysisStock, supertrend, perplexityResearch);

            // STAGE 3: OpenAI "Chief Risk Officer" Review (Magistrate Architecture)
            setAiAnalysis(prev => ({
                ...prev,
                analysis: geminiResult.analysis + "\n\n⚠️ Sending to Chief Risk Officer (OpenAI) for final validation...",
                loading: true
            }));

            const { finalizeStrategyWithOpenAI } = await import('./services/openaiService');
            const finalVerdict = await finalizeStrategyWithOpenAI(
                analysisStock.ticker,
                analysisStock.price,
                geminiResult
            );

            // Synthesize Final Output for UI
            const magistrateAnalysis = `
### 🏛️ CHIEF RISK OFFICER VERDICT: ${finalVerdict.outcome}

${finalVerdict.final_analysis}

** Risk Assessment **:
${finalVerdict.risk_assessment}

---
** Analyst Report(Gemini) **:
${geminiResult.analysis}
`;

            // Map structured strategy to UI format
            const finalStrategyText = `
    ** Decision **: ${finalVerdict.approved_strategy.action}
** Contracts **: ${finalVerdict.approved_strategy.contracts}
** Entry **: ${finalVerdict.approved_strategy.entry_zone}
** Confidence **: ${finalVerdict.approved_strategy.confidence}%

** Stop Loss **: ${finalVerdict.approved_strategy.stop_loss}
** Take Profit **: ${finalVerdict.approved_strategy.take_profit_1} / ${finalVerdict.approved_strategy.take_profit_2}
`;

            setAiAnalysis({
                ticker: selectedStock.ticker,
                perplexityResearch: perplexityResearch,
                analysis: magistrateAnalysis,
                optionsStrategy: finalStrategyText,
                tradeSetup: {
                    entry: finalVerdict.approved_strategy.entry_zone,
                    target: finalVerdict.approved_strategy.take_profit_1,
                    stopLoss: finalVerdict.approved_strategy.stop_loss
                },
                loading: false,
                lastUpdated: new Date()
            });

            setAnalyzing(false);

            // Add to Signal History if valid trade approved
            if (finalVerdict.approved_strategy.action !== "WAIT") {
                const newSignal: TradeSignal = {
                    id: crypto.randomUUID(),
                    timestamp: Date.now(),
                    ticker: selectedStock.ticker,
                    mode: 'Options',
                    analysisType: 'MagistrateAI',
                    signal: finalVerdict.approved_strategy.action.includes('CALL') ? 'BUY' : 'SELL', // Simplified mapping
                    entry: finalVerdict.approved_strategy.entry_zone,
                    stopLoss: finalVerdict.approved_strategy.stop_loss,
                    target: finalVerdict.approved_strategy.take_profit_1,
                    rr: '1:2', // Hardcoded goal per rules
                    confidence: finalVerdict.approved_strategy.confidence
                };

                const updatedHistory = [newSignal, ...signalHistory].slice(0, 50);
                setSignalHistory(updatedHistory);
                localStorage.setItem('trade_signal_history', JSON.stringify(updatedHistory));
            }

        } catch (error) {
            console.error('Analysis failed:', error);
            setAnalyzing(false);
            setAiAnalysis(prev => ({
                ...prev,
                analysis: 'Analysis failed. Please try again.',
                loading: false
            }));
        }
    };

    const clearSignalHistory = () => {
        setSignalHistory([]);
        localStorage.removeItem('trade_signal_history');
    };

    const getSignalBadge = (signal: SignalType) => {
        switch (signal) {
            case SignalType.STRONG_BUY:
                return <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/50">STRONG BUY</span>;
            case SignalType.BUY:
                return <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">BUY</span>;
            case SignalType.STRONG_SELL:
                return <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/50">STRONG SELL</span>;
            case SignalType.SELL:
                return <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">SELL</span>;
            default:
                return <span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-500/10 text-gray-400 border border-gray-500/30">NEUTRAL</span>;
        }
    };

    // Determine data latency status
    const getDataStatus = () => {
        // If no data timestamp, we assume unknown/delayed
        if (!selectedStock || !selectedStock.lastDataTimestamp) {
            return (
                <span className="flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-900/50 px-2 py-0.5 rounded border border-gray-800">
                    <Clock className="w-3 h-3" />
                    Status Unknown
                </span>
            );
        }

        const now = Date.now();
        const diffMinutes = Math.floor((now - selectedStock.lastDataTimestamp) / 60000);

        // If diff is small (< 2 mins), assume Realtime
        if (diffMinutes < 2) {
            return (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-500/20 animate-pulse">
                    <Zap className="w-3 h-3 fill-current" />
                    Realtime
                </span>
            );
        } else if (selectedStock.isAfterHours) {
            return (
                <span className="flex items-center gap-1 text-xs font-medium text-purple-400 bg-purple-950/50 px-2 py-0.5 rounded border border-purple-500/20">
                    <Clock className="w-3 h-3" />
                    After Hours
                </span>
            );
        } else {
            return (
                <span className="flex items-center gap-1 text-xs font-medium text-orange-400 bg-orange-950/50 px-2 py-0.5 rounded border border-orange-500/20">
                    <Clock className="w-3 h-3" />
                    Delayed {diffMinutes}m
                </span>
            );
        }
    };

    const scrollToTechnicals = () => {
        // Scroll to technicals section on mobile/tablet
        if (window.innerWidth < 1024 && technicalsRef.current) {
            setTimeout(() => {
                technicalsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    };

    const handleWatchlistSelect = (stock: StockData) => {
        setSelectedStock(stock);
        scrollToTechnicals();
    };

    const handleScannerTickerSelect = async (ticker: string) => {
        // 1. Switch tab first
        setActiveTab('dashboard');

        // 2. Check if in watchlist/stocks already
        const existing = stocks.find(s => s.ticker.toUpperCase() === ticker.toUpperCase());
        if (existing) {
            setSelectedStock(existing);
        } else {
            // 3. If not, fetch it
            setIsSearching(true);
            try {
                const newStocks = await getFMPQuotes([ticker]);
                if (newStocks && newStocks.length > 0) {
                    const newStock = newStocks[0];
                    setStocks(prev => [newStock, ...prev]);
                    setSelectedStock(newStock);
                    // Optional: Add to watchlist automatically? 
                    // For now, just show it. User can add it if they want.
                }
            } catch (e) {
                console.error("Failed to load scanner ticker", e);
            } finally {
                setIsSearching(false);
            }
        }

        scrollToTechnicals();
    };

    return (
        <HttpAuth>
            <div className="min-h-screen bg-[#050505] text-gray-300 p-4 md:p-8 relative">


                <div className="max-w-7xl mx-auto">
                    {/* Header */}
                    <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                        <div className="flex items-center gap-3">
                            <div className="bg-purple-600 p-2 rounded-lg">
                                <Cpu className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-white tracking-tight">AI Predict Pro</h1>
                                <p className="text-xs text-purple-400 font-mono">DAYTRADE DASHBOARD // OPTIONS EDITION</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            {isLoadingData ? (
                                <span className="flex items-center gap-1 text-blue-400 bg-blue-400/10 px-2 py-1 rounded border border-blue-400/20">
                                    <RefreshCcw className="w-3 h-3 animate-spin" />
                                    Syncing...
                                </span>
                            ) : (
                                <span className="flex items-center gap-1 text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded border border-emerald-400/20">
                                    <Activity className="w-3 h-3" />
                                    Live Feed <span className="text-[10px] opacity-50 ml-1">({lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>
                                </span>
                            )}
                            <div className="hidden md:flex items-center gap-2 text-sm text-gray-500">
                                <Shield className="w-4 h-4" />
                                <span>Regular Session</span>
                            </div>
                        </div>
                    </header>

                    <div className="flex justify-center mb-8">
                        <div className="bg-neutral-900 p-1 rounded-full border border-neutral-800 flex gap-1">
                            <button
                                onClick={() => setActiveTab('dashboard')}
                                className={"px-6 py-2 rounded-full text-sm font-medium transition-all " + (activeTab === 'dashboard'
                                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5')}>
                                <div className="flex items-center gap-2">
                                    <LayoutDashboard size={16} />
                                    Dashboard
                                </div>
                            </button>
                            <button
                                onClick={() => setActiveTab('scanner')}
                                className={"px-6 py-2 rounded-full text-sm font-medium transition-all " + (activeTab === 'scanner'
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5')}
                            >
                                <div className="flex items-center gap-2">
                                    <Search size={16} />
                                    AI Scanner
                                </div>
                            </button>
                            <button
                                onClick={() => setActiveTab('news')}
                                className={"px-6 py-2 rounded-full text-sm font-medium transition-all " + (activeTab === 'news'
                                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5')}
                            >
                                <div className="flex items-center gap-2">
                                    <Activity size={16} />
                                    News Terminal
                                </div>
                            </button>
                            <button
                                onClick={() => setActiveTab('position')}
                                className={"px-6 py-2 rounded-full text-sm font-medium transition-all " + (activeTab === 'position'
                                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5')}
                            >
                                <div className="flex items-center gap-2">
                                    <Calculator size={16} />
                                    Position Sizing
                                </div>
                            </button>
                            <button
                                onClick={() => setActiveTab('radar')}
                                className={"px-6 py-2 rounded-full text-sm font-medium transition-all " + (activeTab === 'radar'
                                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5')}
                            >
                                <div className="flex items-center gap-2">
                                    <Zap size={16} />
                                    Unusual Radar
                                </div>
                            </button>

                            <button
                                onClick={() => setActiveTab('short')}
                                className={"px-6 py-2 rounded-full text-sm font-medium transition-all " + (activeTab === 'short'
                                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5')}
                            >
                                <div className="flex items-center gap-2">
                                    <TrendingDown size={16} />
                                    Short Interest
                                </div>
                            </button>
                            <button
                                onClick={() => setActiveTab('odte')}
                                className={"px-6 py-2 rounded-full text-sm font-medium transition-all " + (activeTab === 'odte'
                                    ? 'bg-yellow-600 text-white shadow-lg shadow-yellow-600/20'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5')}
                            >
                                <div className="flex items-center gap-2">
                                    <Zap size={16} />
                                    0DTE Dashboard
                                </div>
                            </button>
                        </div>
                    </div>

                    {
                        activeTab === 'scanner' ? (
                            <ScannerDashboard onTickerSelect={handleScannerTickerSelect} />
                        ) : activeTab === 'news' ? (
                            <NewsTerminal onTickerSelect={handleScannerTickerSelect} />
                        ) : activeTab === 'position' ? (
                            <Position1326Tab />
                        ) : activeTab === 'radar' ? (
                            <UnusualRadarTab
                                onTickerSelect={handleScannerTickerSelect}
                                onAiExplain={(context) => {
                                    setViewMode('gpt');
                                    setActiveTab('dashboard');
                                    console.log("AI Explain Context:", context);
                                    alert(`AI Analysis Requested: \n\n${context} \n\n(Navigating to Chat...) \n\nNote: Context injection to Chat is currently pending v1.2.`);
                                }}
                            />
                        ) : activeTab === 'short' ? (
                            <ShortInterestPage onTickerSelect={handleScannerTickerSelect} />
                        ) : activeTab === 'odte' ? (
                            <ODTEDashboard onTickerSelect={handleScannerTickerSelect} />
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                <div className="lg:col-span-4 space-y-6">
                                    {/* Search Bar */}
                                    <div className="relative flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                            <input
                                                type="text"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                onKeyDown={handleKeyDown}
                                                placeholder="Add symbol (e.g. COIN)"
                                                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg py-2.5 pl-9 pr-3 text-sm text-white focus:border-purple-500 focus:outline-none transition-colors"
                                            />
                                        </div>
                                        <button
                                            onClick={handleAddStock}
                                            disabled={isSearching || !searchQuery}
                                            className="bg-neutral-800 hover:bg-neutral-700 text-white p-2.5 rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            {isSearching ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                        </button>
                                    </div>

                                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden">
                                        <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                                            <h3 className="text-sm font-semibold text-gray-200">Active Watchlist</h3>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => setWatchlistSort(prev => prev === 'bullish' ? 'default' : 'bullish')}
                                                    className={`p - 1 rounded hover: bg - neutral - 800 transition - colors ${watchlistSort === 'bullish' ? 'text-emerald-400 bg-emerald-400/10' : 'text-gray-500'} `}
                                                    title="Sort Bullish"
                                                >
                                                    <ArrowUpRight size={14} />
                                                </button>
                                                <button
                                                    onClick={() => setWatchlistSort(prev => prev === 'bearish' ? 'default' : 'bearish')}
                                                    className={`p - 1 rounded hover: bg - neutral - 800 transition - colors ${watchlistSort === 'bearish' ? 'text-rose-400 bg-rose-400/10' : 'text-gray-500'} `}
                                                    title="Sort Bearish"
                                                >
                                                    <ArrowDownRight size={14} />
                                                </button>
                                                <div className="w-px h-3 bg-neutral-800 mx-1"></div>
                                                <BarChart3 className="w-4 h-4 text-gray-500" />
                                            </div>
                                        </div>
                                        <div className="divide-y divide-neutral-800 max-h-[500px] overflow-y-auto">
                                            {sortedStocks.map((stock) => {
                                                const isSelected = selectedStock?.ticker === stock.ticker;
                                                const safeChange = stock.changePercent || 0;
                                                const safeScore = stock.score || 0;
                                                const safeConf = stock.confidence || 0;

                                                return (
                                                    <div
                                                        key={stock.ticker}
                                                        onClick={() => handleWatchlistSelect(stock)}
                                                        className={"group relative p-4 cursor-pointer transition-all hover:bg-white/5 " + (isSelected ? 'bg-white/5 border-l-2 border-purple-500' : '')}
                                                    >
                                                        <div className="flex justify-between items-center mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-white">{stock.ticker}</span>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleRemoveStock(stock.ticker);
                                                                    }}
                                                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500/20 rounded text-gray-500 hover:text-red-400"
                                                                    title="Remove from watchlist"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                                <span className={"text-xs " + (safeChange >= 0 ? 'text-green-400' : 'text-red-400')}>
                                                                    {safeChange > 0 ? '+' : ''}{safeChange.toFixed(2)}%
                                                                </span>
                                                            </div>
                                                            {getSignalBadge(stock.signal)}
                                                        </div>
                                                        <div className="flex justify-between text-xs text-gray-500">
                                                            <span>Score: <span className={safeScore > 0 ? 'text-green-400' : 'text-red-400'}>{safeScore.toFixed(1)}</span></span>
                                                            <span>Conf: {(safeConf * 100).toFixed(0)}%</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {stocks.length === 0 && !isLoadingData && (
                                                <div className="p-6 text-center text-gray-500 text-sm">
                                                    Watchlist is empty. <br /> Add a stock above.
                                                </div>
                                            )}
                                        </div>
                                    </div>



                                    {selectedStock && (
                                        <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border border-purple-500/30 rounded-xl p-6">
                                            <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                                                <Zap className="w-4 h-4 text-yellow-400" />
                                                AI Options Insight
                                            </h3>
                                            <p className="text-sm text-gray-400 mb-4">
                                                Use Gemini 3.0 Pro to analyze {selectedStock.ticker}'s technical setup and generate an options strategy.
                                            </p>
                                            <button
                                                onClick={handleAnalyze}
                                                disabled={analyzing}
                                                className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 flex justify-center items-center gap-2"
                                            >
                                                {analyzing ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                                {analyzing ? 'Thinking...' : 'Generate Strategy'}
                                            </button>

                                            {aiAnalysis && aiAnalysis.ticker === selectedStock.ticker && (
                                                <div className="mt-4 space-y-3 animate-fade-in">
                                                    {/* Perplexity Research Section */}
                                                    {aiAnalysis.perplexityResearch && (
                                                        <div className="bg-gradient-to-br from-indigo-900/30 to-purple-900/30 p-4 rounded-lg border border-indigo-500/30">
                                                            <h4 className="text-sm font-bold mb-2 flex items-center gap-2 text-indigo-300">
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                                </svg>
                                                                Perplexity Deep Research
                                                            </h4>
                                                            <div className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar">
                                                                {aiAnalysis.perplexityResearch}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Gemini Strategy Section */}
                                                    <div className="bg-neutral-900/80 p-3 rounded-lg border border-purple-500/20">
                                                        <h4 className="text-xs font-bold mb-1 flex items-center gap-2 text-purple-300">
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                                            </svg>
                                                            Gemini Technical Analysis
                                                        </h4>
                                                        <p className="text-xs text-gray-300 leading-relaxed">{aiAnalysis.analysis}</p>
                                                    </div>

                                                    <div className="bg-neutral-900/80 p-3 rounded-lg border border-blue-500/20">
                                                        <h4 className="text-xs font-bold mb-1 flex items-center gap-2 text-blue-300">
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                            </svg>
                                                            Trading Strategy
                                                        </h4>
                                                        <p className="text-sm text-white font-mono">{aiAnalysis.optionsStrategy}</p>
                                                    </div>

                                                    {/* Trade Setup Section */}
                                                    <div className="grid grid-cols-3 gap-2 mt-2">
                                                        <div className="bg-blue-500/10 border border-blue-500/30 p-2 rounded text-center">
                                                            <div className="flex justify-center mb-1"><MousePointerClick className="w-3 h-3 text-blue-400" /></div>
                                                            <div className="text-[10px] text-gray-400 uppercase font-bold">Entry</div>
                                                            <div className="text-xs text-white font-mono font-bold">{aiAnalysis.tradeSetup?.entry}</div>
                                                        </div>
                                                        <div className="bg-emerald-500/10 border border-emerald-500/30 p-2 rounded text-center">
                                                            <div className="flex justify-center mb-1"><Target className="w-3 h-3 text-emerald-400" /></div>
                                                            <div className="text-[10px] text-gray-400 uppercase font-bold">Target</div>
                                                            <div className="text-xs text-white font-mono font-bold">{aiAnalysis.tradeSetup?.target}</div>
                                                        </div>
                                                        <div className="bg-rose-500/10 border border-rose-500/30 p-2 rounded text-center">
                                                            <div className="flex justify-center mb-1"><Ban className="w-3 h-3 text-rose-400" /></div>
                                                            <div className="text-[10px] text-gray-400 uppercase font-bold">Stop</div>
                                                            <div className="text-xs text-white font-mono font-bold">{aiAnalysis.tradeSetup?.stopLoss}</div>
                                                        </div>
                                                    </div>

                                                    {/* Feedback Section */}
                                                    <div className="flex gap-2 mt-3">
                                                        {!feedbackGiven ? (
                                                            <>
                                                                <button
                                                                    onClick={() => handleFeedback('POSITIVE')}
                                                                    className="flex-1 py-1.5 bg-emerald-900/30 hover:bg-emerald-900/50 border border-emerald-500/30 rounded text-emerald-400 text-xs font-bold transition-all flex justify-center items-center gap-2"
                                                                >
                                                                    <ThumbsUp className="w-3 h-3" />
                                                                    Good Strategy
                                                                </button>
                                                                <button
                                                                    onClick={() => handleFeedback('NEGATIVE')}
                                                                    className="flex-1 py-1.5 bg-rose-900/30 hover:bg-rose-900/50 border border-rose-500/30 rounded text-rose-400 text-xs font-bold transition-all flex justify-center items-center gap-2"
                                                                >
                                                                    <ThumbsDown className="w-3 h-3" />
                                                                    Bad Strategy
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <div className="w-full py-1.5 bg-neutral-800 rounded text-gray-400 text-xs text-center border border-neutral-700">
                                                                Thanks for your feedback!
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Ask Follow-up Button */}
                                                    <button
                                                        onClick={() => {
                                                            setChatContext({
                                                                ticker: selectedStock.ticker,
                                                                currentPrice: selectedStock.price,
                                                                changePercent: selectedStock.changePercent,
                                                                analysis: aiAnalysis.analysis,
                                                                strategy: aiAnalysis.optionsStrategy,
                                                                tradeSetup: aiAnalysis.tradeSetup || undefined
                                                            });
                                                            setIsChatOpen(true);
                                                        }}
                                                        className="w-full mt-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-all flex justify-center items-center gap-2"
                                                    >
                                                        <MessageCircle className="w-4 h-4" />
                                                        Ask Follow-up Question
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Main Content */}
                                <div ref={technicalsRef} className="lg:col-span-8 space-y-6">

                                    {selectedStock ? (
                                        <>
                                            {/* Ticker Header */}
                                            <div className="flex justify-between items-end mb-2">
                                                <div>
                                                    <div className="flex items-center gap-3">
                                                        <h2 className="text-4xl font-bold text-white">{selectedStock.ticker}</h2>
                                                        {/* Data Latency Badge */}
                                                        {getDataStatus()}
                                                    </div>
                                                    <div className="flex items-center gap-4 mt-1">
                                                        <span className="text-2xl text-gray-300">${(selectedStock.price || 0).toFixed(2)}</span>
                                                        <span className={"text-lg font-medium " + ((selectedStock.changePercent || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                                                            {(selectedStock.changePercent || 0) > 0 ? '+' : ''}{(selectedStock.changePercent || 0).toFixed(2)}%
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    {getSignalBadge(selectedStock.signal)}
                                                </div>
                                            </div>

                                            {/* Metrics Grid */}
                                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-6">
                                                <MetricCard
                                                    title="AI Score"
                                                    value={(selectedStock.score || 0).toFixed(1)}
                                                    subValue={(selectedStock.score || 0) > 25 ? 'Strong' : (selectedStock.score || 0) < -25 ? 'Weak' : 'Neutral'}
                                                    trend={(selectedStock.score || 0) > 0 ? 'up' : 'down'}
                                                    color={(selectedStock.score || 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}
                                                />
                                                <MetricCard
                                                    title="Volume"
                                                    value={selectedStock.volume > 1000000 ? ((selectedStock.volume / 1000000).toFixed(1) + " M") : selectedStock.volume > 1000 ? ((selectedStock.volume / 1000).toFixed(1) + " K") : selectedStock.volume.toString()}
                                                    subValue={(selectedStock.volumeRatio.toFixed(2) + "x Avg")}
                                                    trend={selectedStock.volumeStrength === 'STRONG' ? 'up' : selectedStock.volumeStrength === 'WEAK' ? 'down' : 'neutral'}
                                                    color={selectedStock.volumeStrength === 'STRONG' ? 'text-emerald-400' : selectedStock.volumeStrength === 'WEAK' ? 'text-rose-400' : 'text-gray-400'}
                                                />

                                                {/* Restored Indicators */}
                                                <MetricCard
                                                    title="RSI (14)"
                                                    value={selectedStock.rsi.toFixed(1)}
                                                    subValue={selectedStock.rsi > 70 ? 'Overbought' : selectedStock.rsi < 30 ? 'Oversold' : 'Neutral'}
                                                    trend={selectedStock.rsi > 50 ? 'up' : 'down'}
                                                    color={selectedStock.rsi > 70 || selectedStock.rsi < 30 ? 'text-orange-400' : 'text-blue-400'}
                                                />
                                                <MetricCard
                                                    title="Trend (ADX)"
                                                    value={selectedStock.trend}
                                                    subValue={"ADX: " + selectedStock.adx.toFixed(1)}
                                                    trend={selectedStock.trend === 'BULL' ? 'up' : selectedStock.trend === 'BEAR' ? 'down' : 'neutral'}
                                                    color={selectedStock.trend === 'BULL' ? 'text-emerald-400' : selectedStock.trend === 'BEAR' ? 'text-rose-400' : 'text-gray-400'}
                                                />
                                                <MetricCard
                                                    title="Smart Money"
                                                    value={selectedStock.smartMoney}
                                                    subValue="Inst. Flow"
                                                    trend={selectedStock.smartMoney === 'BUYING' ? 'up' : selectedStock.smartMoney === 'SELLING' ? 'down' : 'neutral'}
                                                    color={selectedStock.smartMoney === 'BUYING' ? 'text-emerald-400' : selectedStock.smartMoney === 'SELLING' ? 'text-rose-400' : 'text-gray-400'}
                                                />

                                                {/* Aziz Indicators */}
                                                <MetricCard
                                                    title="VWAP Status"
                                                    value={indicators?.vwap ? (selectedStock.price >= indicators.vwap ? 'Above' : 'Below') : 'N/A'}
                                                    subValue={indicators?.vwap ? ("$" + indicators.vwap.toFixed(2)) : '-'}
                                                    trend={indicators?.vwap && selectedStock.price >= indicators.vwap ? 'up' : 'down'}
                                                    color={indicators?.vwap && selectedStock.price >= indicators.vwap ? 'text-emerald-400' : 'text-rose-400'}
                                                />
                                                <MetricCard
                                                    title="9/20 EMA"
                                                    value={indicators?.ema9 && indicators?.ema20 ? (indicators.ema9 > indicators.ema20 ? 'Bullish' : 'Bearish') : 'N/A'}
                                                    subValue={indicators?.ema9 && indicators?.ema20 ? (indicators.ema9 > indicators.ema20 ? '9 > 20' : '9 < 20') : '-'}
                                                    trend={indicators?.ema9 && indicators?.ema20 && indicators.ema9 > indicators.ema20 ? 'up' : 'down'}
                                                    color={indicators?.ema9 && indicators?.ema20 && indicators.ema9 > indicators.ema20 ? 'text-emerald-400' : 'text-rose-400'}
                                                />
                                                <MetricCard
                                                    title="ATR (Vol)"
                                                    value={indicators?.atr ? indicators.atr.toFixed(2) : 'N/A'}
                                                    subValue={indicators?.atr && selectedStock.price ? (((indicators.atr / selectedStock.price) * 100).toFixed(1) + "%") : '-'}
                                                    trend="neutral"
                                                    color="text-blue-400"
                                                />
                                            </div>

                                            {/* View Toggle */}
                                            <div className="flex justify-between items-center mb-4">
                                                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                                    <Activity className="w-5 h-5 text-purple-500" />
                                                    Analysis View
                                                </h3>
                                                <div className="flex bg-neutral-900 rounded-lg p-1 border border-neutral-800">
                                                    <button
                                                        onClick={() => setViewMode('chart')}
                                                        className={"px-3 py-1.5 rounded-md text-xs font-medium transition-all " + (viewMode === 'chart' ? 'bg-neutral-800 text-white shadow-sm' : 'text-gray-400 hover:text-gray-300')}
                                                    >
                                                        Chart
                                                    </button>

                                                    <button
                                                        onClick={() => setViewMode('options')}
                                                        className={"px-3 py-1.5 rounded-md text-xs font-medium transition-all " + (viewMode === 'options' ? 'bg-neutral-800 text-white shadow-sm' : 'text-gray-400 hover:text-gray-300')}
                                                    >
                                                        Options
                                                    </button>
                                                    <button
                                                        onClick={() => setViewMode('gpt')}
                                                        className={"px-3 py-1.5 rounded-md text-xs font-medium transition-all " + (viewMode === 'gpt' ? 'bg-purple-900/50 text-purple-200 shadow-sm border border-purple-500/30' : 'text-gray-400 hover:text-gray-300')}
                                                    >
                                                        Decision Engine
                                                    </button>
                                                    <button
                                                        onClick={() => setViewMode('finder')}
                                                        className={"px-3 py-1.5 rounded-md text-xs font-medium transition-all " + (viewMode === 'finder' ? 'bg-indigo-900/50 text-indigo-200 shadow-sm border border-indigo-500/30' : 'text-gray-400 hover:text-gray-300')}
                                                    >
                                                        Scanner
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Main View Content */}
                                            <div className="min-h-[600px] w-full">
                                                {viewMode === 'chart' ? (
                                                    <StockChart
                                                        data={chartData}
                                                        ticker={selectedStock.ticker}
                                                        trend={selectedStock.trend}
                                                        error={chartError}
                                                        timeframe={timeframe}
                                                        onTimeframeChange={setTimeframe}
                                                        smaData={smaData}
                                                        emaData={emaData}
                                                        adxData={adxData}
                                                    />
                                                ) : viewMode === 'options' ? (
                                                    <OptionsFlow
                                                        ticker={selectedStock.ticker}
                                                        currentPrice={selectedStock.price}
                                                        changePercent={selectedStock.changePercent}
                                                        trend={selectedStock.trend}
                                                        onChat={(context) => {
                                                            setChatContext(context);
                                                            setIsChatOpen(true);
                                                        }}
                                                    />
                                                ) : viewMode === 'gpt' ? (
                                                    <OptionDecisionEngine stock={selectedStock} indicators={indicators} />
                                                ) : (
                                                    <UnusualOptionsTab />
                                                )}
                                            </div>
                                            {/* Risk Calculator */}
                                            <div className="mt-6">
                                                <RiskCalculator currentPrice={selectedStock.price} ticker={selectedStock.ticker} />
                                            </div>


                                            {/* Fundamental Data Tabs */}
                                            <FundamentalTabs
                                                ticker={selectedStock.ticker}
                                                onTickerSelect={handleScannerTickerSelect}
                                            />

                                            {/* Signal Feed Table */}
                                            <SignalFeed signals={signalHistory} onClear={clearSignalHistory} />

                                            {/* Pine Script Section */}
                                            <ScriptViewer />
                                        </>
                                    ) : (
                                        <div className="h-[500px] bg-neutral-900/30 rounded-lg border border-neutral-800 flex items-center justify-center text-gray-500">
                                            Select a stock to view details
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    }
                </div >
            </div >
            {isChatOpen && chatContext && (
                <div className="fixed bottom-4 right-4 w-96 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300">
                    <AIChatPanel
                        context={chatContext}
                        onClose={() => setIsChatOpen(false)}
                    />
                </div>
            )}
        </HttpAuth >
    );
};

export default App;

