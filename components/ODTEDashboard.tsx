import React, { useState, useEffect } from 'react';
import { ODTEScanner } from './odte/ODTEScanner';
import { ODTESmartStrike } from './odte/ODTESmartStrike';
import { ODTETradeSimulator } from './odte/ODTETradeSimulator';
import { GammaExposureChart } from './odte/GammaExposureChart';
import { OptionsHeatmap } from './odte/OptionsHeatmap';
import { ProbabilityCone } from './odte/ProbabilityCone';
import { RiskMetricsBar } from './odte/RiskMetricsBar';

import {
    fetchODTEChain,
    scan10xVolume,
    getSmartStrikeSuggestion,
    calculateGammaExposure,
    calculateOptionsHeatmap,
    calculateExpectedMove,
    generateMockODTEData,
    calculateSmartStrikeScore
} from '../services/odteService';
import {
    ODTEOption,
    ODTESimulationPosition,
    ODTEScanResult,
    ODTEInstitutionalMetrics,
    SmartStrikeScore
} from '../types';
import { Zap, AlertTriangle, RefreshCw, BookOpen, Search } from 'lucide-react';
import { SmartStrikeRadar } from './odte/SmartStrikeRadar';
import { InstitutionalTicket } from './odte/InstitutionalTicket';
import { TradeJournal } from './odte/TradeJournal';

import { fetchODTEBias } from '../services/odteApiService';
import { BiasResponse } from '../types';

interface ODTEDashboardProps {
    onTickerSelect: (ticker: string) => void;
}

