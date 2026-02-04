import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine } from 'recharts';
import { GammaExposure } from '../../types';

interface GammaExposureChartProps {
    data: GammaExposure[];
    spotPrice: number;
}

export const GammaExposureChart: React.FC<GammaExposureChartProps> = ({ data, spotPrice }) => {

    // Filter to relevant range (e.g., ±5% of spot) to avoid empty chart
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
                        <p className="text-emerald-400">Call GEX: ${payload[0].value.toLocaleString()}</p>
                        <p className="text-rose-400">Put GEX: ${Math.abs(payload[1].value).toLocaleString()}</p>
                        <div className="border-t border-gray-700 my-1 pt-1">
                            <p className="text-white font-semibold">Net: ${(payload[0].value + payload[1].value).toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 h-[300px] flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-white">Gamma Exposure Profile</h3>
                <div className="text-[10px] flex gap-3 text-gray-500">
                    <span className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500 rounded-sm"></div>Call Wall</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 bg-rose-500 rounded-sm"></div>Put Wall</span>
                </div>
            </div>

            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={filteredData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                        <XAxis
                            dataKey="strike"
                            stroke="#666"
                            tick={{ fill: '#666', fontSize: 10 }}
                            tickFormatter={(val) => `$${val}`}
                        />
                        <YAxis
                            stroke="#666"
                            tick={{ fill: '#666', fontSize: 10 }}
                            tickFormatter={(val) => `${(val / 1000000).toFixed(0)}M`}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                        <ReferenceLine x={spotPrice} stroke="#fbbf24" strokeDasharray="3 3" label={{ value: 'Spot', fill: '#fbbf24', fontSize: 10, position: 'top' }} />
                        <ReferenceLine y={0} stroke="#444" />
                        <Bar dataKey="callGamma" stackId="a" fill="#10b981" animationDuration={500} />
                        <Bar dataKey="putGamma" stackId="a" fill="#f43f5e" animationDuration={500} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
