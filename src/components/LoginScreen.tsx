import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Navigation, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import './LoginScreen.css';

interface LoginScreenProps {
    onGuestLogin: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onGuestLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');

        if (isSignUp && password !== confirmPassword) {
            setErrorMsg("Passwords do not match");
            return;
        }

        setLoading(true);

        try {
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;
                // Toast a success message or rely on App.tsx to catch auth state
                alert("Check your email for the confirmation link!");
            } else {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
            }
        } catch (error: any) {
            setErrorMsg(error.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-screen">
            <div className="login-header">
                <div className="logo-circle">
                    <Navigation size={40} color="white" fill="white" />
                </div>
                <h2>Robin Run</h2>
                <p>Your Delivery Sidekick</p>
            </div>

            <div className="login-card">
                <h3>{isSignUp ? 'Create Account' : 'Welcome Back'}</h3>

                {errorMsg && <div className="error-banner">{errorMsg}</div>}

                <form onSubmit={handleAuth} className="login-form">
                    <div className="input-group">
                        <Mail size={20} color="#999" />
                        <input
                            type="email"
                            placeholder="Email address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="input-group">
                        <Lock size={20} color="#999" />
                        <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                        <button 
                            type="button" 
                            className="toggle-password" 
                            onClick={() => setShowPassword(!showPassword)}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                            {showPassword ? <EyeOff size={20} color="#999" /> : <Eye size={20} color="#999" />}
                        </button>
                    </div>

                    {isSignUp && (
                        <div className="input-group">
                            <Lock size={20} color="#999" />
                            <input
                                type={showConfirmPassword ? "text" : "password"}
                                placeholder="Confirm Password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                            <button 
                                type="button" 
                                className="toggle-password" 
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                            >
                                {showConfirmPassword ? <EyeOff size={20} color="#999" /> : <Eye size={20} color="#999" />}
                            </button>
                        </div>
                    )}

                    <button type="submit" className="auth-btn" disabled={loading}>
                        {loading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Sign In')}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>
                        {isSignUp ? 'Already have an account?' : "Don't have an account?"}
                        <button className="text-btn" onClick={() => {
                            setIsSignUp(!isSignUp);
                            setErrorMsg('');
                        }}>
                            {isSignUp ? 'Sign In' : 'Sign Up'}
                        </button>
                    </p>
                </div>
            </div>

            <div className="guest-section">
                <div className="divider"><span>OR</span></div>
                <button className="guest-btn" onClick={onGuestLogin}>
                    Continue as Guest
                </button>
            </div>
        </div>
    );
};
