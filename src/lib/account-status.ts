type AccountStatusInput = {
  bannedAt: Date | null;
  timeoutUntil: Date | null;
};

export function isAccountBanned(user: AccountStatusInput): boolean {
  return Boolean(user.bannedAt);
}

export function isAccountTimedOut(user: AccountStatusInput, now: Date = new Date()): boolean {
  if (!user.timeoutUntil) {
    return false;
  }
  return user.timeoutUntil.getTime() > now.getTime();
}

export function isAccountBlocked(user: AccountStatusInput, now: Date = new Date()): boolean {
  return isAccountBanned(user) || isAccountTimedOut(user, now);
}

export function accountBlockedMessage(user: AccountStatusInput, now: Date = new Date()): string | null {
  if (isAccountBanned(user)) {
    return "Account is banned.";
  }
  if (isAccountTimedOut(user, now)) {
    return `Account is timed out until ${user.timeoutUntil?.toISOString()}.`;
  }
  return null;
}
