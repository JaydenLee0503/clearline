const KEY = 'resiliencehub_account';

export function getStoredAccount() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveAccount(account) {
  localStorage.setItem(KEY, JSON.stringify(account));
}

export function clearAccount() {
  localStorage.removeItem(KEY);
}
