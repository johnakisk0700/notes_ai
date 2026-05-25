import { useState, useEffect } from 'react';

export const useFadeInOut = (value: string, duration: number = 300) => {
    const [opacity, setOpacity] = useState(1);
    const [displayValue, setDisplayValue] = useState(value);

    useEffect(() => {
        if (value !== displayValue) {
            // Fade out
            setOpacity(0);
            
            const timer = setTimeout(() => {
                setDisplayValue(value);
                // Fade in
                setOpacity(1);
            }, duration / 2);
            
            return () => clearTimeout(timer);
        }
    }, [value, displayValue, duration]);

    return {
        displayValue,
        style: {
            opacity,
            transition: `opacity ${duration}ms ease-in-out`,
        }
    };
};