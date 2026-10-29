const AUTH_KEY = "htc-auth";

export function isLoggedIn(): boolean {
  return window.localStorage.getItem(AUTH_KEY) === "1";
}

export function setLoggedIn(): void {
  window.localStorage.setItem(AUTH_KEY, "1");
}
