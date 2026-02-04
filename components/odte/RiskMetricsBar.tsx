import React from 'react';
import { ODTEInstitutionalMetrics } from '../../types';
import { Shield, TrendingUp, AlertOctagon, Layers, Activity } from 'lucide-react';

interface RiskMetricsBarProps {
    metrics: ODTEInstitutionalMetrics;
}

export const RiskMetricsBar: React.FC<RiskMetricsBarProps> = ({ metrics }) => {

    // Helper for formatting large numbers
    const formatMoney = (val: number) => {
        const absVal = Math.abs(val);
        const prefix = val < 0 ? '-' : '+';
        if (absVal >= 1000000) return `${prefix}${(absVal / 1000000).toFixed(1)}M`;
        if (absVal >= 1000) return `${prefix}${(absVal / 1000).toFixed(1)}k`;
        return `${prefix}${absVal.toFixed(0)}`;
    };

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
            <MetricCard
                title="Net Gamma"
                value={formatMoney(metrics.netGamma)}
                icon={Layers}
                color={metrics.netGamma > 0 ? "text-emerald-400" : "text-rose-400"}
                subtext="Exposure"
            />
            <MetricCard
                title="Net Delta"
                value={formatMoney(metrics.netDelta)}
                icon={TrendingUp}
                color="text-blue-400"
                subtext="Directional Bias"
            />
            <MetricCard
                title="Theta Burn"
                value={formatMoney(metrics.thetaBurn)}
                icon={Activity}
                color="text-orange-400"
                subtext="Per Minute"
            />
            <MetricCard
                title="Expected Move"
                value={`±${metrics.expectedMove.oneSigma.toFixed(2)}`}
                icon={AlertOctagon}
                color="text-indigo-400"
                subtext="1σ Range"
            />
            <MetricCard
                title="Max Pain"
                value={`$${metrics.expectedMove.maxPain.toFixed(2)}`}
                icon={Shield}
                color="text-purple-400"
                subtext="Pin Target"
            />
            <MetricCard
                title="IV Rank"
                value="68%"
                icon={Activity}
                color="text-yellow-400"
                subtext="High Volatility"
            />
        </div>
    );
};

const MetricCard = ({ title, value, icon: Icon, color, subtext }: any) => (
    <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-3 flex flex-col justify-between">
        <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">{title}</span>
            <Icon className={`w-3 h-3 ${color}`} />
        </div>
        <div>
            <div className={`text-lg font-bold ${color}`}>{value}</div>
            <div className="text-[10px] text-gray-600">{subtext}</div>
        </div>
    </div>
);
