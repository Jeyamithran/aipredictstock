import React, { useState, useEffect, useRef } from 'react';
import { UNUSUAL_CONSTANTS, UNUSUAL_WHALES_UNIVERSE } from '../core/constants';
import { scoreUnusualTrade, UnusualTradeCandidate } from '../core/unusualOptionsRules';
import { fetchMarketActives } from '../services/fmpService';
import { fetchUnderlyingChainSnapshot, fetchOptionSnapshot } from '../services/polygonSnapshots';
import { getPolygonApiKey, fetchPolygonMarketActives } from '../services/polygonService';
import { analyzeUnusualActivity, AIAnalysisResult } from '../services/openaiDecisionMaker';
import { useOptionsStream } from '../hooks/useOptionsStream';
import { Activity, Shield, Zap, AlertTriangle, RefreshCcw, Filter, BrainCircuit, Play, Pause } from 'lucide-react';

export const UnusualOptionsTab: React.FC = () => {
    // State
    const [candidates, setCandidates] = useState<UnusualTradeCandidate[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0); // 0-100
    const [selectedCandidate, setSelectedCandidate] = useState<UnusualTradeCandidate | null>(null);
    const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
    const [analyzingRank, setAnalyzingRank] = useState(false);
    const [analyzingSingle, setAnalyzingSingle] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filter State
    const [filterDte, setFilterDte] = useState<number>(30); // Max DTE
    const [filterMinScore, setFilterMinScore] = useState<number>(10);
    const [excludeIndices, setExcludeIndices] = useState(false); // Enable indices by default for volume

    // New Smart Filters
    const [filterText, setFilterText] = useState('');
    const [filterIntent, setFilterIntent] = useState('ALL'); // ALL, BULLISH, BEARISH
    const [filterType, setFilterType] = useState('ALL'); // ALL, CALL, PUT

    // Advanced Filters
    const [filterPreset, setFilterPreset] = useState<'NONE' | 'CLEAN_FLOW' | 'ZERO_DTE' | 'WHALE_WATCH'>('NONE');
    const [filterMaxSpread, setFilterMaxSpread] = useState<number>(0.10); // 10% default
    const [filterMinPremium, setFilterMinPremium] = useState<number>(0);

    // Sort State
    const [sortConfig, setSortConfig] = useState<{ key: keyof UnusualTradeCandidate | 'vol_oi', direction: 'asc' | 'desc' }>({ key: 'score', direction: 'desc' });

    // Handle Presets
    const applyPreset = (preset: string) => {
        setFilterPreset(preset as any);
        if (preset === 'CLEAN_FLOW') {
            setFilterMinScore(50); // Lowered from 70
            setFilterDte(45);
            setFilterMaxSpread(0.10); // Relaxed
            setFilterIntent('BULLISH');
            setFilterMinPremium(10000); // Relaxed
        } else if (preset === 'ZERO_DTE') {
            setFilterMinScore(40); // Lowered from 50
            setFilterDte(0);
            setFilterMaxSpread(0.15);
            setFilterIntent('ALL');
            setFilterMinPremium(5000); // Lowered from 10k
        } else if (preset === 'WHALE_WATCH') {
            setFilterMinScore(50); // Lowered from 60
            setFilterDte(180);
            setFilterIntent('ALL');
            setFilterMinPremium(50000); // Lowered from 250k
            setFilterMaxSpread(0.20);
        } else {
            // Reset to default (Custom)
            setFilterMinScore(5); // Ultra low to show everything initially
            setFilterDte(45); // Standard swing range
            setFilterMaxSpread(0.25); // Allow wider spreads
            setFilterIntent('ALL');
            setFilterMinPremium(0); // Show all sizes
        }
    };

    // Derived Logic: Sort & Filter
    const sortedAndFilteredCandidates = React.useMemo(() => {
        let result = [...candidates];

        // 1. Text Filter (Ticker)
        if (filterText) {
            const lowerIds = filterText.toLowerCase();
            result = result.filter(c => c.underlying.toLowerCase().includes(lowerIds) || c.contract.toLowerCase().includes(lowerIds));
        }

        // 2. Intent Filter
        if (filterIntent !== 'ALL') {
            result = result.filter(c => c.intent.includes(filterIntent));
        }

        // 3. Type Filter
        if (filterType !== 'ALL') {
            result = result.filter(c => c.type === filterType);
        }

        // 4. Advanced Limits (Spread, DTE, Premium)
        result = result.filter(c => {
            // DTE Check (Exact match for 0DTE logic, or <= for range)
            if (filterPreset === 'ZERO_DTE') {
                if (c.dte !== 0) return false;
            } else {
                if (c.dte > filterDte) return false;
            }

            // Spread Check
            if (c.spreadPct > filterMaxSpread) return false;

            // Premium Check
            if (c.premium < filterMinPremium) return false;

            // Score Check
            if (c.score < filterMinScore) return false;

            // Exclude Indices Check
            if (excludeIndices) {
                const ticker = c.underlying.toUpperCase();
                if (ticker === 'SPY' || ticker === 'QQQ' || ticker === 'IWM' || ticker === 'DIA') return false;
            }

            return true;
        });

        // 5. Sort
        result.sort((a, b) => {
            let valA: any = a[sortConfig.key as keyof UnusualTradeCandidate];
            let valB: any = b[sortConfig.key as keyof UnusualTradeCandidate];

            // Handle virtual columns
            if (sortConfig.key === 'vol_oi') {
                valA = a.volToOi;
                valB = b.volToOi;
            }

            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [candidates, filterText, filterIntent, filterType, sortConfig, filterDte, filterMaxSpread, filterMinScore, filterMinPremium, filterPreset, excludeIndices]);

    const handleSort = (key: keyof UnusualTradeCandidate | 'vol_oi') => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    // Smart Hybrid Scan Logic (Polygon + Market Actives)
    const scanLoop = async () => {
        setIsScanning(true);
        setCandidates([]);
        setError(null);
        setScanProgress(5);

        try {
            // 1. Get Market Actives (Polygon Preferred)
            // The user explicitly requested to use Polygon instead of FMP for better reliability
            const apiKey = getPolygonApiKey();
            let activeResults = { active: [], gainers: [], losers: [] };

            try {
                if (apiKey) {
                    console.log("[UnusualScan] Fetching Market Actives via Polygon...");
                    activeResults = await fetchPolygonMarketActives(apiKey);
                    console.log(`[UnusualScan] Got ${activeResults.active.length} active tickers from Polygon`);
                } else {
                    console.warn("[UnusualScan] No Polygon Key found, falling back to FMP");
                    activeResults = await fetchMarketActives() as any;
                }
            } catch (err) {
                console.warn("[UnusualScan] Market Actives Fetch Failed, using universe only", err);
            }

            const { active, gainers, losers } = activeResults;

            // 2. Build Target List (Watchlist + Actives)
            const targetSet = new Set<string>();
            UNUSUAL_WHALES_UNIVERSE.forEach(t => targetSet.add(t)); // Core Watchlist
            active.forEach(s => targetSet.add(s.ticker));
            gainers.forEach(s => targetSet.add(s.ticker));
            losers.forEach(s => targetSet.add(s.ticker));

            // Convert to array and filter out indices if needed
            let targets = Array.from(targetSet);
            // Default excludeIndices to false if result is too small? No, respect user.
            if (excludeIndices) {
                targets = targets.filter(t => !['SPY', 'QQQ', 'IWM', 'DIA'].includes(t));
            }

            // Severe throttling for Free/Starter Tier (avoid 429)
            // 5 requests per minute is the strict free limit. 
            // We'll try a bit faster assuming burst is allowed, but strictly sequential.
            const BATCH_SIZE = 1;
            const total = targets.length;

            let completed = 0;
            const validCandidates: UnusualTradeCandidate[] = [];

            // Helper to process a single ticker
            const processTicker = async (ticker: string): Promise<UnusualTradeCandidate[]> => {
                const results: UnusualTradeCandidate[] = [];
                try {
                    // Use updated constant (100) or lower for weekend
                    const chain = await fetchUnderlyingChainSnapshot(ticker, UNUSUAL_CONSTANTS.MIN_VOLUME_TODAY);

                    for (const contract of chain) {
                        if (!contract.last_quote || !contract.underlying_asset) continue;

                        const underlyingPrice = contract.underlying_asset.price;
                        // Use Day Volume, but fallback to 0 if missing (Weekend)
                        const dayVol = contract.day?.volume || 0;
                        const dayVwap = contract.day?.volume_weighted_price;

                        // Double check volume vs global rules (redundant if snapshot filtered, but safe)
                        if (dayVol < UNUSUAL_CONSTANTS.MIN_VOLUME_TODAY) continue;

                        const simulatedTrade = {
                            price: dayVwap || (contract.last_quote.bid + contract.last_quote.ask) / 2,
                            size: dayVol,
                        };
                        const quote = {
                            bid: contract.last_quote.bid,
                            ask: contract.last_quote.ask,
                            iv: contract.implied_volatility,
                            delta: contract.greeks?.delta
                        };
                        const details = {
                            ticker: contract.details.ticker,
                            strike_price: contract.details.strike_price,
                            expiration_date: contract.details.expiration_date,
                            open_interest: contract.open_interest,
                            volume: dayVol
                        };

                        const result = scoreUnusualTrade(simulatedTrade, quote, details, underlyingPrice);
                        // Score filter > 5 (Relaxed to match UI)
                        if (result && result.score > 5) {
                            if (!result.timestamp) result.timestamp = Date.now();
                            results.push(result);
                        }
                    }
                } catch (e) {
                    console.error(`[UnusualScan] Failed to process ${ticker}`, e);
                }
                return results;
            };

            // Process in Batches
            for (let i = 0; i < targets.length; i += BATCH_SIZE) {
                if (!scanningRef.current) break;

                const batch = targets.slice(i, i + BATCH_SIZE);
                const promises = batch.map(t => processTicker(t));
                const resultsNested = await Promise.all(promises);

                // Flatten and add
                const newCandidates = resultsNested.flat();
                if (newCandidates.length > 0) {
                    validCandidates.push(...newCandidates);
                    // Incremental Update
                    setCandidates(prev => [...prev, ...newCandidates]);
                }

                completed += batch.length;
                setScanProgress(Math.min(95, Math.round((completed / total) * 100)));

                // Wait 3.5 seconds between requests to stay safe
                await new Promise(r => setTimeout(r, 3500));
            }

            setScanProgress(100);

        } catch (e) {
            console.error("Scan failed", e);
            setError("Scan failed. Please check your connection.");
        }

        setIsScanning(false);
    };

    // AI Analysis Handler
    const handleAnalyze = async (specificCandidate?: UnusualTradeCandidate) => {
        const targets = specificCandidate ? [specificCandidate] : sortedAndFilteredCandidates.slice(0, 10);

        if (targets.length === 0) return;

        if (specificCandidate) {
            setAnalyzingSingle(true);
        } else {
            setAnalyzingRank(true);
        }

        const result = await analyzeUnusualActivity(targets);
        if (result) {
            setAiAnalysis(result);
        } else {
            setError("AI Analysis Failed (Check API Keys)");
        }

        if (specificCandidate) {
            setAnalyzingSingle(false);
        } else {
            setAnalyzingRank(false);
        }
    };

    // Stop Scan Ref (Legacy but kept for compatibility logic if needed)
    const scanningRef = useRef(false);
    const toggleScan = () => {
        if (isScanning) {
            scanningRef.current = false;
            setIsScanning(false);
        } else {
            scanningRef.current = true;
            scanLoop();
        }
    };

    return (
        <div className="h-full bg-black text-white p-4 overflow-hidden flex flex-col">
            {/* Header / Toolbar */}
            <div className="flex flex-col gap-4 mb-6 bg-neutral-900/50 p-4 rounded-xl border border-neutral-800">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="bg-purple-600/20 p-2 rounded-lg">
                            <ZoomInIcon className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                Unusual Options Finder
                                <span className="text-xs font-normal bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30">Beta</span>
                            </h2>
                            <p className="text-xs text-gray-400">Scanning Entire US Market • Polygon.io Data Stream</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={toggleScan}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all ${isScanning ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                        >
                            {isScanning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            {isScanning ? 'Stop' : 'Scan'}
                        </button>
                        <button
                            onClick={() => handleAnalyze()}
                            disabled={candidates.length < 3 || analyzingRank}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold transition-all"
                        >
                            {analyzingRank ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
                            {analyzingRank ? 'Ranking...' : 'AI Rank'}
                        </button>
                    </div>
                </div>

                {/* Smart Filters Bar */}
                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-neutral-800">
                    {/* Presets */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-purple-300 font-bold uppercase tracking-wider">Presets:</span>
                        <select
                            value={filterPreset}
                            onChange={(e) => applyPreset(e.target.value)}
                            className="bg-purple-500/10 border border-purple-500/20 rounded px-2 py-1 text-sm text-purple-200 outline-none hover:bg-purple-500/20 cursor-pointer"
                        >
                            <option value="NONE">Custom</option>
                            <option value="CLEAN_FLOW">Clean Flow (Tight Spread)</option>
                            <option value="ZERO_DTE">0DTE Momentum</option>
                            <option value="WHALE_WATCH">Whale Watch (Big Prem)</option>
                        </select>
                    </div>

                    <div className="w-px h-4 bg-gray-700 mx-1"></div>

                    {/* Search */}
                    <div className="relative flex items-center">
                        <ZoomInIcon className="w-3 h-3 text-gray-500 absolute left-2" />
                        <input
                            type="text"
                            placeholder="TICKER"
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 pl-7 text-sm text-white outline-none w-24 focus:w-32 transition-all uppercase placeholder:text-gray-600"
                        />
                    </div>

                    {/* Major Filters */}
                    <select
                        value={filterIntent}
                        onChange={(e) => setFilterIntent(e.target.value)}
                        className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-sm text-gray-300 outline-none"
                    >
                        <option value="ALL">All Flows</option>
                        <option value="BULLISH">Bullish Only</option>
                        <option value="BEARISH">Bearish Only</option>
                    </select>

                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-sm text-gray-300 outline-none"
                    >
                        <option value="ALL">Any Type</option>
                        <option value="call">Calls</option>
                        <option value="put">Puts</option>
                    </select>

                    <div className="w-px h-4 bg-gray-700 mx-1"></div>

                    {/* Liquidity Controls */}
                    <div className="flex items-center gap-1 group relative">
                        <select
                            value={filterMaxSpread}
                            onChange={(e) => setFilterMaxSpread(Number(e.target.value))}
                            className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-sm text-gray-300 outline-none"
                        >
                            <option value={0.03}>Spread &lt; 3%</option>
                            <option value={0.05}>Spread &lt; 5%</option>
                            <option value={0.10}>Spread &lt; 10%</option>
                            <option value={0.20}>Spread &lt; 20%</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-1">
                        <select
                            value={filterMinPremium}
                            onChange={(e) => setFilterMinPremium(Number(e.target.value))}
                            className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-sm text-gray-300 outline-none"
                        >
                            <option value={0}>Any Prem</option>
                            <option value={25000}>&gt; $25k</option>
                            <option value={50000}>&gt; $50k</option>
                            <option value={100000}>&gt; $100k</option>
                            <option value={500000}>&gt; $500k</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-1">
                        <select
                            value={filterDte}
                            onChange={(e) => setFilterDte(Number(e.target.value))}
                            className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-sm text-gray-300 outline-none"
                        >
                            <option value={0}>0 DTE Only</option>
                            <option value={7}>&lt; 7 DTE</option>
                            <option value={14}>&lt; 14 DTE</option>
                            <option value={30}>&lt; 30 DTE</option>
                            <option value={60}>&lt; 60 DTE</option>
                        </select>
                    </div>

                    <span className="text-xs text-gray-500 ml-1">Score:</span>
                    <input
                        type="number"
                        value={filterMinScore}
                        onChange={(e) => setFilterMinScore(Number(e.target.value))}
                        className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 w-12 text-sm text-white outline-none text-right"
                    />

                    <div className="flex items-center gap-1 ml-2">
                        <label className="flex items-center cursor-pointer gap-2">
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    className="sr-only"
                                    checked={excludeIndices}
                                    onChange={(e) => setExcludeIndices(e.target.checked)}
                                />
                                <div className={`block w-8 h-5 rounded-full transition-colors ${excludeIndices ? 'bg-purple-600' : 'bg-neutral-700'}`}></div>
                                <div className={`dot absolute left-1 top-1 bg-white w-3 h-3 rounded-full transition-transform ${excludeIndices ? 'translate-x-3' : ''}`}></div>
                            </div>
                            <span className="text-xs text-gray-400">Hide ETFs</span>
                        </label>
                    </div>
                </div>
            </div>

            {/* Progress Bar */}
            {isScanning && (
                <div className="w-full bg-neutral-800 h-1 mb-4 rounded-full overflow-hidden">
                    <div
                        className="bg-emerald-500 h-full transition-all duration-300 ease-out"
                        style={{ width: `${scanProgress}%` }}
                    ></div>
                </div>
            )}

            {error && (
                <div className="mb-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 p-3 rounded-lg flex items-center gap-2 text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    {error}
                </div>
            )}

            {/* Main Content Grid */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
                {/* Left: Ranked Table */}
                <div className="lg:col-span-2 bg-neutral-900/50 rounded-xl border border-neutral-800 overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-neutral-800 flex justify-between">
                        <div>
                            <h3 className="font-bold text-gray-200 inline-block mr-2">Ranked Opportunities</h3>
                            <span className="text-xs text-gray-400">
                                (Showing {sortedAndFilteredCandidates.length} of {candidates.length} raw hits)
                            </span>
                        </div>
                        <span className="text-xs text-gray-500 uppercase tracking-wider mt-1">Real-time / Snapshots</span>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-neutral-950 text-gray-500 text-xs sticky top-0 z-10">
                                <tr>
                                    <th onClick={() => handleSort('score')} className="p-3 font-medium cursor-pointer hover:text-white transition-colors">Score {sortConfig.key === 'score' && (sortConfig.direction === 'desc' ? '↓' : '↑')}</th>
                                    <th onClick={() => handleSort('underlying')} className="p-3 font-medium cursor-pointer hover:text-white transition-colors">Ticker {sortConfig.key === 'underlying' && (sortConfig.direction === 'desc' ? '↓' : '↑')}</th>
                                    <th onClick={() => handleSort('contract')} className="p-3 font-medium cursor-pointer hover:text-white transition-colors">Contract {sortConfig.key === 'contract' && (sortConfig.direction === 'desc' ? '↓' : '↑')}</th>
                                    <th onClick={() => handleSort('premium')} className="p-3 font-medium text-right cursor-pointer hover:text-white transition-colors">Premium {sortConfig.key === 'premium' && (sortConfig.direction === 'desc' ? '↓' : '↑')}</th>
                                    <th onClick={() => handleSort('vol_oi')} className="p-3 font-medium text-right cursor-pointer hover:text-white transition-colors">Vol/OI {sortConfig.key === 'vol_oi' && (sortConfig.direction === 'desc' ? '↓' : '↑')}</th>
                                    <th onClick={() => handleSort('intent')} className="p-3 font-medium text-center cursor-pointer hover:text-white transition-colors">Intent {sortConfig.key === 'intent' && (sortConfig.direction === 'desc' ? '↓' : '↑')}</th>
                                    <th className="p-3 font-medium text-center">Flags</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-800 text-sm">
                                {sortedAndFilteredCandidates.map((c, i) => (
                                    <tr
                                        key={c.contract}
                                        onClick={() => setSelectedCandidate(c)}
                                        className={`cursor-pointer hover:bg-white/5 transition-colors ${selectedCandidate?.contract === c.contract ? 'bg-purple-900/20 border-l-2 border-purple-500' : ''}`}
                                    >
                                        <td className="p-3">
                                            <span className={`font-bold ${c.score >= 80 ? 'text-emerald-400' : c.score >= 60 ? 'text-yellow-400' : 'text-gray-400'}`}>
                                                {c.score.toFixed(0)}
                                            </span>
                                        </td>
                                        <td className="p-3 font-bold text-white">{c.underlying}</td>
                                        <td className="p-3 text-gray-300 font-mono text-xs">{c.contract.split('O:')[1] || c.contract}</td>
                                        <td className="p-3 text-right">${(c.premium / 1000).toFixed(1)}k</td>
                                        <td className="p-3 text-right">
                                            <span className={c.volToOi > 3 ? 'text-emerald-400 font-bold' : 'text-gray-400'}>
                                                {c.volToOi.toFixed(1)}x
                                            </span>
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${c.intent.includes('BULLISH') ? 'bg-emerald-500/10 text-emerald-400' :
                                                c.intent.includes('BEARISH') ? 'bg-rose-500/10 text-rose-400' : 'bg-gray-700/30 text-gray-400'
                                                }`}>
                                                {c.intent.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="p-3 text-center">
                                            <div className="flex justify-center gap-1">
                                                {c.flags.map(f => (
                                                    <span key={f} className="w-1.5 h-1.5 rounded-full bg-blue-500" title={f}></span>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {sortedAndFilteredCandidates.length === 0 && !isScanning && (
                                    <tr>
                                        <td colSpan={7} className="p-8 text-center text-gray-500">
                                            <Zap className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                            {candidates.length > 0
                                                ? "No matches for current filters. Try relaxing the score or DTE filters."
                                                : "No opportunities found. Ensure Market is open or API Key is valid."}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right: AI Summary & Details */}
                <div className="space-y-6">
                    {/* Selected Candidate Details */}
                    <div className="bg-neutral-900/50 rounded-xl border border-neutral-800 p-6">
                        <h3 className="font-bold text-gray-200 mb-4 flex items-center gap-2">
                            <Shield className="w-5 h-5 text-blue-500" />
                            Analyze Selection
                        </h3>
                        {selectedCandidate ? (
                            <div className="space-y-4">
                                <div className="flex justify-between items-end">
                                    <div className="text-3xl font-bold text-white">{selectedCandidate.underlying}</div>
                                    <div className="text-xl text-emerald-400 font-mono">${selectedCandidate.strike} {selectedCandidate.type.toUpperCase()}</div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div className="bg-black/30 p-2 rounded">
                                        <div className="text-gray-500 text-xs">Premium</div>
                                        <div className="text-white font-mono">${selectedCandidate.premium.toLocaleString()}</div>
                                    </div>
                                    <div className="bg-black/30 p-2 rounded">
                                        <div className="text-gray-500 text-xs">Size</div>
                                        <div className="text-white font-mono">{selectedCandidate.size}</div>
                                    </div>
                                    <div className="bg-black/30 p-2 rounded">
                                        <div className="text-gray-500 text-xs">Spread</div>
                                        <div className={`font-mono ${selectedCandidate.spreadPct > 0.05 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                            {(selectedCandidate.spreadPct * 100).toFixed(2)}%
                                        </div>
                                    </div>
                                    <div className="bg-black/30 p-2 rounded">
                                        <div className="text-gray-500 text-xs">DTE</div>
                                        <div className="text-white font-mono">{selectedCandidate.dte}d</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleAnalyze(selectedCandidate)}
                                    disabled={analyzingSingle}
                                    className="w-full mt-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                                >
                                    {analyzingSingle ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
                                    Run Single Analysis
                                </button>
                            </div>
                        ) : (
                            <div className="text-center text-gray-500 py-8">
                                Select a row to view details.
                            </div>
                        )}
                    </div>

                    {/* AI Insights Panel */}
                    <div className="bg-gradient-to-br from-indigo-900/20 to-purple-900/20 rounded-xl border border-indigo-500/30 p-6 flex-1">
                        <div className="flex items-center gap-2 mb-4">
                            <BrainCircuit className="w-5 h-5 text-indigo-400" />
                            <h3 className="font-bold text-indigo-100">AI Decision Maker</h3>
                        </div>

                        {aiAnalysis ? (
                            <div className="space-y-4 animate-in slide-in-from-right-4 duration-500">
                                {aiAnalysis.top_picks.map((pick, i) => (
                                    <div key={i} className="bg-neutral-900/80 p-3 rounded-lg border border-indigo-500/20">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="font-bold text-white text-sm">{pick.contract.split('O:')[1]}</div>
                                            <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${pick.directional_bias === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                                {pick.directional_bias}
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-300 mb-2">{pick.why_unusual}</p>
                                        <div className="text-[10px] text-rose-300 flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" />
                                            Risk: {pick.top_risks.join(', ')}
                                        </div>
                                    </div>
                                ))}
                                <div className="text-[10px] text-gray-500 mt-2 text-center">
                                    Not financial advice. AI analysis for educational purposes only.
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-indigo-300/60 text-center py-8">
                                {(analyzingRank || analyzingSingle) ? 'Processing market data...' : 'Run "AI Rank" to get smart insights on the top candidates.'}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Icon helper
const ZoomInIcon = (props: any) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /><line x1="11" x2="11" y1="8" y2="14" /><line x1="8" x2="14" y1="11" y2="11" /></svg>
)
