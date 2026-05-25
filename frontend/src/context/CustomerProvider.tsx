import { createContext, useState, useContext, useEffect } from 'react';
import { fetchAllCustomers } from '../integrations/lists';

const CustomerContext = createContext<string[]>([]);

export function CustomerProvider({ children }) {
  const [customerNames, setCustomer] = useState<string[]>([]);

  useEffect(() => {
    const localCustomerNames = localStorage.getItem('customers_db');
    if (localCustomerNames) {
      console.log('Retrieved customers list from localStorage');
      setCustomer(JSON.parse(localCustomerNames));
    } else {
      (async () => {
        const customerNames = await fetchAllCustomers();
        setCustomer(customerNames);
      })();
    }
  }, []);

  return <CustomerContext.Provider value={customerNames}>{children}</CustomerContext.Provider>;
}

export function useCustomerContext() {
  return useContext(CustomerContext);
}
