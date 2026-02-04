import React, { useState, useEffect } from 'react';

interface HttpAuthProps {
    children: React.ReactNode;
}

const HttpAuth: React.FC<HttpAuthProps> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    // Check if auth is enabled
    // Check environment (Runtime > Build time)
    const getEnv = (key: string) => {
        if (typeof window !== 'undefined' && (window as any).env && (window as any).env[key]) {
            return (window as any).env[key];
        }
        return (import.meta as any).env?.[key];
    };

    const authEnabled = getEnv('VITE_HTTP_AUTH_ENABLED') === 'true';
    const validUser = getEnv('VITE_HTTP_AUTH_USER') || 'admin';
    const validPass = getEnv('VITE_HTTP_AUTH_PASS') || 'trading2024';

    useEffect(() => {
        // If auth is disabled, auto-authenticate
        if (!authEnabled) {
            setIsAuthenticated(true);
            return;
        }

        // Check if already authenticated (persists across browser restarts)
        const authToken = localStorage.getItem('http_auth_token');
        if (authToken === btoa(`${validUser}:${validPass}`)) {
            setIsAuthenticated(true);
        }
    }, [authEnabled, validUser, validPass]);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();

        if (username === validUser && password === validPass) {
            const authToken = btoa(`${username}:${password}`);
            localStorage.setItem('http_auth_token', authToken);
            setIsAuthenticated(true);
            setError('');
        } else {
            setError('Invalid credentials');
            setPassword('');
        }
    };

    if (!authEnabled || isAuthenticated) {
        return <>{children}</>;
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-xl shadow-2xl p-8 w-full max-w-md border border-slate-700">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">🔒 Secure Access</h1>
                    <p className="text-gray-400">AI Trading Dashboard</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Username
                        </label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                            placeholder="Enter username"
                            autoComplete="username"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                            placeholder="Enter password"
                            autoComplete="current-password"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl"
                    >
                        Sign In
                    </button>
                </form>

                <div className="mt-6 text-center text-xs text-gray-500">
                    Protected by HTTP Basic Authentication
                </div>
            </div>
        </div>
    );
};

export default HttpAuth;
