// Shared data and utilities for SCALLCASH demo

// Generate a baseline set of demo expenses. In a real application this would
// come from the database; here we seed a handful of invoices and write
// everything into localStorage so the data is persistent across page loads.

const DemoData = (() => {
  // Helper to parse ISO dates into Date objects
  const parseDate = str => new Date(str);

  // Predefined set of expenses for demonstration purposes. Each object
  // represents a supplier invoice with relevant fields. Amounts are in EUR.
  const seedExpenses = [
    {
      id: 1,
      invoiceDate: '2025-08-03',
      vendor: 'Uber Eats',
      invoiceNumber: 'F10326',
      site: 'Rancy',
      amountHT: 230.63,
      vatRate: 0.10,
      category: 'Repas salariés',
      dueDate: '2025-08-07',
      status: 'À VALIDER',
      paymentMethod: 'Plateforme',
      matchedBank: false,
      notes: '',
      attachments: 1,
    },
    {
      id: 2,
      invoiceDate: '2025-08-01',
      vendor: 'Fournil Pro',
      invoiceNumber: 'F11548',
      site: 'Vitry',
      amountHT: 501.43,
      vatRate: 0.20,
      category: 'Consommables',
      dueDate: '2025-09-02',
      status: 'PAYÉ',
      paymentMethod: 'CB',
      matchedBank: true,
      notes: '',
      attachments: 1,
    },
    {
      id: 3,
      invoiceDate: '2025-07-28',
      vendor: 'Assurisk',
      invoiceNumber: 'P0137',
      site: 'Raincy',
      amountHT: 315.71,
      vatRate: 0.20,
      category: 'Télécom',
      dueDate: '2025-08-15',
      status: 'À VALIDER',
      paymentMethod: 'Prélèvement',
      matchedBank: false,
      notes: 'Abonnement mensuel',
      attachments: 0,
    },
    {
      id: 4,
      invoiceDate: '2025-08-05',
      vendor: 'Electrofood',
      invoiceNumber: 'F11311',
      site: 'Rancy',
      amountHT: 84.17,
      vatRate: 0.10,
      category: 'Energie',
      dueDate: '2025-08-20',
      status: 'PLANIFIÉ',
      paymentMethod: 'Virement',
      matchedBank: false,
      notes: '',
      attachments: 2,
    },
    {
      id: 5,
      invoiceDate: '2025-08-09',
      vendor: 'Maison Martin',
      invoiceNumber: 'F2031',
      site: 'Vitry',
      amountHT: 270.86,
      vatRate: 0.20,
      category: 'Fournitures',
      dueDate: '2025-08-09',
      status: 'À PAYER',
      paymentMethod: 'Espèces',
      matchedBank: false,
      notes: 'Petite caisse',
      attachments: 0,
    },
    {
      id: 6,
      invoiceDate: '2025-08-10',
      vendor: 'NetFood',
      invoiceNumber: 'F10328',
      site: 'Rancy',
      amountHT: 210.87,
      vatRate: 0.05,
      category: 'Assurances',
      dueDate: '2025-09-05',
      status: 'LITIGE',
      paymentMethod: 'Plateforme',
      matchedBank: false,
      notes: 'Incohérence montant',
      attachments: 1,
    },
  ];

  // Compute derived totals for each expense
  function enrichExpense(exp) {
    const ht = Number(exp.amountHT);
    const vat = Number((ht * exp.vatRate).toFixed(2));
    const ttc = Number((ht + vat).toFixed(2));
    return {
      ...exp,
      amountTVA: vat,
      amountTTC: ttc,
    };
  }

  // Load expenses from localStorage or seed with predefined data
  function load() {
    const stored = localStorage.getItem('scallcash_expenses');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return parsed.map(enrichExpense);
      } catch (e) {
        console.warn('Failed to parse stored expenses', e);
      }
    }
    const enriched = seedExpenses.map(enrichExpense);
    save(enriched);
    return enriched;
  }

  // Save the current list of expenses to localStorage
  function save(expenses) {
    localStorage.setItem('scallcash_expenses', JSON.stringify(expenses));
  }

  // Generate a new ID for a newly created expense
  function generateId(expenses) {
    return expenses.reduce((max, e) => Math.max(max, e.id), 0) + 1;
  }

  return {
    load,
    save,
    generateId,
    enrichExpense,
  };
})();

