import React, { useState } from 'react';
import { ScannerProfile, ScannerResponse } from '../../types';
import { runScannerWithPerplexity } from '../../services/perplexityService';
import { runScannerWithOpenAI } from '../../services/openaiService';
import { saveScanToHistory, getScannerHistory, clearScannerHistory, reconstructResponseFromHistory } from '../../services/scannerHistoryService';
import ScannerResults from './ScannerResults';
import {
    Briefcase,
    TrendingUp,
    Zap,
    Activity,
    Crosshair,
    Rocket,
    Search,
    Loader2,
    AlertCircle,
    History,
    Trash2,
    Clock
} from 'lucide-react';

const PROFILES: { id: ScannerProfile; name: string; description: string; icon: React.ReactNode }[] = [
    {
        id: 'hedge_fund',
        name: 'Hedge Fund Analyst',
        description: 'Institutional quality setups with asymmetric R/R and strong fundamentals.',
        icon: <Briefcase className="w-6 h-6 text-blue-400" />
    },
    {
        id: 'pro_trader',
        name: 'Pro Trader',
        description: 'Aggressive momentum and technical breakouts for swing trading.',
        icon: <TrendingUp className="w-6 h-6 text-green-400" />
    },
    {
        id: 'catalyst',
        name: 'Catalyst Hunter',
        description: 'News-driven moves: FDA, Earnings, M&A, and SEC filings.',
        icon: <Zap className="w-6 h-6 text-yellow-400" />
    },
    {
        id: 'bio_analyst',
        name: 'Biotech Analyst',
        description: 'Clinical trial catalysts and regulatory milestones in small/mid cap biotech.',
        icon: <Activity className="w-6 h-6 text-pink-400" />
    },
    {
        id: 'immediate_breakout',
        name: 'Immediate Breakout',
        description: 'Setups ready to trigger within 1-5 days. Pure price action.',
        icon: <Crosshair className="w-6 h-6 text-red-400" />
    },
    {
        id: 'high_growth',
        name: 'High Growth Innovation',
        description: 'Small/Micro-cap innovators in AI, Energy, and Tech.',
        icon: <Rocket className="w-6 h-6 text-purple-400" />
    }
];

interface ScannerDashboardProps {
    onTickerSelect?: (ticker: string) => void;
}

