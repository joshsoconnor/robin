import React, { useState, useEffect } from 'react';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Geolocation } from '@capacitor/geolocation';
import { Mic, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Capacitor, registerPlugin } from '@capacitor/core';
import './VoiceAssistantNode.css';

const NavigationSDK = registerPlugin<any>('NavigationSDK');

interface VoiceAssistantProps {
    routeStops: any[];
    isStatic?: boolean;
    onAction?: (action: any) => void;
}

export const VoiceAssistantNode: React.FC<VoiceAssistantProps> = ({ routeStops, isStatic, onAction }) => {
    const [isListening, setIsListening] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [supported, setSupported] = useState(false);

    useEffect(() => {
        const initSpeech = async () => {
            if (!Capacitor.isNativePlatform()) return;
            try {
                // Setup Navigation Listeners
                const speakEndListener = await (NavigationSDK as any).addListener('speakEnd', (data: any) => {
                    console.log('VoiceAssistant: Robin finished speaking', data);
                    // Check if the response we just gave invited a question
                    if (window.localStorage.getItem('robin_expect_response') === 'true') {
                        window.localStorage.removeItem('robin_expect_response');
                        startListening();
                    }
                });

                const available = await SpeechRecognition.available();
                if (available.available) {
                    const permission = await SpeechRecognition.checkPermissions();
                    if (permission.speechRecognition !== 'granted') {
                        await SpeechRecognition.requestPermissions();
                    }
                    setSupported(true);
                }

                return () => {
                    speakEndListener.remove();
                };
            } catch (err) {
                console.error('Speech recognition not supported/failed init:', err);
            }
        };
        const cleanup = initSpeech();
        return () => {
            if (cleanup && typeof (cleanup as any).then === 'function') {
                (cleanup as any).then((cb: any) => cb && cb());
            }
        };
    }, []);

    const startListening = async () => {
        if (!supported) return;
        setIsListening(true);
        try {
            await SpeechRecognition.removeAllListeners();

            SpeechRecognition.addListener('partialResults', (data: any) => {
                if (data.matches && data.matches.length > 0) {
                    console.log('Voice captured (partial):', data.matches[0]);
                }
            });

            (SpeechRecognition as any).addListener('results', (data: any) => {
                if (data.matches && data.matches.length > 0) {
                    console.log('Voice captured (final):', data.matches[0]);
                    processTranscript(data.matches[0]);
                } else {
                    // Sometimes the transcript is empty
                    setIsListening(false);
                }
            });

            await SpeechRecognition.start({
                language: 'en-US',
                maxResults: 1,
                prompt: 'Robin is listening...',
                partialResults: true,
                popup: false, // DO NOT use native popup. It steals focus and can break the Capacitor view layer on some Android variants
            });

            const timeoutId = setTimeout(() => {
                if (isListening) {
                    setIsListening(false);
                    SpeechRecognition.stop().catch(() => { });
                    console.log('VoiceAssistant: Listening timed out.');
                }
            }, 8000);

            (window as any)._voiceTimeoutId = timeoutId;

        } catch (err) {
            console.error('Failed to start listening:', err);
            setIsListening(false);
        }
    };

    const toggleListening = async () => {
        if (isProcessing) return;

        if (isListening) {
            try {
                if ((window as any)._voiceTimeoutId) {
                    clearTimeout((window as any)._voiceTimeoutId);
                }
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
        if (isProcessing) return;
        setIsListening(false);
        setIsProcessing(true);

        if ((window as any)._voiceTimeoutId) {
            clearTimeout((window as any)._voiceTimeoutId);
        }

        try {
            await SpeechRecognition.stop();
        } catch (e) { }

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
                if (data.response.includes('?') || data.expectResponse) {
                    window.localStorage.setItem('robin_expect_response', 'true');
                }

                await NavigationSDK.speakText({ text: data.response });

                if (data.action && onAction) {
                    onAction(data.action);
                }
            } else {
                await NavigationSDK.speakText({ text: "Sorry, I didn't quite get that." });
            }
        } catch (err) {
            console.error('LLM Processing Error:', err);
            await NavigationSDK.speakText({ text: 'I am having trouble connecting right now.' });
        } finally {
            setIsProcessing(false);
        }
    };

    const isNative = Capacitor.isNativePlatform();

    const handleWebClick = () => {
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
                    <Mic size={24} color="white" />}
            </button>
        </div>
    );
};
