import { supabase } from '../supabase/client';

export async function fetchAllWines() {
    const pageSize = 1000;
    let allNames: string[] = [];
    let currentPage = 0;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('wines')
            .select('name')
            .not('name', 'is', null)
            .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

        if (error) {
            console.error('Error fetching wines:', error);
            return [];
        }

        if (!data || data.length === 0) {
            hasMore = false;
        } else {
            const names = data.map((wine) => wine.name || '').filter(Boolean);
            allNames = [...allNames, ...names];
            currentPage++;
        }
    }

    console.log('Retrieved wine list from DB:', allNames);
    localStorage.setItem('wine_db', JSON.stringify(allNames));

    return allNames;
}

export async function fetchAllCustomers() {
    const pageSize = 1000;
    let allNames: string[] = [];
    let currentPage = 0;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('customers')
            .select('name')
            .not('name', 'is', null)
            .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

        if (error) {
            console.error('Error customers wines:', error);
            return [];
        }

        if (!data || data.length === 0) {
            hasMore = false;
        } else {
            const names = data.map((customer) => customer.name || '').filter(Boolean);
            allNames = [...allNames, ...names];
            currentPage++;
        }
    }

    console.log('Retrieved customers list from DB:', allNames);
    localStorage.setItem('customers_db', JSON.stringify(allNames));

    return allNames;
}
