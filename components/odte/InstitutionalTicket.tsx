import React, { useState } from 'react';
import { Target, Shield, Clock, Split, GitMerge, FastForward } from 'lucide-react';
import { ODTEOption, ODTESimulationPosition } from '../../types';

interface InstitutionalTicketProps {
    selectedOption: ODTEOption | null;
    currentPrice: number;
    onExecuteOrder: (order: any) => void;
}

export const InstitutionalTicket: React.FC<InstitutionalTicketProps> = ({ selectedOption, currentPrice, onExecuteOrder }) => {
    const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT' | 'STOP'>('MARKET');
    const [algoType, setAlgoType] = useState<'NONE' | 'TWAP' | 'VWAP' | 'ICEBERG'>('NONE');
    const [quantity, setQuantity] = useState(10);
    const [isHedgeEnabled, setIsHedgeEnabled] = useState(false);
    const [limitPrice, setLimitPrice] = useState(currentPrice);

    if (!selectedOption) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 bg-neutral-900/30 rounded-lg p-4">
                <Target className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">Select an option to trade</p>
            </div>
        );
    }

    const handleExecute = () => {
        onExecuteOrder({
            option: selectedOption,
            type: orderType,
            algo: algoType,
            quantity,
            price: orderType === 'MARKET' ? currentPrice : limitPrice,
            hedge: isHedgeEnabled
        });
    };

    return (
        <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-3 flex flex-col gap-3 font-sans">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-neutral-800 pb-2">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${selectedOption.type === 'call' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="font-mono font-bold text-white">{selectedOption.ticker}</span>
                </div>
                <div className="text-xs text-gray-400 font-mono">${currentPrice.toFixed(2)}</div>
            </div>

            {/* Order Type Selector */}
            <div className="grid grid-cols-3 gap-1 bg-neutral-950 p-1 rounded-md">
                {['MARKET', 'LIMIT', 'STOP'].map(type => (
                    <button
                        key={type}
                        onClick={() => setOrderType(type as any)}
                        className={`text-xs py-1 rounded ${orderType === type ? 'bg-neutral-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        {type}
                    </button>
                ))}
            </div>

            {/* Quantity & Price */}
            <div className="flex gap-2">
                <div className="flex-1">
                    <label className="text-[10px] text-gray-500 uppercase">Qty</label>
                    <input
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(Number(e.target.value))}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-sm text-white focus:border-purple-500 outline-none"
                    />
                </div>
                {orderType !== 'MARKET' && (
                    <div className="flex-1">
                        <label className="text-[10px] text-gray-500 uppercase">Price</label>
                        <input
                            type="number"
                            value={limitPrice}
                            onChange={(e) => setLimitPrice(Number(e.target.value))}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-sm text-white focus:border-purple-500 outline-none"
                        />
                    </div>
                )}
            </div>

            {/* Algo Selector */}
            <div>
                <label className="text-[10px] text-gray-500 uppercase mb-1 flex items-center gap-1">
                    <Split className="w-3 h-3" /> Algo Strategy
                </label>
                <div className="grid grid-cols-4 gap-1">
                    {[
                        { id: 'NONE', icon: null, label: 'None' },
                        { id: 'TWAP', icon: Clock, label: 'TWAP' },
                        { id: 'VWAP', icon: FastForward, label: 'VWAP' },
                        { id: 'ICEBERG', icon: Split, label: 'Ice' }
                    ].map(algo => (
                        <button
                            key={algo.id}
                            onClick={() => setAlgoType(algo.id as any)}
                            className={`flex flex-col items-center justify-center p-2 rounded border ${algoType === algo.id ? 'bg-purple-900/20 border-purple-500/50 text-purple-300' : 'bg-neutral-950 border-neutral-800 text-gray-500 hover:border-gray-600'}`}
                        >
                            {algo.icon && <algo.icon className="w-3 h-3 mb-1" />}
                            <span className="text-[9px]">{algo.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Iceberg Visualization */}
            {algoType === 'ICEBERG' && (
                <div className="bg-blue-900/10 border border-blue-500/20 rounded p-2 text-xs text-blue-300 flex items-center gap-2">
                    <Split className="w-3 h-3" />
                    <span>Splitting {quantity} lots into 5 orders of {Math.ceil(quantity / 5)} over 30s</span>
                </div>
            )}

            {/* Hedge Mode */}
            <div
                className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${isHedgeEnabled ? 'bg-green-900/10 border-green-500/30' : 'bg-neutral-950 border-neutral-800 hover:border-gray-700'}`}
                onClick={() => setIsHedgeEnabled(!isHedgeEnabled)}
            >
                <Shield className={`w-4 h-4 ${isHedgeEnabled ? 'text-green-400' : 'text-gray-500'}`} />
                <div className="flex-1">
                    <div className={`text-xs font-semibold ${isHedgeEnabled ? 'text-green-300' : 'text-gray-400'}`}>Delta Neutral Hedge</div>
                    <div className="text-[10px] text-gray-500">Auto-buy Put to flatten delta</div>
                </div>
                {isHedgeEnabled && <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>}
            </div>

            {/* Execute Button */}
            <button
                onClick={handleExecute}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold py-2 rounded hover:from-purple-500 hover:to-indigo-500 active:scale-95 transition-all text-sm flex items-center justify-center gap-2"
            >
                {algoType !== 'NONE' ? <Clock className="w-4 h-4" /> : <Target className="w-4 h-4" />}
                {algoType !== 'NONE' ? `Start ${algoType}` : 'Place Order'}
            </button>
        </div>
    );
};
