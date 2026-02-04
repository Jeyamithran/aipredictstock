import React from 'react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip, Legend } from 'recharts';
import { SmartStrikeScore, ODTEOption } from '../../types';

interface SmartStrikeRadarProps {
    scores: SmartStrikeScore | null;
    selectedOption: ODTEOption | null;
}

export const SmartStrikeRadar: React.FC<SmartStrikeRadarProps> = ({ scores, selectedOption }) => {
    if (!scores || !selectedOption) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 bg-neutral-900/30 rounded-lg p-4">
                <span className="mb-2 text-2xl">🕸️</span>
                <p className="text-sm">Select an option to analyze</p>
                <p className="text-xs text-gray-600">Liquidity vs Edge vs Risk</p>
            </div>
        );
    }

    // Transform for Recharts Radar
    const data = [
        { subject: 'Liquidity', A: scores.liquidityScore, fullMark: 100 },
        { subject: 'Gamma Edge', A: scores.edgeScore, fullMark: 100 },
        { subject: 'Pin Risk', A: scores.riskScore, fullMark: 100 },
        { subject: 'Value', A: scores.totalScore, fullMark: 100 }, // Overall Score
    ];

    return (
        <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-lg h-full flex flex-col">
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                    <span className="text-purple-400">⚡</span> Smart Strike Radar
                </h3>
                <div className="text-xs font-mono text-gray-400 bg-neutral-800 px-2 py-0.5 rounded">
                    {selectedOption.ticker}
                </div>
            </div>

            <div className="flex-1 w-full min-h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
                        <PolarGrid stroke="#333" />
                        <PolarAngleAxis
                            dataKey="subject"
                            tick={{ fill: '#9CA3AF', fontSize: 10 }}
                        />
                        <PolarRadiusAxis
                            angle={30}
                            domain={[0, 100]}
                            tick={{ fill: '#4B5563', fontSize: 8 }}
                            axisLine={false}
                        />
                        <Radar
                            name={selectedOption.ticker}
                            dataKey="A"
                            stroke="#8B5CF6"
                            strokeWidth={2}
                            fill="#8B5CF6"
                            fillOpacity={0.4}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#171717', borderColor: '#333' }}
                            itemStyle={{ color: '#E5E7EB', fontSize: '12px' }}
                        />
                    </RadarChart>
                </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-neutral-800">
                <div className="text-center">
                    <div className="text-[10px] text-gray-500 uppercase">Liquidity</div>
                    <div className={`text-sm font-mono ${scores.liquidityScore > 70 ? 'text-green-400' : 'text-gray-300'}`}>
                        {scores.liquidityScore}
                    </div>
                </div>
                <div className="text-center">
                    <div className="text-[10px] text-gray-500 uppercase">Edge</div>
                    <div className={`text-sm font-mono ${scores.edgeScore > 70 ? 'text-blue-400' : 'text-gray-300'}`}>
                        {scores.edgeScore}
                    </div>
                </div>
                <div className="text-center">
                    <div className="text-[10px] text-gray-500 uppercase">Risk</div>
                    <div className={`text-sm font-mono ${scores.riskScore > 80 ? 'text-red-400' : 'text-gray-300'}`}>
                        {scores.riskScore}
                    </div>
                </div>
            </div>
        </div>
    );
};
