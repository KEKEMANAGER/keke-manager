/** Central Supabase / network error messages (Georgian). */
export function getSupabaseErrorMessage(error: unknown): string {
  if (!error) return '';

  const msg =
    (typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      String((error as { message?: string }).message)) ||
    (typeof error === 'object' &&
      error !== null &&
      'error_description' in error &&
      String((error as { error_description?: string }).error_description)) ||
    (error instanceof Error ? error.message : String(error));

  const lower = msg.toLowerCase();

  if (
    lower.includes('network') ||
    lower.includes('fetch failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('network request failed')
  ) {
    return 'ინტერნეტთან კავშირი ვერ მოხერხდა';
  }
  if (lower.includes('jwt expired') || lower.includes('token') || lower.includes('not authenticated')) {
    return 'სესია ამოიწურა, გთხოვთ შეხვიდეთ თავიდან';
  }
  if (lower.includes('violates row-level') || lower.includes('permission denied') || lower.includes('42501')) {
    return 'წვდომა შეზღუდულია';
  }
  if (lower.includes('duplicate key')) {
    if (
      lower.includes('ratings_company_booking_unique') ||
      (lower.includes('booking_id') && lower.includes('ratings'))
    ) {
      return 'ამ ჯავშანზე უკვე გაგზავნეთ შეფასება';
    }
    if (
      lower.includes('driver_clerk_id') ||
      lower.includes('vehicles_driver_clerk_id')
    ) {
      return 'მეორე მანქანის დამატება ბაზაში არ არის ჩართული. გაუშვით migration: 20260518140000_vehicles_drop_driver_unique.sql';
    }
    return 'ეს ჩანაწერი უკვე არსებობს';
  }
  if (lower.includes('not found') || lower.includes('no rows')) {
    return 'მონაცემი ვერ მოიძებნა';
  }
  if (lower.includes('invalid login credentials')) {
    return 'ელფოსტა ან პაროლი არასწორია.';
  }
  if (lower.includes('account_blocked')) {
    return 'ანგარიში დაბლოკილია. დაუკავშირდით მხარდაჭერას: akachibaia1410@gmail.com';
  }
  if (lower.includes('email not confirmed')) {
    return 'ელფოსტა არ არის დადასტურებული.';
  }

  return msg.trim() || 'შეცდომა მოხდა';
}
