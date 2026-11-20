// Where "Report a problem" emails go. This file holds no address: the address
// is typed into Settings (kept in this browser) or arrives inside the owners'
// encrypted seed as `Project.reportTo`. It must never be written into the code.

/** A plain address (name, an at sign, a domain with a dot), with nothing that would break a mailto link. */
const EMAIL = /^[^\s@,;:?&<>"'()[\]\\]+@[^\s@,;:?&<>"'()[\]\\]+\.[^\s@,;:?&<>"'()[\]\\]+$/;

export function isValidEmail(x: unknown): x is string {
  return typeof x === 'string' && x.length <= 254 && EMAIL.test(x.trim());
}

/**
 * The address to use: the one typed into Settings on this device wins, otherwise the one that came
 * with the plan, otherwise none (then "Copy everything" is the main action).
 */
export function resolveReportAddress(stored: string | null | undefined, projectReportTo: string | null | undefined): string | null {
  if (isValidEmail(stored)) return stored.trim();
  if (isValidEmail(projectReportTo)) return projectReportTo.trim();
  return null;
}
