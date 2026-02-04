
import { useEffect, useState } from 'react';
import { polygonStream, PolygonEvent, PolygonConnectionStatus } from '../services/polygonWebSocket';

export function useOptionsStream(channels: string[]) {
    const [messages, setMessages] = useState<PolygonEvent[]>([]);
    const [status, setStatus] = useState<PolygonConnectionStatus>(polygonStream.getStatus());

    useEffect(() => {
        // 1. Connect if not already (Service handles idempotency)
        // Only connect if we actually have channels or explicitly want to
        if (channels.length > 0) {
            polygonStream.connect();
        }

        // 2. Subscribe to channels
        if (channels.length > 0) {
            polygonStream.subscribe(channels);
        }

        // 3. Status Listener
        const removeStatusListener = polygonStream.addStatusListener((s) => {
            setStatus(s);
        });

        // 4. Message Listener
        const removeMsgListener = polygonStream.addMessageListener((batch) => {
            // Filter only messages relevant to our channels?
            // Actually, for now, we just pass everything and let the UI filter or 
            // the filtered logic could happen here. But subscription ensures we mostly get what we want.
            // We'll assume the component filters if it needs specific symbols, 
            // but usually we subscribe specifically so we want everything.
            setMessages(prev => [...batch, ...prev].slice(0, 100)); // Keep last 100
        });

        // Cleanup
        return () => {
            if (channels.length > 0) {
                polygonStream.unsubscribe(channels);
            }
            removeStatusListener();
            removeMsgListener();
        };
    }, [channels.join(',')]); // Re-run if channels change

    return { status, messages, isConnected: status === 'authenticated' };
}
