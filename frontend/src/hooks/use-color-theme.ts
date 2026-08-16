import { useEffect, useState } from 'react';

export type ColorTheme = 'light' | 'dark';

function getInitialTheme(): ColorTheme {
    if (typeof window === 'undefined') {
        return 'light';
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
}

export function useColorTheme(): ColorTheme {
    const [theme, setTheme] = useState<ColorTheme>(getInitialTheme);

    useEffect(() => {
        const mediaQuery = window.matchMedia(
            '(prefers-color-scheme: dark)',
        );

        const updateTheme = (event: MediaQueryListEvent) => {
            setTheme(event.matches ? 'dark' : 'light');
        };

        setTheme(mediaQuery.matches ? 'dark' : 'light');
        mediaQuery.addEventListener('change', updateTheme);

        return () => {
            mediaQuery.removeEventListener('change', updateTheme);
        };
    }, []);

    return theme;
}