const ODTEDashboard: React.FC<ODTEDashboardProps> = ({ onTickerSelect }) => {
    // State
    const [scanResult, setScanResult] = useState<ODTEScanResult | null>(null);
    const [activePositions, setActivePositions] = useState<ODTESimulationPosition[]>([]);
    const [closedPositions, setClosedPositions] = useState<ODTESimulationPosition[]>([]);
    const [metrics, setMetrics] = useState<ODTEInstitutionalMetrics | null>(null);
    const [allCachedOptions, setAllCachedOptions] = useState<ODTEOption[]>([]);
    const [analysisTicker, setAnalysisTicker] = useState<string>('SPY');
    const [selectedOption, setSelectedOption] = useState<ODTEOption | null>(null);
    const [smartScore, setSmartScore] = useState<SmartStrikeScore | null>(null);
    const [volumeMultiplier, setVolumeMultiplier] = useState<number>(10);
    const [showJournal, setShowJournal] = useState(false);
    const [biasData, setBiasData] = useState<BiasResponse | null>(null);

    // Custom Ticker Search
    const [customTickers, setCustomTickers] = useState<string[]>([]);
    const [tickerInput, setTickerInput] = useState('');

    const [loading, setLoading] = useState(false);
    const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
    const [error, setError] = useState<string | null>(null);

    // Mock "Current Prices" map for simulator
    const [prices, setPrices] = useState<Record<string, number>>({});

    // Load initial data
    useEffect(() => {
        refreshScan();
        const interval = setInterval(refreshScan, 30000);
        return () => clearInterval(interval);
    }, [volumeMultiplier, customTickers]);

    // Re-calculate charts when Ticker or Options change
    useEffect(() => {
        if (allCachedOptions.length === 0) return;
        updateAnalysisMetrics(analysisTicker);
        // Fetch Bias Data
        fetchODTEBias(analysisTicker).then(data => {
            if (data) setBiasData(data);
        });
    }, [analysisTicker, allCachedOptions]);

    // Sync Bias Data to Metrics (Real Net Delta/Gamma)
    useEffect(() => {
        if (biasData && metrics) {
            setMetrics(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    netDelta: biasData.regime.netDelta || 0,
                    netGamma: biasData.regime.netGammaUSD || prev.netGamma
                };
            });
        }
    }, [biasData]);

    const updateAnalysisMetrics = (ticker: string) => {
        const tickerOptions = allCachedOptions.filter(o => o.underlyingTicker === ticker);

        // If we found options for this ticker, try to find ATM strike to guess spot price
        // Fallback to 450 if nothing found (e.g. SPY mock default)
        const atmOption = tickerOptions.length > 0 ? tickerOptions.reduce((prev, curr) =>
            Math.abs(curr.delta - 0.5) < Math.abs(prev.delta - 0.5) ? curr : prev
            , tickerOptions[0]) : null;

        let spotPrice = prices[ticker] || (atmOption ? atmOption.strike : 450);

        // Manual override for known mock defaults if data is weird
        if (ticker === 'SPY' && spotPrice < 200) spotPrice = 450;
        if (ticker === 'QQQ' && spotPrice < 100) spotPrice = 400;
        if (ticker === 'NVDA' && spotPrice < 20) spotPrice = 135;

        // Recalculate metrics
        const gexData = calculateGammaExposure(tickerOptions, spotPrice);
        const heatmapData = calculateOptionsHeatmap(tickerOptions);
        // Calculate IV-weighted Expected Move
        const totalOI = tickerOptions.reduce((acc, o) => acc + (o.openInterest || 0), 0);
        const weightedIV = totalOI > 0
            ? tickerOptions.reduce((acc, o) => acc + (o.iv || 0) * (o.openInterest || 0), 0) / totalOI
            : 0;

        const usedIV = weightedIV > 0 ? weightedIV * 100 : 18.5; // Fallback to VIX ~18.5
        const expectedMove = calculateExpectedMove(spotPrice, usedIV);

        const totalGamma = gexData.reduce((acc, curr) => acc + curr.netGamma, 0);

        setMetrics({
            gammaExposure: gexData,
            heatmap: heatmapData,
            expectedMove: expectedMove,
            netDelta: 120, // Mock
            netGamma: totalGamma,
            thetaBurn: tickerOptions.reduce((acc, curr) => acc + (curr.theta * 100), 0)
        });
    };

    const refreshScan = async () => {
        setLoading(true);
        setError(null);
        try {

            // Expanded Watchlist of Liquid 0DTE Names
            // Expanded Watchlist of Liquid 0DTE Names + Custom User Adds
            const defaultTickers = [
                'SPY', 'QQQ', 'IWM',
                'NVDA', 'TSLA', 'AAPL', 'AMD',
                'META', 'MSFT', 'AMZN', 'NFLX', 'COIN', 'GOOGL'
            ];
            // Merge and deduplicate
            const tickers = Array.from(new Set([...defaultTickers, ...customTickers]));
            let allOptions: ODTEOption[] = [];

            const results = await Promise.all(tickers.map(t => fetchODTEChain(t)));
            let hasData = false;
            results.forEach(chain => {
                if (chain.length > 0) hasData = true;
                allOptions = [...allOptions, ...chain];
            });

            // FALLBACK: If Market is Closed (Holiday/Night) and we get ZERO data, use Mocks for Demo
            if (!hasData) {
                console.warn("Market Closed/No Data: Using Mock 0DTE Data for Demonstration");
                // Import dynamically or use the function if available in scope. 
                // We added it to odteService, need to import it.
                // Assuming we imported `generateMockODTEData`
                tickers.forEach(t => {
                    const mocks = generateMockODTEData(t);
                    allOptions = [...allOptions, ...mocks];
                });
            }

            setAllCachedOptions(allOptions);
            let anomalies = scan10xVolume(allOptions, volumeMultiplier);

            // Force include top volume options for custom tickers to ensure user visibility even if they don't meet 10x criteria
            if (customTickers.length > 0) {
                const customOps = allOptions.filter(o => customTickers.includes(o.underlyingTicker));

                // Smart Watchlist Filter: Show "Active" options (e.g. >2x or >500 vol) even if not "10x Anomaly"
                // This ensures "High Quality" filter is effectively applied but adjusted for watchlist focus
                const activeWatchlistOps = customOps.filter(o =>
                    o.volumeRatio > 2.0 || (o.volume > 500 && o.volumeRatio > 1.2)
                );

                // Sort by volume descending and take top 10
                const topCustom = activeWatchlistOps.sort((a, b) => b.volume - a.volume).slice(0, 10);

                // Merge and Unique
                const existingIds = new Set(anomalies.map(a => a.ticker));
                topCustom.forEach(tc => {
                    if (!existingIds.has(tc.ticker)) {
                        anomalies.push(tc);
                    }
                });
            }
            const vix = 18.42; // Mock VIX or fetch

            setScanResult({
                timestamp: Date.now(),
                opportunities: anomalies,
                marketContext: {
                    vix: vix,
                    putCallRatio: 0.85,
                    tick: 400,
                    trend: 'BULL'
                }
            });

            // Populate Prices Map from ALL Options (Approximate from underlying)
            const newPrices: Record<string, number> = {};

            // Helper to guess spot from a chain
            const guessSpot = (tickerOptions: ODTEOption[]) => {
                if (tickerOptions.length === 0) return 0;
                // Find ATM (lowest delta diff from 0.5) to guess strike
                const atm = tickerOptions.reduce((prev, curr) =>
                    Math.abs(Math.abs(curr.delta) - 0.5) < Math.abs(Math.abs(prev.delta) - 0.5) ? curr : prev
                    , tickerOptions[0]);
                return atm.strike;
            };

            tickers.forEach(t => {
                const tOptions = allOptions.filter(o => o.underlyingTicker === t);
                newPrices[t] = guessSpot(tOptions) || 0;
            });

            // Override with known mocks if zero (fallback)
            if (!newPrices['SPY'] || newPrices['SPY'] === 0) newPrices['SPY'] = 450;

            setPrices(prev => ({ ...prev, ...newPrices }));
            setLastRefreshed(new Date());
            anomalies.forEach(o => { newPrices[o.ticker] = o.premium; });
            setPrices(prev => ({ ...prev, ...newPrices }));

            setLastRefreshed(new Date());

        } catch (err: any) {
            console.error("ODTE Scan Failed", err);
            setError("Failed to load 0DTE chain.");
        } finally {
            setLoading(false);
        }
    };

    const handleSelectOption = (option: ODTEOption) => {
        // 1. Switch Analysis View to this ticker (Using Underlying, not Option Symbol)
        setAnalysisTicker(option.underlyingTicker);
        setSelectedOption(option);

        // 2. Calc Smart Scores
        // Need Max Vol and Max OI for normalization
        const tickerOptions = allCachedOptions.filter(o => o.underlyingTicker === option.underlyingTicker);
        const maxVol = Math.max(...tickerOptions.map(o => o.volume));
        const maxOI = Math.max(...tickerOptions.map(o => o.openInterest));
        const score = calculateSmartStrikeScore(option, prices[option.underlyingTicker] || 100, maxVol, maxOI);
        setSmartScore(score);
    };

    const handleExecuteOrder = (order: any) => {
        const newPos: ODTESimulationPosition = {
            id: crypto.randomUUID(),
            option: order.option,
            entryPrice: order.price,
            quantity: order.quantity,
            entryTime: Date.now(),
            status: 'OPEN'
        };
        setActivePositions(prev => [newPos, ...prev]);

        if (order.hedge) {
            console.log("Hedge order placed (simulated)");
        }
    };

    const handleUpdatePosition = (id: string, updates: Partial<ODTESimulationPosition>) => {
        setActivePositions(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    };

    const handleClosePosition = (id: string, exitPrice: number) => {
        const position = activePositions.find(p => p.id === id);
        if (position) {
            // Calculate P&L: (Exit - Entry) * Qty * 100
            // Assuming Long Call/Put. If Short, logic reverses.
            // For simple simulator, we assume Long.
            const pnl = (exitPrice - position.entryPrice) * position.quantity * 100;
            const closedPos: ODTESimulationPosition = {
                ...position,
                status: 'CLOSED',
                exitPrice: exitPrice,
                exitTime: Date.now(),
                pnl: pnl
            };
            setClosedPositions(prev => [...prev, closedPos]);
            setActivePositions(prev => prev.filter(p => p.id !== id));
        }
    };

    const smartSuggestion = scanResult ? getSmartStrikeSuggestion(scanResult.marketContext.vix, 'BULL') : null;

    return (
        <div className="space-y-4 animate-in fade-in duration-500 min-h-screen pb-10">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Zap className="w-6 h-6 text-yellow-500 fill-current" />
                        Institutional 0DTE Desk
                    </h2>
                    <p className="text-sm text-gray-500">
                        Global Gamma & Flow Monitor • Est. Close: <span className="text-indigo-400">16:00 ET</span>
                    </p>
                </div>

                {/* Volume Multiplier Selector */}
                <div className="hidden md:flex items-center bg-neutral-800 rounded-md px-2 py-1 border border-neutral-700">
                    <span className="text-xs text-gray-400 mr-2">Vol Criteria:</span>
                    <select
                        value={volumeMultiplier}
                        onChange={(e) => setVolumeMultiplier(Number(e.target.value))}
                        className="bg-transparent text-xs text-white font-mono outline-none cursor-pointer"
                    >
                        <option value={2}>&gt; 2x (Active)</option>
                        <option value={5}>&gt; 5x (Elevated)</option>
                        <option value={10}>&gt; 10x (Aggressive)</option>
                        <option value={20}>&gt; 20x (High Conviction)</option>
                        <option value={50}>&gt; 50x (Whale Only)</option>
                        <option value={100}>&gt; 100x (Extreme)</option>
                    </select>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowJournal(!showJournal)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-colors ${showJournal ? 'bg-purple-600 border-purple-500 text-white' : 'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-700'}`}
                    >
                        <BookOpen className="w-4 h-4" />
                        <span className="hidden md:inline">Journal</span>
                    </button>
                    <span className="text-xs text-gray-500 flex items-center gap-1.5 bg-neutral-900 px-3 py-1.5 rounded-full border border-neutral-800">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        Market Open
                    </span>
                    <button
                        onClick={refreshScan}
                        disabled={loading}
                        className="bg-neutral-800 hover:bg-neutral-700 text-gray-300 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        {loading ? 'Refreshing...' : 'Refresh'}
                    </button>
                </div>
            </div>

            {/* Phase 1: Institutional Risk Metrics Bar */}
            {metrics && <RiskMetricsBar metrics={metrics} />}

            {/* Bias & Direction Panel V2 */}
            {biasData && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-neutral-900/50 border border-neutral-800 p-4 rounded-xl">
                    {/* Col 1: Main Signal */}
                    <div className="md:col-span-1 border-r border-neutral-800 pr-4 flex flex-col justify-center">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Bias Engine</h3>
                        <div className={`text-3xl font-black tracking-tight ${biasData.bias === 'Bullish' ? 'text-green-500' : biasData.bias === 'Bearish' ? 'text-red-500' : 'text-gray-500'}`}>
                            {biasData.bias.toUpperCase()}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                            <div className="h-1.5 flex-1 bg-neutral-800 rounded-full overflow-hidden">
                                <div className={`h-full ${biasData.bias === 'Bullish' ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${biasData.confidence}%` }}></div>
                            </div>
                            <span className="text-xs font-mono text-gray-400">{biasData.confidence}%</span>
                        </div>
                    </div>

                    {/* Col 2: Regime Context */}
                    <div className="md:col-span-1 border-r border-neutral-800 px-4 flex flex-col justify-center">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-gray-500">Regime</span>
                            <span className={`text-xs font-bold ${biasData.regime.regime === 'LongGamma' ? 'text-green-400' : biasData.regime.regime === 'ShortGamma' ? 'text-red-400' : 'text-yellow-400'}`}>
                                {biasData.regime.regime}
                            </span>
                        </div>
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-gray-500">Gamma Flip</span>
                            <span className={`text-[10px] px-1.5 rounded border ${biasData.regime.gammaFlip ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-neutral-800 text-gray-500 border-neutral-700'}`}>
                                {biasData.regime.gammaFlip ? 'DETECTED' : 'NONE'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-500">Exp. Move</span>
                            <span className="text-xs text-gray-200">±${metrics?.expectedMove.oneSigma.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Col 3: Checklist */}
                    <div className="md:col-span-1 border-r border-neutral-800 px-4 flex flex-col justify-center space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">Price vs VWAP</span>
                            <span className={`text-xs font-bold ${biasData.context.priceVsVwap === 'Above' ? 'text-green-400' : biasData.context.priceVsVwap === 'Below' ? 'text-red-400' : 'text-gray-400'}`}>
                                {biasData.context.priceVsVwap}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">ATM Flow</span>
                            <span className={`text-xs font-bold ${(biasData.flow.normalizedImbalance?.atm || 0) > 0.1 ? 'text-green-400' :
                                    (biasData.flow.normalizedImbalance?.atm || 0) < -0.1 ? 'text-red-400' : 'text-gray-400'
                                }`}>
                                {((biasData.flow.normalizedImbalance?.atm || 0) * 100).toFixed(0)}%
                            </span>
                        </div>
                        {biasData.walls && (
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500">Nearest Wall</span>
                                <span className="text-xs text-gray-300">
                                    {(biasData.walls.distToCallWallPct && biasData.walls.distToCallWallPct < 0.5) ? 'CALL WALL' :
                                        (biasData.walls.distToPutWallPct && biasData.walls.distToPutWallPct > -0.5) ? 'PUT WALL' : 'CLEAR'}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Col 4: Reasoning */}
                    <div className="md:col-span-1 pl-4 flex flex-col justify-center">
                        <h4 className="text-[10px] font-bold text-gray-500 mb-2">PRIMARY DRIVERS</h4>
                        <ul className="space-y-1">
                            {biasData.reasons.length > 0 ? biasData.reasons.map((r, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-xs text-gray-300">
                                    <span className="mt-0.5 w-1 h-1 rounded-full bg-indigo-500 shrink-0"></span>
                                    <span className="leading-tight">{r}</span>
                                </li>
                            )) : <li className="text-xs text-gray-500 italic">No strong signal detected</li>}
                        </ul>
                    </div>
                </div>
            )}

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    {error}
                </div>
            )}

            {/* Trade Journal Overlay */}
            {showJournal && (
                <div className="absolute inset-0 z-50 bg-neutral-950/95 p-6 animate-in fade-in duration-200 backdrop-blur-sm">
                    <div className="h-full flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-purple-400" />
                                Trading Journal & Performance
                            </h2>
                            <button onClick={() => setShowJournal(false)} className="text-gray-400 hover:text-white">
                                Close X
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <TradeJournal history={closedPositions} onClearHistory={() => setClosedPositions([])} />
                        </div>
                    </div>
                </div>
            )}

            {/* Main "Commander" Layout: 3 Columns */}
            <div className={`grid grid-cols-1 xl:grid-cols-12 gap-3 md:h-[calc(100vh-140px)] h-auto min-h-[600px] ${showJournal ? 'hidden' : ''}`}>

                {/* LEFT: Scanner & Discovery (3 Cols) */}
                <div className="xl:col-span-3 flex flex-col gap-3 md:h-full h-[500px] overflow-hidden">
                    <div className="flex-1 min-h-0 bg-neutral-900/30 rounded-lg border border-neutral-800">
                        <ODTEScanner
                            opportunities={scanResult?.opportunities || []}
                            onSelectOption={handleSelectOption}
                            lastUpdated={lastRefreshed}
                            onAddTicker={(ticker) => {
                                const t = ticker.toUpperCase().trim();
                                if (!customTickers.includes(t)) {
                                    setCustomTickers(prev => [...prev, t]);
                                    setAnalysisTicker(t);
                                }
                            }}
                        />
                    </div>
                </div>

                {/* CENTER: Visualization & Market Structure (6 Cols) */}
                <div className="xl:col-span-6 flex flex-col gap-3 md:h-full h-auto overflow-y-auto pr-2 custom-scrollbar">
                    {/* 1. Probability Cone */}
                    <div className="h-[300px] w-full shrink-0">
                        {metrics && <ProbabilityCone spotPrice={prices[analysisTicker] || 450} expectedMove={metrics.expectedMove} />}
                    </div>

                    {/* 2. Gamma Exposure Chart */}
                    <div className="h-[300px] w-full shrink-0">
                        {metrics && <GammaExposureChart data={metrics.gammaExposure} spotPrice={prices[analysisTicker] || 450} />}
                    </div>

                    {/* 3. Heatmap */}
                    <div className="h-[300px] w-full shrink-0">
                        {metrics && <OptionsHeatmap data={metrics.heatmap} spotPrice={prices[analysisTicker] || 450} />}
                    </div>
                </div>

                {/* RIGHT: Execution & Strategy (3 Cols) */}
                <div className="xl:col-span-3 flex flex-col gap-3 md:h-full h-auto overflow-hidden">

                    {/* 1. Smart Radar (Full View) - Reduced Height */}
                    <div className="h-[200px] shrink-0">
                        <SmartStrikeRadar scores={smartScore} selectedOption={selectedOption} />
                    </div>

                    {/* 2. Institutional Ticket (Execution) */}
                    <div className="shrink-0">
                        <InstitutionalTicket
                            selectedOption={selectedOption}
                            currentPrice={selectedOption ? (prices[selectedOption.ticker] || selectedOption.premium) : 0}
                            onExecuteOrder={handleExecuteOrder}
                        />
                    </div>

                    {/* 3. Active Positions (Flex fill remaining) */}
                    <div className="flex-1 min-h-[300px] md:min-h-[100px] overflow-y-auto bg-neutral-900/20 rounded-lg border border-neutral-800 flex flex-col">
                        <div className="p-2 border-b border-neutral-800 bg-neutral-900/50 sticky top-0 z-10">
                            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Active Portfolio</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <ODTETradeSimulator
                                activePositions={activePositions}
                                onUpdatePosition={handleUpdatePosition}
                                onClosePosition={handleClosePosition}
                                currentPrices={prices}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ODTEDashboard;


