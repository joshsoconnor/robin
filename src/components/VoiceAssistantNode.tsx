import React, { useState, useEffect } from 'react';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Geolocation } from '@capacitor/geolocation';
import { Mic, Loader, MicOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Capacitor, registerPlugin } from '@capacitor/core';
import './VoiceAssistantNode.css';

const NavigationSDK = registerPlugin<any>('NavigationSDK');

interface VoiceAssistantProps {
    routeStops: any[];
    isStatic?: boolean;
}

export const VoiceAssistantNode: React.FC<VoiceAssistantProps> = ({ routeStops, isStatic }) => {
    const [isListening, setIsListening] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [supported, setSupported] = useState(false);

    useEffect(() => {
        const initSpeech = async () => {
            if (!Capacitor.isNativePlatform()) return;
            try {
                const available = await SpeechRecognition.available();
                if (available.available) {
                    const permission = await SpeechRecognition.checkPermissions();
                    if (permission.speechRecognition !== 'granted') {
                        await SpeechRecognition.requestPermissions();
                    }
                    setSupported(true);
                }
            } catch (err) {
                console.error('Speech recognition not supported/failed init:', err);
            }
        };
        initSpeech();
    }, []);

    const startListening = async () => {
        if (!supported) return;
        setIsListening(true);
        try {
            await SpeechRecognition.removeAllListeners();

            SpeechRecognition.addListener('partialResults', (data: any) => {
                if (data.matches && data.matches.length > 0) {
                    console.log('Voice captured (partial):', data.matches[0]);
                    processTranscript(data.matches[0]);
                }
            });

            await SpeechRecognition.start({
                language: 'en-US',
                maxResults: 1,
                prompt: 'I am listening...',
                partialResults: true,
                popup: false,
            });

            // Automatically stop listening state after a reasonable timeout if no results
            setTimeout(() => {
                setIsListening(false);
                SpeechRecognition.stop().catch(() => { });
            }, 8000);

        } catch (err) {
            console.error('Failed to start listening:', err);
            setIsListening(false);
        }
    };

    const toggleListening = async () => {
        if (isProcessing) return;

        if (isListening) {
            try {
                await SpeechRecognition.stop();
            } catch (err) {
                console.error('Failed to stop listening:', err);
            } finally {
                setIsListening(false);
            }
        } else {
            startListening();
        }
    };

    const processTranscript = async (text: string) => {
        // Prevent duplicate processing
        if (isProcessing) return;
        setIsListening(false);
        setIsProcessing(true);

        try {
            await SpeechRecognition.stop();
        } catch (e) {
            // Ignore stop errors if already stopped
        }
        try {
            let currentLocation = null;
            try {
                const position = await Geolocation.getCurrentPosition();
                currentLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
            } catch (locErr) {
                console.warn('Could not get location for voice context', locErr);
            }

            const { data, error } = await supabase.functions.invoke('robin-chat', {
                body: {
                    query: text,
                    context: {
                        routeStops,
                        currentLocation
                    }
                }
            });

            if (error) throw error;

            if (data && data.response) {
                await NavigationSDK.speakText({ text: data.response });
            } else {
                await NavigationSDK.speakText({ text: 'Sorry, I didnt quite get that.' });
            }
        } catch (err) {
            console.error('LLM Processing Error:', err);
            await NavigationSDK.speakText({ text: 'I am having trouble connecting right now.' });
        } finally {
            setIsProcessing(false);
        }
    };

    // We now always show the icon for UI consistency, but clicking it on web triggers a warning.
    const isNative = Capacitor.isNativePlatform();

    const handleWebClick = () => {
        // Just a simple internal alert for web, as the Toast component is top-level in App.tsx
        alert("Robin Voice Co-Pilot is only available in the native mobile app.");
    };

    return (
        <div className={`voice-assistant-node ${isListening ? 'listening' : ''} ${isProcessing ? 'processing' : ''} ${isStatic ? 'static' : ''}`}>
            <button
                className="mic-btn"
                onClick={isNative ? toggleListening : handleWebClick}
                title={isListening ? "Tap to Stop" : "Tap to Speak"}
            >
                {isProcessing ? <Loader className="spin" size={24} color="white" /> :
                    isListening ? <MicOff size={24} color="white" /> :
                        <Mic size={24} color="white" />}
            </button>
        </div>
    );
};
