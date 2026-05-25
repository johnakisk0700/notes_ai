export interface UserSettings {
  theme: "light" | "dark" | "system";
  notifications: {
    desktop: boolean;
    email: boolean;
  };
  language: string;
  // Add other settings properties here
}

// Default settings
export const defaultUserSettings: UserSettings = {
  theme: "system",
  notifications: {
    desktop: true,
    email: false,
  },
  language: "en",
};
