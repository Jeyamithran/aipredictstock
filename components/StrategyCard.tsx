import React from 'react';
import { Sparkles, TrendingUp, TrendingDown, AlertCircle, CheckCircle2, PlayCircle } from 'lucide-react';

interface StrategyCardProps {
    strategy: {
        recommendedContract: string;
        reasoning: string;
        confidence: number;
        maxProfit: string;
        maxLoss: string;
        action: 'BUY_CALL' | 'BUY_PUT' | 'WAIT';
        modelUsed?: string;
    } | null;
    loading: boolean;
    onGenerate: () => void;
    onSimulate?: () => void;
    onChat?: () => void;
}

export const StrategyCard: React.FC<StrategyCardProps> = ({ strategy, loading, onGenerate, onSimulate, onChat }) => {
    if (!strategy && !loading) {
        return (
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6 flex flex-col items-center justify-center text-center">
                <Sparkles className="w-8 h-8 text-purple-500 mb-3" />
                <h3 className="text-lg font-semibold text-white mb-2">AI Strategy Finder</h3>
                <p className="text-sm text-gray-400 mb-4 max-w-md">
                    Let Gemini analyze the Option Chain and Greeks to find the single best contract for this setup.
                </p>
                <button
                    onClick={onGenerate}
                    className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-purple-900/20"
                >
                    Find Best Option
                </button>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-8 flex flex-col items-center justify-center animate-pulse">
                <div className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-4"></div>
                <p className="text-gray-400 font-medium">Analyzing Greeks & Liquidity...</p>
            </div>
        );
    }

    if (!strategy) return null;

    const isCall = strategy.action === 'BUY_CALL';
    const isPut = strategy.action === 'BUY_PUT';
    const isWait = strategy.action === 'WAIT';

    const borderColor = isCall ? 'border-emerald-500/50' : isPut ? 'border-rose-500/50' : 'border-gray-500/50';
    const bgColor = isCall ? 'bg-emerald-900/10' : isPut ? 'bg-rose-900/10' : 'bg-gray-900/10';
    const textColor = isCall ? 'text-emerald-400' : isPut ? 'text-rose-400' : 'text-gray-400';
    const Icon = isCall ? TrendingUp : isPut ? TrendingDown : AlertCircle;

    return (
        <div className={`relative overflow-hidden rounded-xl border ${borderColor} ${bgColor} p-6 transition-all`}>
            {/* Background Glow */}
            <div className={`absolute -top-20 -right-20 w-64 h-64 rounded-full blur-3xl opacity-10 ${isCall ? 'bg-emerald-500' : isPut ? 'bg-rose-500' : 'bg-gray-500'}`}></div>

            <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isCall ? 'bg-emerald-500/20' : isPut ? 'bg-rose-500/20' : 'bg-gray-500/20'}`}>
                            <Icon className={`w-6 h-6 ${textColor}`} />
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Recommended Strategy</h3>
                            <div className={`text-2xl font-bold ${textColor}`}>
                                {strategy.action.replace('_', ' ')}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        {(strategy.reasoning.toLowerCase().includes('whale') || strategy.reasoning.toLowerCase().includes('institutional')) && (
                            <div className="flex items-center gap-1.5 bg-blue-900/50 px-3 py-1 rounded-full border border-blue-500/50 animate-pulse">
                                <span className="text-lg">🐋</span>
                                <span className="text-xs font-bold text-blue-200">WHALE DETECTED</span>
                            </div>
                        )}
                        <div className="flex items-center gap-1.5 bg-neutral-900/80 px-3 py-1 rounded-full border border-neutral-700">
                            <CheckCircle2 className={`w-3.5 h-3.5 ${strategy.confidence > 70 ? 'text-emerald-400' : 'text-yellow-400'}`} />
                            <span className="text-xs font-mono text-gray-300">{strategy.confidence}% Conf</span>
                        </div>
                    </div>
                </div>

                <div className="bg-neutral-900/60 rounded-lg p-4 border border-neutral-800 mb-4">
                    <div className="text-lg font-mono font-bold text-white mb-1">
                        {strategy.recommendedContract}
                    </div>
                    <p className="text-sm text-gray-400 leading-relaxed">
                        {strategy.reasoning}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-neutral-900/40 p-3 rounded-lg border border-neutral-800/50">
                        <div className="text-[10px] uppercase text-gray-500 font-bold mb-1">Max Profit</div>
                        <div className="text-sm font-mono text-emerald-400">{strategy.maxProfit}</div>
                    </div>
                    <div className="bg-neutral-900/40 p-3 rounded-lg border border-neutral-800/50">
                        <div className="text-[10px] uppercase text-gray-500 font-bold mb-1">Max Loss</div>
                        <div className="text-sm font-mono text-rose-400">{strategy.maxLoss}</div>
                    </div>
                </div>

                <div className="mt-4 flex justify-between items-center">
                    <div className="flex flex-col items-start gap-1">
                        <button
                            onClick={onGenerate}
                            className="text-xs text-gray-500 hover:text-white underline decoration-dotted transition-colors"
                        >
                            Regenerate Analysis
                        </button>
                        {strategy.modelUsed && (
                            <span className="text-[10px] text-gray-600 font-mono">
                                AI: {strategy.modelUsed}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {onChat && (
                            <button
                                onClick={onChat}
                                className="flex items-center gap-2 px-3 py-2 bg-indigo-900/30 hover:bg-indigo-900/50 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-medium transition-all"
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                                Ask AI
                            </button>
                        )}
                        {onSimulate && ( // Allow simulation even if waiting (for manual entry)
                            <button
                                onClick={onSimulate}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-indigo-900/20"
                            >
                                <PlayCircle className="w-4 h-4" />
                                Simulate Trade
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
