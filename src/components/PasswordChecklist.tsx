import type { PasswordRuleResult } from "@/lib/passwordRules";

// Same blue-for-met / gray-for-not-yet treatment as TaxHoldingBadge (D62,
// D78) — deliberately not green/red, which DESIGN.md reserves for P&L only.
const MET_CLASS = "text-blue-600 dark:text-blue-400";
const UNMET_CLASS = "text-gray-400 dark:text-gray-500";

function CheckIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 10.5l3.5 3.5L16 6" />
    </svg>
  );
}

function DotIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className}>
      <circle cx="10" cy="10" r="3" fill="currentColor" />
    </svg>
  );
}

interface Props {
  rules: PasswordRuleResult[];
}

// Shared between /signup and /reset-password — same rules
// (src/lib/passwordRules.ts), same live checkmark/dot presentation.
export function PasswordChecklist({ rules }: Props) {
  return (
    <ul className="space-y-1 pt-1">
      {rules.map((rule) => (
        <li
          key={rule.key}
          className={`flex items-center gap-1.5 text-xs ${rule.met ? MET_CLASS : UNMET_CLASS}`}
        >
          {rule.met ? (
            <CheckIcon className="h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <DotIcon className="h-3.5 w-3.5 flex-shrink-0" />
          )}
          {rule.label}
        </li>
      ))}
    </ul>
  );
}
