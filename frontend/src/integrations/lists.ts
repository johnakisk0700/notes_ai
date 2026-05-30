import { api } from './api';

// Editor "@mention" autocomplete sources. Backed by our Postgres `wines` /
// `customers` tables. Results are cached in localStorage by the
// WineProvider / CustomerProvider and merged into the editor's "@" menu.
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
