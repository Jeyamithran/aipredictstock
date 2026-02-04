
import { getPolygonApiKey } from './polygonService';

// Types from Polygon Docs
export interface PolygonEvent {
    ev: string;
    [key: string]: any;
}

export type PolygonConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'authenticated' | 'error';

type Listener = (data: PolygonEvent[]) => void;
type StatusListener = (status: PolygonConnectionStatus) => void;

class PolygonWebSocket {
    private socket: WebSocket | null = null;
    private url = 'wss://socket.polygon.io/options';
    private apiKey: string;
    private listeners: Listener[] = [];
    private statusListeners: StatusListener[] = [];
    private status: PolygonConnectionStatus = 'disconnected';
    private subscriptions: Set<string> = new Set();
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectTimer: any = null;
    private pingInterval: any = null;
    private forceDisconnect = false;

    constructor() {
        this.apiKey = getPolygonApiKey();
    }

    public connect() {
        if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
            return;
        }

        // Reset fatal flag on manual connect attempt
        this.forceDisconnect = false;

        this.apiKey = getPolygonApiKey();
        if (!this.apiKey) {
            console.error("PolygonWebSocket: Missing API Key");
            this.updateStatus('error');
            return;
        }

        this.updateStatus('connecting');

        try {
            this.socket = new WebSocket(this.url);

            this.socket.onopen = () => {
                console.log("PolygonWebSocket: Connected to " + this.url);
                this.updateStatus('connected');
                // Don't reset attempts yet, wait for auth? 
                // Using standard logic for now, but max_connections usually comes fast.
                this.reconnectAttempts = 0;
                this.authenticate();
                this.startPing();
            };

            this.socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (e) {
                    console.error("PolygonWebSocket: Parse error", e);
                }
            };

            this.socket.onclose = () => {
                console.warn("PolygonWebSocket: Closed");
                this.cleanup();
                this.updateStatus('disconnected');

                if (!this.forceDisconnect) {
                    this.attemptReconnect();
                } else {
                    console.warn("PolygonWebSocket: Reconnect suppressed due to fatal error (Max Connections).");
                }
            };

            this.socket.onerror = (error) => {
                console.error("PolygonWebSocket: Error", error);
            };

        } catch (e) {
            console.error("PolygonWebSocket: Init error", e);
            this.updateStatus('error');
            this.attemptReconnect();
        }
    }

    public disconnect() {
        this.forceDisconnect = true; // Manual disconnect implies no reconnect
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.subscriptions.clear();
        this.cleanup();
        this.updateStatus('disconnected');
    }

    private cleanup() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        if (this.pingInterval) clearInterval(this.pingInterval);
    }

    private authenticate() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

        const authMsg = {
            action: "auth",
            params: this.apiKey
        };
        this.socket.send(JSON.stringify(authMsg));
    }

    private startPing() {
        // Typically WebSockets handle their own keepalives, but if needed we can send pings.
        // Polygon typically sends heatbeats, so we might just listen. 
        // We'll leave this empty for now unless we see timeouts.
    }

    private handleMessage(data: PolygonEvent[]) {
        if (!Array.isArray(data)) return;

        data.forEach(msg => {
            if (msg.ev === 'status') {
                console.log("PolygonWebSocket Status:", msg);
                if (msg.status === 'auth_success') {
                    this.updateStatus('authenticated');
                    this.resubscribe();
                } else if (msg.status === 'max_connections') {
                    console.error("PolygonWebSocket: Max Connections Exceeded");
                    this.forceDisconnect = true;
                    this.updateStatus('error');
                    // Notification to user could be handled by status listener
                    // triggering a toast or similar.
                    // We close socket to prevent further issues, though server closes it too.
                    this.socket?.close();
                }
            }
        });

        // Broadcast to listeners
        this.listeners.forEach(l => l(data));
    }

    public subscribe(channels: string[]) {
        channels.forEach(c => this.subscriptions.add(c));

        if (this.status === 'authenticated') {
            this.sendSubscribe(channels);
        }
    }

    public unsubscribe(channels: string[]) {
        channels.forEach(c => this.subscriptions.delete(c));

        if (this.status === 'authenticated') {
            this.socket?.send(JSON.stringify({
                action: "unsubscribe",
                params: channels.join(',')
            }));
        }
    }

    private resubscribe() {
        if (this.subscriptions.size > 0) {
            this.sendSubscribe(Array.from(this.subscriptions));
        }
    }

    private sendSubscribe(channels: string[]) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        console.log("PolygonWebSocket: Subscribing to", channels.join(','));
        this.socket.send(JSON.stringify({
            action: "subscribe",
            params: channels.join(',')
        }));
    }

    private attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error("PolygonWebSocket: Max reconnect attempts reached");
            this.updateStatus('error');
            return;
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        console.log(`PolygonWebSocket: Reconnecting in ${delay}ms...`);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
        }, delay);
    }

    private updateStatus(s: PolygonConnectionStatus) {
        this.status = s;
        this.statusListeners.forEach(l => l(s));
    }

    // LISTENER MANAGEMENT

    public addMessageListener(l: Listener) {
        this.listeners.push(l);
        return () => {
            this.listeners = this.listeners.filter(x => x !== l);
        };
    }

    public addStatusListener(l: StatusListener) {
        this.statusListeners.push(l);
        // Immediate callback with current status
        l(this.status);
        return () => {
            this.statusListeners = this.statusListeners.filter(x => x !== l);
        };
    }

    public getStatus() {
        return this.status;
    }
}

// Singleton Instance
export const polygonStream = new PolygonWebSocket();
