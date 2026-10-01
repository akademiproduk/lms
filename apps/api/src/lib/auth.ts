export type Role = "member" | "lecturer" | "admin";

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validatePassword(value: string): { valid: boolean; message?: string } {
  if (value.length < 10) return { valid: false, message: "Password must be at least 10 characters." };
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value)) {
    return { valid: false, message: "Password needs uppercase, lowercase, and a number." };
  }
  return { valid: true };
}

export function calculateProgress(completedLessons: number, totalLessons: number): number {
  if (totalLessons <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((completedLessons / totalLessons) * 100)));
}

export function isSafeExternalVideoUrl(value: string | null | undefined): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function canManageContent(role: Role): boolean {
  return role === "lecturer" || role === "admin";
}