// -----------------------------------------------------------------------------
// IncomesData module
//
// This module manages a set of demo income records (sales encaissements). Each
// income corresponds to a sale or payment received from a client. Fields are
// similar to expenses: date, client, orderNumber, site, amountHT, vatRate,
// channel/method, status, notes and attachments. Statuses include
// 'À ENCAISSER' (awaiting payment), 'ENCAISSÉ' (received), and 'ANNULÉ'.
const IncomesData = (() => {
  const seedIncomes = [
    {
      id: 1,
      date: '2025-08-01',
      client: 'Client A',
      orderNumber: 'C1001',
      site: 'Rancy',
      amountHT: 450.0,
      vatRate: 0.2,
      channel: 'CB',
      expectedDate: '2025-08-05',
      status: 'À ENCAISSER',
      notes: '',
      attachments: 0,
    },
    {
      id: 2,
      date: '2025-07-29',
      client: 'Client B',
      orderNumber: 'C1002',
      site: 'Vitry',
      amountHT: 320.5,
      vatRate: 0.2,
      channel: 'Espèces',
      expectedDate: '2025-07-29',
      status: 'ENCAISSÉ',
      notes: '',
      attachments: 0,
    },
    {
      id: 3,
      date: '2025-08-03',
      client: 'Client C',
      orderNumber: 'C1003',
      site: 'Raincy',
      amountHT: 780.0,
      vatRate: 0.1,
      channel: 'Virement',
      expectedDate: '2025-08-10',
      status: 'À ENCAISSER',
      notes: '',
      attachments: 1,
    },
    {
      id: 4,
      date: '2025-08-05',
      client: 'Client D',
      orderNumber: 'C1004',
      site: 'Rancy',
      amountHT: 150.4,
      vatRate: 0.05,
      channel: 'Plateforme',
      expectedDate: '2025-08-05',
      status: 'ENCAISSÉ',
      notes: 'Acompte',
      attachments: 1,
    },
    {
      id: 5,
      date: '2025-08-09',
      client: 'Client E',
      orderNumber: 'C1005',
      site: 'Vitry',
      amountHT: 95.8,
      vatRate: 0.2,
      channel: 'CB',
      expectedDate: '2025-08-12',
      status: 'ANNULÉ',
      notes: 'Commande annulée',
      attachments: 0,
    },
  ];

  function enrichIncome(inc) {
    const ht = Number(inc.amountHT);
    const vat = Number((ht * inc.vatRate).toFixed(2));
    const ttc = Number((ht + vat).toFixed(2));
    return {
      ...inc,
      amountTVA: vat,
      amountTTC: ttc,
    };
  }

  function load() {
    const stored = localStorage.getItem('scallcash_incomes');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return parsed.map(enrichIncome);
      } catch (e) {
        console.warn('Failed to parse stored incomes', e);
      }
    }
    const enriched = seedIncomes.map(enrichIncome);
    save(enriched);
    return enriched;
  }

  function save(incomes) {
    localStorage.setItem('scallcash_incomes', JSON.stringify(incomes));
  }

  function generateId(incomes) {
    return incomes.reduce((max, c) => Math.max(max, c.id), 0) + 1;
  }

  return {
    load,
    save,
    generateId,
    enrichIncome,
  };
})();

