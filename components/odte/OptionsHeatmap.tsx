import React, { useMemo } from 'react';
import { HeatmapData } from '../../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface OptionsHeatmapProps {
    data: HeatmapData[];
    spotPrice: number;
}

export const OptionsHeatmap: React.FC<OptionsHeatmapProps> = ({ data, spotPrice }) => {

    // Focus on near-the-money
    const filteredData = useMemo(() => {
        const lower = spotPrice * 0.98;
        const upper = spotPrice * 1.02;
        return data.filter(d => d.strike >= lower && d.strike <= upper);
    }, [data, spotPrice]);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-neutral-900 border border-neutral-700 p-3 rounded-lg shadow-xl text-xs">
                    <p className="font-bold text-gray-200 mb-2">Strike: ${label}</p>
                    <div className="space-y-1">
                        <p className="text-blue-400">Total Vol: {(payload[0].value + payload[1].value).toLocaleString()}</p>
                        <p className="text-emerald-400">Calls: {payload[0].value.toLocaleString()}</p>
                        <p className="text-rose-400">Puts: {payload[1].value.toLocaleString()}</p>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 h-[300px] flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-white">Options Volume Heatmap</h3>
                <span className="text-[10px] text-gray-500">Real-time Volume by Strike</span>
            </div>

            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={filteredData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <XAxis
                            dataKey="strike"
                            stroke="#666"
                            tick={{ fill: '#666', fontSize: 10 }}
                        />
                        <YAxis
                            stroke="#666"
                            tick={{ fill: '#666', fontSize: 10 }}
                            tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                        {/* Calls on top (positive), Puts on bottom (negative) logic or side-by-side? 
                             Let's do side-by-side for clarity on volume size comparison */}
                        <Bar dataKey="callVolume" fill="#10b981" radius={[4, 4, 0, 0]} animationDuration={500} />
                        <Bar dataKey="putVolume" fill="#f43f5e" radius={[4, 4, 0, 0]} animationDuration={500} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
