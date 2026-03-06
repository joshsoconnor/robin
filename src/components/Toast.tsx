import React, { useEffect } from 'react';
import './Toast.css';

interface ToastProps {
    headline: string;
    subtext?: string;
    duration?: number;
    onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ headline, subtext, duration = 4000, onClose }) => {

    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, onClose]);

    return (
        <div className="custom-toast-container">
            <div className="custom-toast">
                <div className="toast-content">
                    <h4>{headline}</h4>
                    {subtext && <p>{subtext}</p>}
                </div>
                <button className="toast-close" onClick={onClose}>&times;</button>
            </div>
        </div>
    );
};