// -----------------------------------------------------------------------------
// InvoicesData module
//
// This module manages demo customer invoices (facturation). It shares similar
// fields with incomes but includes dueDate and invoiceNumber. Statuses can be
// 'BROUILLON', 'ENVOYÉ', 'RELANCÉ', 'PAYÉ', 'EN RETARD', 'ANNULÉ'.
const InvoicesData = (() => {
  const seedInvoices = [
    {
      id: 1,
      date: '2025-07-25',
      customer: 'Client A',
      invoiceNumber: 'FA001',
      site: 'Rancy',
      amountHT: 450.0,
      vatRate: 0.2,
      dueDate: '2025-08-05',
      status: 'ENVOYÉ',
      notes: '',
    },
    {
      id: 2,
      date: '2025-07-28',
      customer: 'Client B',
      invoiceNumber: 'FA002',
      site: 'Vitry',
      amountHT: 320.5,
      vatRate: 0.2,
      dueDate: '2025-08-15',
      status: 'PAYÉ',
      notes: '',
    },
    {
      id: 3,
      date: '2025-08-03',
      customer: 'Client C',
      invoiceNumber: 'FA003',
      site: 'Raincy',
      amountHT: 780.0,
      vatRate: 0.1,
      dueDate: '2025-08-20',
      status: 'RELANCÉ',
      notes: '',
    },
    {
      id: 4,
      date: '2025-08-05',
      customer: 'Client D',
      invoiceNumber: 'FA004',
      site: 'Rancy',
      amountHT: 150.4,
      vatRate: 0.05,
      dueDate: '2025-08-05',
      status: 'PAYÉ',
      notes: 'Acompte',
    },
    {
      id: 5,
      date: '2025-07-30',
      customer: 'Client E',
      invoiceNumber: 'FA005',
      site: 'Vitry',
      amountHT: 95.8,
      vatRate: 0.2,
      dueDate: '2025-08-12',
      status: 'EN RETARD',
      notes: '',
    },
  ];

  function enrichInvoice(inv) {
    const ht = Number(inv.amountHT);
    const vat = Number((ht * inv.vatRate).toFixed(2));
    const ttc = Number((ht + vat).toFixed(2));
    return {
      ...inv,
      amountTVA: vat,
      amountTTC: ttc,
    };
  }

  function load() {
    const stored = localStorage.getItem('scallcash_invoices');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return parsed.map(enrichInvoice);
      } catch (e) {
        console.warn('Failed to parse stored invoices', e);
      }
    }
    const enriched = seedInvoices.map(enrichInvoice);
    save(enriched);
    return enriched;
  }

  function save(invoices) {
    localStorage.setItem('scallcash_invoices', JSON.stringify(invoices));
  }

  function generateId(invoices) {
    return invoices.reduce((max, c) => Math.max(max, c.id), 0) + 1;
  }

  return {
    load,
    save,
    generateId,
    enrichInvoice,
  };
})();

// -----------------------------------------------------------------------------
// TransactionsData module
//
// Demo bank transactions for rapprochement. Each transaction includes a
// date, label, amount (positive for incoming, negative for outgoing), site,
// status ('À CATÉGORISER', 'À VALIDER', 'RAPPROCHÉ') and matchCount to store
// number of linked pieces. For simplicity we omit detailed linking.
const TransactionsData = (() => {
  const seedTransactions = [
    {
      id: 1,
      date: '2025-08-02',
      label: 'Virement Client A',
      amount: 540.0,
      site: 'Rancy',
      status: 'À CATÉGORISER',
      matchCount: 0,
    },
    {
      id: 2,
      date: '2025-08-03',
      label: 'Paiement CB Uber Eats',
      amount: -253.69,
      site: 'Rancy',
      status: 'RAPPROCHÉ',
      matchCount: 1,
    },
    {
      id: 3,
      date: '2025-08-04',
      label: 'Virement Fournisseur Pro',
      amount: -601.72,
      site: 'Vitry',
      status: 'À VALIDER',
      matchCount: 1,
    },
    {
      id: 4,
      date: '2025-08-06',
      label: 'Virement Client C',
      amount: 858.0,
      site: 'Raincy',
      status: 'À CATÉGORISER',
      matchCount: 0,
    },
    {
      id: 5,
      date: '2025-08-07',
      label: 'Prélèvement Assurisk',
      amount: -378.85,
      site: 'Rancy',
      status: 'À VALIDER',
      matchCount: 0,
    },
  ];

  function load() {
    const stored = localStorage.getItem('scallcash_transactions');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.warn('Failed to parse stored transactions', e);
      }
    }
    save(seedTransactions);
    return seedTransactions;
  }

  function save(transactions) {
    localStorage.setItem('scallcash_transactions', JSON.stringify(transactions));
  }

  function generateId(transactions) {
    return transactions.reduce((max, c) => Math.max(max, c.id), 0) + 1;
  }

  return {
    load,
    save,
    generateId,
  };
})();