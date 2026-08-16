import {
    useEffect,
    useState
} from 'react';

const mobileMediaQuery =
    '(max-width: 720px), (pointer: coarse)';

function getMobileLayout(): boolean {
    return window
        .matchMedia(mobileMediaQuery)
        .matches;
}

export function useMobileLayout(): boolean {
    const [
        isMobileLayout,
        setIsMobileLayout
    ] = useState(getMobileLayout);

    useEffect(() => {
        const mediaQuery = window.matchMedia(
            mobileMediaQuery
        );

        const handleChange = () => {
            setIsMobileLayout(
                mediaQuery.matches
            );
        };

        mediaQuery.addEventListener(
            'change',
            handleChange
        );

        return () => {
            mediaQuery.removeEventListener(
                'change',
                handleChange
            );
        };
    }, []);

    return isMobileLayout;
}