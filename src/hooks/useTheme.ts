/**
 * useTheme Hook
 * 
 * Manages theme state with localStorage persistence.
 * Defaults to light mode, syncs with document class.
 */

import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

export function useTheme() {
    const [theme, setTheme] = useState<Theme>(() => {
        // Check localStorage on initial load
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
            return stored === 'dark' ? 'dark' : 'light';
        }
        return 'light';
    });

    // Apply theme to document
    useEffect(() => {
        const root = document.documentElement;

        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }

        // Persist to localStorage
        localStorage.setItem(STORAGE_KEY, theme);
    }, [theme]);

    const toggleTheme = useCallback(() => {
        setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
    }, []);

    return { theme, toggleTheme };
}