const ScannerDashboard: React.FC<ScannerDashboardProps> = ({ onTickerSelect }) => {
    const [activeTab, setActiveTab] = useState<'scanner' | 'history'>('scanner');
    const [selectedProfile, setSelectedProfile] = useState<ScannerProfile>('hedge_fund');
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<ScannerResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [history, setHistory] = useState(getScannerHistory());

    const refreshHistory = () => {
        setHistory(getScannerHistory());
    };

    // Load history on mount to ensure it's fresh
    React.useEffect(() => {
        refreshHistory();
    }, []);

    const handleRunScan = async () => {
        setIsLoading(true);
        setError(null);
        setResults(null);

        try {
            console.log("Starting hybrid scan (Perplexity + OpenAI)...");
            const [perplexityResult, openAIResult] = await Promise.allSettled([
                runScannerWithPerplexity(selectedProfile),
                runScannerWithOpenAI(selectedProfile)
            ]);

            const mergedResults: ScannerResponse = {
                MarketContext: undefined,
                SmallCap: [],
                MidCap: [],
                LargeCap: []
            };

            const processResults = (
                sourceName: 'Perplexity' | 'OpenAI',
                result: PromiseSettledResult<ScannerResponse>
            ) => {
                if (result.status === 'fulfilled') {
                    const data = result.value;
                    if (!mergedResults.MarketContext && data.MarketContext) {
                        mergedResults.MarketContext = data.MarketContext;
                    }
                    (['SmallCap', 'MidCap', 'LargeCap'] as const).forEach(bucket => {
                        if (data[bucket]) {
                            data[bucket].forEach(alert => {
                                alert.Source = sourceName;
                                // Check if already exists in mergedResults (from previous source)
                                const existingIndex = mergedResults[bucket].findIndex(a => a.Ticker === alert.Ticker);
                                if (existingIndex >= 0) {
                                    // Merge logic: Mark as 'Both' and maybe combine analysis
                                    mergedResults[bucket][existingIndex].Source = 'Both';
                                    mergedResults[bucket][existingIndex].DetailedAnalysis += `\n\n[OpenAI]: ${alert.DetailedAnalysis}`;
                                } else {
                                    mergedResults[bucket].push(alert);
                                }
                            });
                        }
                    });
                } else {
                    console.error(`${sourceName} scan failed:`, result.reason);
                }
            };

            processResults('Perplexity', perplexityResult);
            processResults('OpenAI', openAIResult);

            if (mergedResults.SmallCap.length === 0 && mergedResults.MidCap.length === 0 && mergedResults.LargeCap.length === 0) {
                throw new Error("Both AI agents failed to find candidates. Please try again.");
            }

            setResults(mergedResults);
            saveScanToHistory(selectedProfile, mergedResults);
            refreshHistory();

        } catch (err) {
            console.error("Scanner error:", err);
            setError(err instanceof Error ? err.message : "An unknown error occurred while scanning.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearHistory = () => {
        if (confirm('Are you sure you want to clear all scan history?')) {
            clearScannerHistory();
            refreshHistory();
        }
    };

    const handleLoadHistoryItem = (item: any) => {
        try {
            const reconstructed = reconstructResponseFromHistory(item);
            setResults(reconstructed);
            setActiveTab('scanner');
        } catch (err) {
            console.error("Failed to load history item:", err);
            setError("Failed to load this history item. It may be corrupted.");
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 text-white p-6 md:p-12">
            <div className="max-w-7xl mx-auto">
                <header className="mb-8 text-center">
                    <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 mb-4">
                        AI Market Scanner
                    </h1>
                    <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-6">
                        Select a specialized AI agent to scan the market for high-probability setups using real-time data and institutional logic.
                    </p>

                    <div className="flex flex-wrap justify-center gap-4">
                        <button
                            onClick={() => setActiveTab('scanner')}
                            className={`px-6 py-2 rounded-full font-medium transition-all ${activeTab === 'scanner'
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                }`}
                        >
                            New Scan
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`px-6 py-2 rounded-full font-medium transition-all flex items-center gap-2 ${activeTab === 'history'
                                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                }`}
                        >
                            <History size={18} /> History
                        </button>
                    </div>
                </header>

                {activeTab === 'scanner' ? (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
                            {PROFILES.map((profile) => (
                                <button
                                    key={profile.id}
                                    onClick={() => setSelectedProfile(profile.id)}
                                    className={`relative p-6 rounded-xl border text-left transition-all duration-300 group ${selectedProfile === profile.id
                                        ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-500/20'
                                        : 'bg-gray-900/50 border-gray-800 hover:border-gray-600 hover:bg-gray-800/50'
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className={`p-3 rounded-lg ${selectedProfile === profile.id ? 'bg-blue-500/20' : 'bg-gray-800 group-hover:bg-gray-700'}`}>
                                            {profile.icon}
                                        </div>
                                        {selectedProfile === profile.id && (
                                            <div className="h-3 w-3 bg-blue-400 rounded-full shadow-[0_0_10px_rgba(96,165,250,0.8)] animate-pulse"></div>
                                        )}
                                    </div>
                                    <h3 className={`text-lg font-bold mb-1 ${selectedProfile === profile.id ? 'text-white' : 'text-gray-300'}`}>
                                        {profile.name}
                                    </h3>
                                    <p className="text-sm text-gray-500 leading-relaxed">
                                        {profile.description}
                                    </p>
                                </button>
                            ))}
                        </div>

                        <div className="flex justify-center mb-12">
                            <button
                                onClick={handleRunScan}
                                disabled={isLoading}
                                className={`
                      relative overflow-hidden px-12 py-4 rounded-full font-bold text-lg tracking-wide transition-all duration-300
                      ${isLoading
                                        ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg shadow-blue-600/30 hover:shadow-blue-600/50 hover:scale-105'
                                    }
                    `}
                            >
                                <span className="relative z-10 flex items-center gap-2">
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="animate-spin" /> Scanning Market...
                                        </>
                                    ) : (
                                        <>
                                            <Search className="w-5 h-5" /> Run AI Scan
                                        </>
                                    )}
                                </span>
                            </button>
                        </div>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-6 mb-12 text-center max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4">
                                <div className="flex items-center justify-center gap-2 text-red-400 font-bold mb-2">
                                    <AlertCircle /> Scan Failed
                                </div>
                                <p className="text-gray-300">{error}</p>
                            </div>
                        )}

                        {isLoading && (
                            <div className="text-center py-20 animate-in fade-in duration-1000">
                                <div className="inline-block relative">
                                    <div className="absolute inset-0 bg-blue-500 blur-3xl opacity-20 rounded-full"></div>
                                    <Loader2 className="w-16 h-16 text-blue-500 animate-spin relative z-10 mx-auto" />
                                </div>
                                <p className="text-gray-400 mt-6 text-lg animate-pulse">
                                    AI Agent is analyzing thousands of tickers...
                                </p>
                                <p className="text-gray-600 text-sm mt-2">
                                    This may take 30-60 seconds depending on market complexity.
                                </p>
                            </div>
                        )}

                        {results && !isLoading && (
                            <ScannerResults results={results} onTickerSelect={onTickerSelect} />
                        )}
                    </>
                ) : (
                    <div className="animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                <Clock className="text-purple-400" /> Scan History
                            </h2>
                            {history.length > 0 && (
                                <button
                                    onClick={handleClearHistory}
                                    className="text-red-400 hover:text-red-300 text-sm flex items-center gap-1 px-3 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
                                >
                                    <Trash2 size={14} /> Clear History
                                </button>
                            )}
                        </div>

                        {history.length === 0 ? (
                            <div className="text-center py-20 text-gray-500 bg-gray-900/30 rounded-2xl border border-gray-800">
                                <History size={48} className="mx-auto mb-4 opacity-20" />
                                <p>No scan history available yet.</p>
                                <button
                                    onClick={() => setActiveTab('scanner')}
                                    className="mt-4 text-blue-400 hover:text-blue-300 text-sm font-medium"
                                >
                                    Run your first scan
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {history.map((item) => (
                                    <div
                                        key={item.id}
                                        onClick={() => handleLoadHistoryItem(item)}
                                        className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 hover:border-purple-500/50 hover:bg-gray-800/50 transition-all cursor-pointer group"
                                    >
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-4">
                                                <div className="p-2 bg-gray-800 rounded-lg text-purple-400 group-hover:text-purple-300 group-hover:bg-purple-500/20 transition-colors">
                                                    {PROFILES.find(p => p.id === item.profile)?.icon || <Search size={20} />}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-white group-hover:text-purple-300 transition-colors">
                                                        {PROFILES.find(p => p.id === item.profile)?.name || item.profile}
                                                    </h3>
                                                    <p className="text-sm text-gray-500">
                                                        {new Date(item.timestamp).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-lg font-bold text-white">
                                                    {item.alerts.length} <span className="text-sm font-normal text-gray-500">Candidates</span>
                                                </div>
                                                <div className="text-xs text-blue-400 font-medium mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    Click to view results →
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ScannerDashboard;
