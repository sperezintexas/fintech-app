import type { Account } from "@/types/portfolio";

// In-memory store for development when MongoDB is not available
const accounts: Map<string, Account> = new Map();

// Initialize with sample data
const sampleAccounts: Account[] = [
  {
    _id: "acc-1",
    name: "Growth Portfolio",
    balance: 125000,
    riskLevel: "high",
    strategy: "growth",
    positions: [],
    recommendations: [],
  },
  {
    _id: "acc-2",
    name: "Income Account",
    balance: 75000,
    riskLevel: "low",
    strategy: "income",
    positions: [],
    recommendations: [],
  },
];

// Populate initial data
sampleAccounts.forEach((acc) => accounts.set(acc._id, acc));

export const accountsStore = {
  getAll: (): Account[] => Array.from(accounts.values()),

  getById: (id: string): Account | undefined => accounts.get(id),

  create: (data: Omit<Account, "_id">): Account => {
    const id = `acc-${Date.now()}`;
    const account: Account = { _id: id, ...data };
    accounts.set(id, account);
    return account;
  },

  update: (id: string, data: Partial<Account>): Account | null => {
    const existing = accounts.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data };
    accounts.set(id, updated);
    return updated;
  },

  delete: (id: string): boolean => accounts.delete(id),
};
