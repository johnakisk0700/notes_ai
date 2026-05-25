import { createContext, useState, useContext, useEffect } from 'react';
import { fetchAllWines } from '../../integrations/lists';

const WineContext = createContext<string[]>([]);

export function WineProvider({ children }) {
    const [wineNames, setWineNames] = useState<string[]>([]);

    useEffect(() => {
        const localWineNames = localStorage.getItem('wine_db');
        if (localWineNames) {
            console.log('Retrieved wine list from localStorage');
            setWineNames(JSON.parse(localWineNames));
        } else {
            (async () => {
                const names = await fetchAllWines();
                setWineNames(names);
                localStorage.setItem('wine_db', JSON.stringify(names));
            })();
        }
    }, []);

    return <WineContext.Provider value={wineNames}>{children}</WineContext.Provider>;
}

export function useWineContext() {
    return useContext(WineContext);
}
