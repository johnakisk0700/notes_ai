const elErrors = {
  error: 'Σφάλμα',
  generic_error: 'Κάτι πήγε στραβά.',
  aborted: 'Το αίτημα ακυρώθηκε.',
  invalid_credentials: 'Μη έγκυρο email ή κωδικός πρόσβασης. Ελέγξτε τα στοιχεία και προσπαθήστε ξανά.',
  password_too_long:
    'Ο κωδικός πρόσβασης πρέπει να έχει τουλάχιστον 8 χαρακτήρες και να περιέχει κεφαλαία, πεζά, αριθμό και ειδικό χαρακτήρα.',
  email_not_confirmed: 'Παρακαλώ επιβεβαιώστε το email σας πριν συνδεθείτε.',
  user_not_found: 'Δεν βρέθηκε χρήστης με αυτά τα στοιχεία.',
  invalid_grant: 'Μη έγκυρα στοιχεία σύνδεσης.',
  something_went_wrong: 'Ωχ! Κάτι πήγε στραβά.',
  failed_deletion: 'Αποτυχία διαγραφής',
  insufficient_permissions: 'Δεν έχετε δικαιώματα πρόσβασης σε αυτή τη σελίδα.',
  failed_to_load_profiles: 'Αποτυχία φόρτωσης προφίλ',
};

const elSuccesses = {
  successful_registration: 'Επιτυχής εγγραφή!',
  chat_tips: 'Ρωτήστε τη Lexi για τις σημειώσεις σας.',
  successful_note_deletion: 'Η σημείωση διαγράφηκε επιτυχώς',
  successful_update: 'Επιτυχής ενημέρωση.',
};

const elMenu = {
  new_note: 'Νέα Σημείωση',
  administration: 'Διαχείριση',
  personal_notes: 'Προσωπικές Σημειώσεις',
  personal_notes_description: 'Η προσωπική και ασφαλής τράπεζα σημειώσεών σας.',
  ai_assistant: 'Βοηθός AI',
  ai_assistant_description: 'Αναλύστε τις σημειώσεις σας με τα πιο ισχυρά μοντέλα LLM.',
  admin_notes: 'Διαχείριση Σημειώσεων',
  admin_notes_description: 'Διαχειριστείτε και ελέγξτε τις σημειώσεις των χρηστών',
  user_management: 'Διαχείριση Χρηστών',
  user_management_description: 'Διαχειριστείτε ρόλους και δικαιώματα χρηστών',
  settings_header: 'Ρυθμίσεις',
};

const elContent = {
  sign_in: 'Είσοδος',
  sign_up: 'Εγγραφή',
  login: 'Σύνδεση',
  password: 'Κωδικός πρόσβασης',
  first_name: 'Όνομα',
  last_name: 'Επώνυμο',
  note: 'Σημείωση',
  name: 'Όνομα',
  tefteri: 'Κατάστιχο',
  actions: 'Ενέργειες',
  change_role: 'Αλλαγή Ρόλου',
  are_you_sure: 'Είστε σίγουροι;',
  account_deletion_warning:
    'Αυτή η ενέργεια δεν μπορεί να αναιρεθεί. Θα διαγράψει οριστικά τον λογαριασμό σας και θα αφαιρέσει τα δεδομένα σας από τους διακομιστές μας.',
  cancel: 'Ακύρωση',
  confirm: 'Επιβεβαίωση',
  change_role_warning: 'Είστε βέβαιοι ότι θέλετε να αλλάξετε τον ρόλο του',
  from: 'από',
  to: 'σε',
  no_users_found: 'Δεν βρέθηκαν χρήστες.',
  all: 'Όλοι',
  users: 'Χρήστες',
  language_select: 'Επιλογή Γλώσσας',
  no_framework_found: 'Δεν βρέθηκε framework.',
  select_language: 'Γλώσσα',
  ask_anything: 'Ρώτα οτιδήποτε...',
  select_lang: 'Επιλογή γλώσσας',
};

export const elTranslation = { ...elErrors, ...elSuccesses, ...elMenu, ...elContent };
