export interface PasswordRuleResult {
  key: string;
  label: string;
  met: boolean;
}

// "Special character" is deliberately any non-alphanumeric character, not a
// fixed allowlist — the ask gave "e.g. !@#$%^&*" as examples, not an
// exhaustive set, so this stays permissive rather than rejecting a
// reasonable character that wasn't in that example list.
export function checkPasswordRules(password: string, confirmPassword: string): PasswordRuleResult[] {
  return [
    { key: "length", label: "At least 12 characters", met: password.length >= 12 },
    { key: "uppercase", label: "One uppercase letter (A-Z)", met: /[A-Z]/.test(password) },
    { key: "number", label: "One number (0-9)", met: /[0-9]/.test(password) },
    {
      key: "special",
      label: "One special character (e.g. !@#$%^&*)",
      met: /[^A-Za-z0-9]/.test(password),
    },
    {
      key: "match",
      label: "Passwords match",
      met: password.length > 0 && password === confirmPassword,
    },
  ];
}

export function allPasswordRulesMet(password: string, confirmPassword: string): boolean {
  return checkPasswordRules(password, confirmPassword).every((rule) => rule.met);
}
