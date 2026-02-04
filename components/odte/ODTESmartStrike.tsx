import React from 'react';
import { ODTEStrategySuggestion } from '../../types';
import { Brain, Target, Clock, Shield } from 'lucide-react';

interface ODTESmartStrikeProps {
    suggestion: ODTEStrategySuggestion | null;
}

export const ODTESmartStrike: React.FC<ODTESmartStrikeProps> = ({ suggestion }) => {
    if (!suggestion) return null;

    return (
        <div className="bg-gradient-to-br from-indigo-900/20 to-purple-900/20 border border-indigo-500/20 rounded-xl p-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
                <Brain className="w-24 h-24 text-indigo-400" />
            </div>

            <h3 className="text-sm font-bold text-indigo-300 flex items-center gap-2 mb-4">
                <Brain className="w-4 h-4" />
                Smart Strike Engine™
            </h3>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <div className="text-xs text-indigo-400/60 uppercase font-semibold mb-1">Market Condition</div>
                    <div className="text-white font-medium text-sm border-l-2 border-indigo-500 pl-2">
                        {suggestion.condition}
                    </div>
                </div>

                <div>
                    <div className="text-xs text-indigo-400/60 uppercase font-semibold mb-1">Suggested Strategy</div>
                    <div className="text-white font-medium text-sm border-l-2 border-purple-500 pl-2">
                        {suggestion.strategy}
                    </div>
                </div>

                <div>
                    <div className="text-xs text-indigo-400/60 uppercase font-semibold mb-1 flex items-center gap-1">
                        <Target className="w-3 h-3" /> Strike Selection
                    </div>
                    <div className="text-gray-300 text-sm pl-2">
                        {suggestion.strikeSelection}
                    </div>
                </div>

                <div>
                    <div className="text-xs text-indigo-400/60 uppercase font-semibold mb-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Best Execution
                    </div>
                    <div className="text-gray-300 text-sm pl-2">
                        {suggestion.timing}
                    </div>
                </div>
            </div>

            <div className="mt-4 pt-3 border-t border-indigo-500/10 flex items-center justify-between">
                <span className="text-xs text-gray-400">AI Confidence</span>
                <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${suggestion.confidence}%` }}
                        ></div>
                    </div>
                    <span className="text-xs font-bold text-indigo-400">{suggestion.confidence}%</span>
                </div>
            </div>
        </div>
    );
};
