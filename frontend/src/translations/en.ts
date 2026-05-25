const enErrors = {
  error: 'Error',
  generic_error: 'Something went wrong.',
  aborted: 'Request was aborted.',
  invalid_credentials: 'Invalid email or password. Please check your credentials and try again.',
  password_too_long:
    'Password must be at least 8 characters long and include uppercase, lowercase, number, and special character.',
  email_not_confirmed: 'Please verify your email address before signing in.',
  user_not_found: 'No user found with these credentials.',
  invalid_grant: 'Invalid login credentials.',
  something_went_wrong: 'Oops! Something went wrong.',
  failed_deletion: 'Failed to delete',
  insufficient_permissions: "You don't have permissions to view this page.",
  failed_to_load_profiles: 'Failed to load profiles',
};

const enSuccesses = {
  successful_registration: 'Registration successful!',
  chat_tips: 'Ask Lexi about your notes.',
  successful_note_deletion: 'Note deleted successfully',
  successful_update: 'Updated successfully.',
};

const enMenu = {
  new_note: 'New Note',
  administration: 'Administration',
  personal_notes: 'Personal Notes',
  personal_notes_description: 'Your personal and secure note bank.',
  ai_assistant: 'AI Assistant',
  ai_assistant_description: 'Analyze your notes with the help of the strongest LLM models.',
  admin_notes: 'Admin Notes',
  admin_notes_description: "Manage and review user's notes",
  user_management: 'User Management',
  user_management_description: 'Manage user roles and permissions',
  settings_header: 'Settings',
  new_chat: 'New Chat',
  recent_chats: 'Recent Chats',
  untitled_thread: 'Untitled',
  delete_thread: 'Delete chat',
};

const enContent = {
  sign_in: 'Sign In',
  sign_up: 'Sign Up',
  login: 'Log in',
  password: 'Password',
  first_name: 'First Name',
  last_name: 'Last Name',
  note: 'Note',
  name: 'Name',
  tefteri: 'Ledger',
  actions: 'Actions',
  change_role: 'Change Role',
  are_you_sure: 'Are you sure?',
  account_deletion_warning:
    'This action cannot be undone. This will permanently delete your account and remove your data from our servers.',
  cancel: 'Cancel',
  confirm: 'Confirm',
  change_role_warning: 'Are you sure you want to change the role of',
  from: 'from',
  to: 'to',
  no_users_found: 'No users found.',
  all: 'All',
  users: 'Users',
  language_select: 'Language Select',
  no_framework_found: 'No framework found.',
  select_language: 'Language',
  ask_anything: 'Ask anything...',
  select_lang: 'Select Language',
};

export const enTranslation = { ...enErrors, ...enSuccesses, ...enMenu, ...enContent };
