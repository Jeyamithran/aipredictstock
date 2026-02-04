import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  color?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({ title, value, subValue, trend, color }) => {
  const getIcon = () => {
    switch (trend) {
      case 'up': return <ArrowUpRight className="w-4 h-4" />;
      case 'down': return <ArrowDownRight className="w-4 h-4" />;
      default: return <Minus className="w-4 h-4" />;
    }
  };

  const getTrendColor = () => {
    if (color) return color;
    switch (trend) {
      case 'up': return 'text-emerald-400';
      case 'down': return 'text-rose-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-4 backdrop-blur-sm hover:border-neutral-700 transition-colors">
      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">{title}</h3>
      <div className="flex items-end gap-2">
        <div className="text-2xl font-mono font-bold text-white">{value}</div>
        {subValue && (
          <div className={`flex items-center mb-1 text-sm font-medium ${getTrendColor()}`}>
            {trend && getIcon()}
            <span className="ml-1">{subValue}</span>
          </div>
        )}
      </div>
    </div>
  );
};