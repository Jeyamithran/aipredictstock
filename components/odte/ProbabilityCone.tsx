import React from 'react';
import { ExpectedMove } from '../../types';

interface ProbabilityConeProps {
    spotPrice: number;
    expectedMove: ExpectedMove;
}

export const ProbabilityCone: React.FC<ProbabilityConeProps> = ({ spotPrice, expectedMove }) => {

    // Calculate visualization percentages for the DOM overlay
    // We treat the "bar" as a range from spot - 3sigma to spot + 3sigma
    const range = expectedMove.twoSigma * 1.5; // Enough space
    const startPrice = spotPrice - range;
    const totalRange = range * 2;

    const getLeftPct = (price: number) => ((price - startPrice) / totalRange) * 100;

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col justify-center h-[140px]">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-bold text-white">Probability Cone (16:00 Close)</h3>
                <span className="text-xs font-mono text-indigo-400">IV Derived</span>
            </div>

            <div className="relative w-full h-12">
                {/* 2 Sigma Bar */}
                <div
                    className="absolute top-3 h-2 bg-neutral-800 rounded-full w-full"
                />

                {/* 1 Sigma Zone */}
                <div
                    className="absolute top-3 h-2 bg-indigo-900/40 rounded-full"
                    style={{
                        left: `${getLeftPct(spotPrice - expectedMove.twoSigma)}%`,
                        width: `${getLeftPct(spotPrice + expectedMove.twoSigma) - getLeftPct(spotPrice - expectedMove.twoSigma)}%`
                    }}
                />

                {/* 0.5 Sigma Zone (Inner Core) */}
                <div
                    className="absolute top-3 h-2 bg-indigo-500/50 rounded-full"
                    style={{
                        left: `${getLeftPct(spotPrice - expectedMove.oneSigma)}%`,
                        width: `${getLeftPct(spotPrice + expectedMove.oneSigma) - getLeftPct(spotPrice - expectedMove.oneSigma)}%`
                    }}
                />

                {/* Spot Marker */}
                <div
                    className="absolute top-1 transform -translate-x-1/2 flex flex-col items-center"
                    style={{ left: `${getLeftPct(spotPrice)}%` }}
                >
                    <div className="w-0.5 h-6 bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]"></div>
                    <div className="text-[10px] text-yellow-400 font-bold mt-1 max-w-[40px] text-center leading-none">{spotPrice.toFixed(2)}</div>
                </div>

                {/* Upper 1 Sigma Label */}
                <div
                    className="absolute -bottom-6 transform -translate-x-1/2 text-[10px] text-indigo-300 font-mono"
                    style={{ left: `${getLeftPct(spotPrice + expectedMove.oneSigma)}%` }}
                >
                    +1σ<br />{(spotPrice + expectedMove.oneSigma).toFixed(2)}
                </div>

                {/* Lower 1 Sigma Label */}
                <div
                    className="absolute -bottom-6 transform -translate-x-1/2 text-[10px] text-indigo-300 font-mono"
                    style={{ left: `${getLeftPct(spotPrice - expectedMove.oneSigma)}%` }}
                >
                    -1σ<br />{(spotPrice - expectedMove.oneSigma).toFixed(2)}
                </div>
            </div>
        </div>
    );
};
