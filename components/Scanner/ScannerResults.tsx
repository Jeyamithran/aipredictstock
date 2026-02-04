import React, { useEffect, useState } from 'react';
import { ScannerResponse, ScannerAlert, StockData } from '../../types';
import { TrendingUp, TrendingDown, Activity, DollarSign, AlertTriangle, Crosshair, Zap, BarChart2, MousePointerClick } from 'lucide-react';
import { getFMPQuotes } from '../../services/fmpService';

interface ScannerResultsProps {
    results: ScannerResponse;
    onTickerSelect?: (ticker: string) => void;
}

const AlertCard: React.FC<{ alert: ScannerAlert; realPrice?: number; onTickerSelect?: (ticker: string) => void }> = ({ alert, realPrice, onTickerSelect }) => {
    const isUptrend = alert.TrendState === 'Uptrend';

    // Use real price if available, otherwise fallback to AI price. Ensure we have a valid number.
    const displayPrice = realPrice ?? alert.EntryPrice ?? 0;

    // Recalculate gain based on real price if available
    const gain = alert.PotentialGainPercent || (displayPrice > 0 ? ((alert.TargetPrice - displayPrice) / displayPrice * 100) : 0);

    return (
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-5 hover:border-blue-500/50 transition-all duration-300 shadow-lg hover:shadow-blue-500/10 group">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onTickerSelect?.(alert.Ticker)}
                            className="text-2xl font-bold text-white tracking-tight hover:text-blue-400 transition-colors flex items-center gap-1 group-hover:underline decoration-blue-500/50 underline-offset-4"
                        >
                            {alert.Ticker}
                            <MousePointerClick size={16} className="opacity-0 group-hover:opacity-50" />
                        </button>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${isUptrend ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                            }`}>
                            {alert.TrendState}
                        </span>
                        {alert.Source && (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${alert.Source === 'Both'
                                ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                                : alert.Source === 'OpenAI'
                                    ? 'bg-green-500/10 text-green-300 border-green-500/30'
                                    : alert.Source === 'Gemini'
                                        ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                                        : 'bg-teal-500/10 text-teal-300 border-teal-500/30'
                                }`}>
                                {alert.Source === 'Both' ? 'Hybrid' : alert.Source}
                            </span>
                        )}
                        {alert.MomentumScore !== null && alert.MomentumScore !== undefined && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400 flex items-center gap-1">
                                <Zap size={10} /> {alert.MomentumScore}
                            </span>
                        )}
                    </div>
                    <p className="text-gray-400 text-sm mt-1">{alert.SetupType}</p>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-bold text-green-400">+{gain.toFixed(1)}%</div>
                    <div className="text-xs text-gray-500">Potential Gain</div>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-gray-900/50 rounded-lg p-2 text-center border border-gray-700/50">
                    <div className="text-gray-500 text-xs mb-1">Entry</div>
                    <div className={`font-mono ${realPrice ? 'text-emerald-400 font-bold' : 'text-white'}`}>
                        ${(displayPrice || 0).toFixed(2)}
                    </div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-2 text-center border border-gray-700/50">
                    <div className="text-gray-500 text-xs mb-1">Target</div>
                    <div className="text-green-400 font-mono">${(alert.TargetPrice || 0).toFixed(2)}</div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-2 text-center border border-gray-700/50">
                    <div className="text-gray-500 text-xs mb-1">Stop</div>
                    <div className="text-red-400 font-mono">${(alert.StopPrice || 0).toFixed(2)}</div>
                </div>
            </div>

            <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400 flex items-center gap-1"><Activity size={14} /> R/R Ratio</span>
                    <span className="text-white font-medium">{(alert.RiskReward || 0).toFixed(1)}x</span>
                </div>

                {alert.PrimaryCatalyst && (
                    <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-500/20">
                        <div className="flex items-center gap-2 text-blue-400 text-xs font-bold mb-1 uppercase tracking-wider">
                            <Zap size={12} /> {alert.CatalystType || 'Catalyst'}
                        </div>
                        <p className="text-gray-300 text-sm leading-relaxed">{alert.PrimaryCatalyst}</p>
                    </div>
                )}

                <div className="space-y-1">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Analysis</div>
                    <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap font-sans">
                        {alert.DetailedAnalysis}
                    </div>
                </div>

                {alert.DecisionFactors && alert.DecisionFactors.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                        {alert.DecisionFactors.slice(0, 3).map((factor, idx) => (
                            <span key={idx} className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded-full border border-gray-600">
                                {factor}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            <div className="mt-4 pt-3 border-t border-gray-700/50 flex justify-between items-center text-xs text-gray-500">
                <span>Vol: {alert.VolumeVsAvg ? `${alert.VolumeVsAvg}x Avg` : 'N/A'}</span>
                <span>{new Date(alert.DataFreshness).toLocaleTimeString()}</span>
            </div>
        </div>
    );
};

const ScannerResults: React.FC<ScannerResultsProps> = ({ results, onTickerSelect }) => {
    const [realtimePrices, setRealtimePrices] = useState<Record<string, number>>({});

    useEffect(() => {
        const fetchRealtimePrices = async () => {
            const allTickers = [
                ...results.SmallCap.map(a => a.Ticker),
                ...results.MidCap.map(a => a.Ticker),
                ...results.LargeCap.map(a => a.Ticker)
            ];

            if (allTickers.length === 0) return;

            try {
                // Fetch in batches if needed, but for now just fetch all
                // FMP batch quote endpoint supports many tickers
                const quotes = await getFMPQuotes(allTickers);
                const priceMap: Record<string, number> = {};
                quotes.forEach(q => {
                    priceMap[q.ticker] = q.price;
                });
                setRealtimePrices(priceMap);
            } catch (error) {
                console.error("Failed to fetch realtime prices for scanner results:", error);
            }
        };

        fetchRealtimePrices();
    }, [results]);

    const hasResults = results.SmallCap.length > 0 || results.MidCap.length > 0 || results.LargeCap.length > 0;

    if (!hasResults) {
        return (
            <div className="text-center py-20 text-gray-500">
                <Activity size={48} className="mx-auto mb-4 opacity-20" />
                <p>No alerts found for this scan. Try a different profile or check back later.</p>
            </div>
        );
    }

    return (
        <div className="space-y-12 animate-in fade-in duration-700">
            {results.SmallCap.length > 0 && (
                <section>
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-8 w-1 bg-blue-500 rounded-full"></div>
                        <h2 className="text-2xl font-bold text-white">Small Cap <span className="text-gray-500 text-lg font-normal">(${'<'}2B)</span></h2>
                        <span className="bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full text-xs">{results.SmallCap.length}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {results.SmallCap.map((alert, idx) => (
                            <AlertCard
                                key={`${alert.Ticker}-${idx}`}
                                alert={alert}
                                realPrice={realtimePrices[alert.Ticker]}
                                onTickerSelect={onTickerSelect}
                            />
                        ))}
                    </div>
                </section>
            )}

            {results.MidCap.length > 0 && (
                <section>
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-8 w-1 bg-purple-500 rounded-full"></div>
                        <h2 className="text-2xl font-bold text-white">Mid Cap <span className="text-gray-500 text-lg font-normal">($2B - $10B)</span></h2>
                        <span className="bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full text-xs">{results.MidCap.length}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {results.MidCap.map((alert, idx) => (
                            <AlertCard
                                key={`${alert.Ticker}-${idx}`}
                                alert={alert}
                                realPrice={realtimePrices[alert.Ticker]}
                                onTickerSelect={onTickerSelect}
                            />
                        ))}
                    </div>
                </section>
            )}

            {results.LargeCap.length > 0 && (
                <section>
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-8 w-1 bg-green-500 rounded-full"></div>
                        <h2 className="text-2xl font-bold text-white">Large Cap <span className="text-gray-500 text-lg font-normal">(${'>'}10B)</span></h2>
                        <span className="bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full text-xs">{results.LargeCap.length}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {results.LargeCap.map((alert, idx) => (
                            <AlertCard
                                key={`${alert.Ticker}-${idx}`}
                                alert={alert}
                                realPrice={realtimePrices[alert.Ticker]}
                                onTickerSelect={onTickerSelect}
                            />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
};

export default ScannerResults;
