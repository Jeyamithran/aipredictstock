import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, X, Trash2, Copy, Check } from 'lucide-react';
import { ChatMessage, ChatContext } from '../types';
import { sendChatMessageToOpenAI } from '../services/openaiService';

interface AIChatPanelProps {
    context: ChatContext;
    onClose: () => void;
}

const SUGGESTED_QUESTIONS = [
    "What is the confidence level of this entry and why?",
    "What is the stop-loss and the exact invalidation level?",
    "What is the expected Risk-Reward ratio for this setup?",
    "Is this a breakout or a fake breakout? Confirm with volume?",
    "Are RSI, EMA trend, and momentum indicators aligned for this direction?",
    "What is the best expiry for this trade (same-day or next-day) to avoid theta decay?",
    "How much will this contract move for a $1 stock move (Delta)?",
    "Are SPY/QQQ and sector stocks confirming the same direction?",
    "Are there any news/events in the next 1-2 hours that can impact volatility?",
    "What is the profit-taking plan (trim levels and full exit level)?"
];

export const AIChatPanel: React.FC<AIChatPanelProps> = ({ context, onClose }) => {
    const [messages, setMessages] = useState<ChatMessage[]>(() => {
        const saved = localStorage.getItem(`chat_history_${context.ticker}`);
        return saved ? JSON.parse(saved) : [];
    });
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);



    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Persist messages to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem(`chat_history_${context.ticker}`, JSON.stringify(messages));
    }, [messages, context.ticker]);

    useEffect(() => {
        // Focus input on mount
        inputRef.current?.focus();
    }, []);

    const handleSendMessage = async (messageText?: string) => {
        const text = messageText || input.trim();
        if (!text || isLoading) return;

        // Refocus input immediately to keep flow, especially if clicking suggested questions
        inputRef.current?.focus();

        const userMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: text,
            timestamp: Date.now(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        // Add placeholder for AI response
        const aiMessageId = crypto.randomUUID();
        const placeholderMessage: ChatMessage = {
            id: aiMessageId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            isStreaming: true,
        };
        setMessages(prev => [...prev, placeholderMessage]);

        try {
            const response = await sendChatMessageToOpenAI(text, messages, context);

            // Update with actual response
            setMessages(prev =>
                prev.map(msg =>
                    msg.id === aiMessageId
                        ? { ...msg, content: response, isStreaming: false }
                        : msg
                )
            );
            // Refocus again after response just in case
            setTimeout(() => inputRef.current?.focus(), 100);
        } catch (error) {
            console.error('Chat error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setMessages(prev =>
                prev.map(msg =>
                    msg.id === aiMessageId
                        ? { ...msg, content: `Error: ${errorMessage}. Please check your API key configuration.`, isStreaming: false }
                        : msg
                )
            );
        } finally {
            setIsLoading(false);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    };

    const handleClearChat = () => {
        setMessages([]);
        localStorage.removeItem(`chat_history_${context.ticker}`);
        setShowClearConfirm(false);
    };

    const handleCopyMessage = (content: string, id: string) => {
        navigator.clipboard.writeText(content);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    return (
        <div className="bg-neutral-900 border border-indigo-500/30 rounded-xl overflow-hidden flex flex-col h-[500px] shadow-2xl">
            {/* Header */}
            <div className="bg-neutral-800/80 border-b border-indigo-500/30 p-4 flex justify-between items-center backdrop-blur-sm">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                    <div>
                        <h3 className="text-white font-semibold">AI Trading Assistant</h3>
                        <p className="text-xs text-gray-400">Ask about {context.ticker} options strategy</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {messages.length > 0 && !showClearConfirm && (
                        <button
                            onClick={() => setShowClearConfirm(true)}
                            className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-gray-400 hover:text-red-400"
                            title="Clear chat"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                    {showClearConfirm && (
                        <div className="flex items-center bg-red-900/40 rounded-lg p-1 border border-red-500/30">
                            <span className="text-[10px] text-red-200 px-2 font-medium">Clear?</span>
                            <button
                                onClick={handleClearChat}
                                className="p-1 hover:bg-red-500/40 rounded transition-colors text-red-300"
                                title="Confirm Clear"
                            >
                                <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => setShowClearConfirm(false)}
                                className="p-1 hover:bg-neutral-700/50 rounded transition-colors text-gray-400 ml-1"
                                title="Cancel"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-neutral-950/50">
                {messages.length === 0 && (
                    <div className="text-center py-8">
                        <Sparkles className="w-12 h-12 text-indigo-400 mx-auto mb-4 opacity-50" />
                        <p className="text-gray-400 text-sm mb-4">Ask me anything about your {context.ticker} options trade</p>
                        <div className="grid grid-cols-1 gap-2 max-w-md mx-auto">
                            {SUGGESTED_QUESTIONS.map((question, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleSendMessage(question)}
                                    onMouseDown={(e) => e.preventDefault()}
                                    className="text-xs bg-indigo-900/30 hover:bg-indigo-900/50 border border-indigo-500/30 rounded-lg p-3 text-indigo-100 hover:text-white transition-colors text-left"
                                >
                                    {question}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((message) => (
                    <div
                        key={message.id}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[80%] rounded-lg p-3 ${message.role === 'user'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-neutral-800 text-gray-200 border border-indigo-500/20'
                                }`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-sm whitespace-pre-wrap break-words flex-1">
                                    {message.isStreaming ? (
                                        <span className="flex items-center gap-2">
                                            <span className="animate-pulse">Thinking...</span>
                                            <Sparkles className="w-4 h-4 animate-spin" />
                                        </span>
                                    ) : (
                                        message.content
                                    )}
                                </p>
                                {message.role === 'assistant' && !message.isStreaming && (
                                    <button
                                        onClick={() => handleCopyMessage(message.content, message.id)}
                                        className="flex-shrink-0 p-1 hover:bg-white/10 rounded transition-colors"
                                        title="Copy message"
                                    >
                                        {copiedId === message.id ? (
                                            <Check className="w-3 h-3 text-green-400" />
                                        ) : (
                                            <Copy className="w-3 h-3 text-gray-400" />
                                        )}
                                    </button>
                                )}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1">
                                {new Date(message.timestamp).toLocaleTimeString()}
                            </p>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="bg-neutral-900/80 border-t border-indigo-500/30 p-4">
                <div className="flex gap-2">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about strike prices, expiration, risk/reward..."
                        className="flex-1 bg-neutral-800 border border-indigo-500/30 rounded-lg px-4 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none disabled:opacity-50"
                    />
                    <button
                        onClick={() => handleSendMessage()}
                        onMouseDown={(e) => e.preventDefault()}
                        disabled={!input.trim() || isLoading}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">Press Enter to send, Shift+Enter for new line</p>
            </div>
        </div>
    );
};
