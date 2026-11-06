
const initialMyThingsData = {
  metadata: {
    appName: "myThings",
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastBackupAt: null
  },

  profile: {
    id: crypto.randomUUID(),
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    currency: "UGX",
    profileImage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  accounts: [],
  transactions: [],
  categories: [],

  budgets: [],
  budgetTemplates: [],
  transactionAllocations: [],
  loans: [],
  calendarEvents: [],
  notes: [],
  lists: [],
  dailyExpenseGroups: [],
  attachments: [],

  settings: {
    appearance: {
      theme: "system",
      accentColor: "#000000"
    },

    regional: {
      currency: "UGX",
      country: "Uganda",
      dateFormat: "DD/MM/YYYY",
      language: "en"
    },

    notifications: {
      enabled: true,
      budgetReminders: true,
      eventReminders: true,
      loanReminders: true
    },

    finance: {
      defaultAccountId: null,
      confirmBeforeDeleting: true
    },

    privacy: {
      appLockEnabled: false
    }
  }
};
