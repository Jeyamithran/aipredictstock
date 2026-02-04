
import React, { useState } from 'react';
import { Copy, Check, FileCode, ChevronDown, ChevronUp, Bell } from 'lucide-react';
import { ENHANCED_PINE_SCRIPT } from '../constants';

export const ScriptViewer: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(ENHANCED_PINE_SCRIPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-8 bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden transition-all duration-300">
      <div 
        className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50 cursor-pointer hover:bg-neutral-800/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <FileCode className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              Enhanced Pine Script
              <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/30 font-mono">v6.0</span>
            </h2>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="flex items-center gap-1"><Bell className="w-3 h-3" /> Optimized for Alerts</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-gray-300 rounded-lg text-xs font-medium transition-colors border border-neutral-700"
          >
            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <div className="text-gray-500">
            {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </div>
      </div>
      
      {isOpen && (
        <div className="animate-in slide-in-from-top-2 duration-200">
            <div className="bg-[#0d0d0d] border-b border-neutral-800 px-4 py-2 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50"></div>
                <span className="ml-2 text-xs text-gray-500 font-mono">TradingView Pine Editor</span>
            </div>
            <pre className="font-mono text-xs text-gray-300 p-4 overflow-x-auto bg-[#0d0d0d] max-h-96 custom-scrollbar">
                <code>{ENHANCED_PINE_SCRIPT}</code>
            </pre>
        </div>
      )}
    </div>
  );
};
