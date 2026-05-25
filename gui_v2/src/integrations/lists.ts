import { api } from './api';

// Editor "@mention" autocomplete sources. Backed by our Postgres `wines` /
// `customers` tables (previously direct Supabase queries). Results are cached
// in localStorage by the WineProvider / CustomerProvider.
export async function fetchAllWines(): Promise<string[]> {
  const {
    data: { names },
  } = await api.get<{ names: string[] }>('get-wines');

  const list = names || [];
  localStorage.setItem('wine_db', JSON.stringify(list));
  return list;
}

export async function fetchAllCustomers(): Promise<string[]> {
  const {
    data: { names },
  } = await api.get<{ names: string[] }>('get-customers');

  const list = names || [];
  localStorage.setItem('customers_db', JSON.stringify(list));
  return list;
}
