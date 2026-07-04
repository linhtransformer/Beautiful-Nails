// Shared booking rules for Beautiful Nails.
// Used by book-appointment (website) and vapi-tools (phone agent) so both
// entrances enforce exactly the same policy.

export const LEAD_TIME_MIN = 150;        // minimum notice for new bookings (2.5 hours)
export const MAX_CONCURRENT = 3;         // chairs: max overlapping appointments at any minute
export const BUFFER_MIN = 0;             // extra minutes blocked after each appointment
export const MAX_UPCOMING_PER_PHONE = 2; // open future appointments allowed per phone number

// Opening hours per weekday (0 = Sunday)
export const OPENING_HOURS: Record<number, { is_open: boolean; open_time: string; close_time: string }> = {
  0: { is_open: false, open_time: "00:00:00", close_time: "00:00:00" }, // zondag
  1: { is_open: true,  open_time: "11:00:00", close_time: "18:00:00" }, // maandag
  2: { is_open: true,  open_time: "10:00:00", close_time: "18:00:00" }, // dinsdag
  3: { is_open: true,  open_time: "10:00:00", close_time: "18:00:00" }, // woensdag
  4: { is_open: true,  open_time: "10:00:00", close_time: "18:00:00" }, // donderdag
  5: { is_open: true,  open_time: "10:00:00", close_time: "21:00:00" }, // vrijdag
  6: { is_open: true,  open_time: "10:00:00", close_time: "17:00:00" }, // zaterdag
};

export interface BookedInterval {
  start: number; // minute of day
  dur: number;   // minutes
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// Current date/time in Amsterdam as { dateStr: "YYYY-MM-DD", minutes: minute-of-day }
export function amsterdamNow() {
  const formatter = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date())
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: parseInt(parts.hour) * 60 + parseInt(parts.minute),
  };
}

// True when a new appointment [start, start+dur) never pushes the number of
// simultaneous appointments above MAX_CONCURRENT. Existing appointments block
// their full duration plus BUFFER_MIN. Peak overlap inside the new interval
// can only occur at its start or at the start of an existing appointment.
export function slotIsFree(start: number, dur: number, booked: BookedInterval[]): boolean {
  const end = start + dur + BUFFER_MIN;
  const checkPoints = [start, ...booked.map((b) => b.start).filter((s) => s > start && s < end)];
  for (const p of checkPoints) {
    const concurrent = booked.filter((b) => b.start <= p && p < b.start + b.dur + BUFFER_MIN).length;
    if (concurrent >= MAX_CONCURRENT) return false;
  }
  return true;
}

export function normalizePhone(raw: string): string {
  const trimmed = String(raw).trim();
  return trimmed.startsWith("+")
    ? "+" + trimmed.slice(1).replace(/\D/g, "")
    : trimmed.replace(/\D/g, "");
}

export interface BookingCheck {
  ok: boolean;
  code?: string;
  message?: string; // Dutch, safe to show directly to the customer
}

// deno-lint-ignore no-explicit-any
export async function validateBooking(sb: any, params: {
  date: string;        // "YYYY-MM-DD"
  time: string;        // "HH:MM" or "HH:MM:SS"
  duration: number;    // minutes
  phone: string;       // already normalized
}): Promise<BookingCheck> {
  const { date, time, duration, phone } = params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) {
    return { ok: false, code: "invalid_format", message: "Ongeldige datum of tijd." };
  }

  const dayOfWeek = new Date(date + "T12:00:00").getDay();
  const hours = OPENING_HOURS[dayOfWeek];
  if (!hours?.is_open) {
    return { ok: false, code: "closed", message: "De salon is op deze dag gesloten." };
  }

  const start = toMinutes(time);
  if (start < toMinutes(hours.open_time) || start + duration > toMinutes(hours.close_time)) {
    return { ok: false, code: "outside_hours", message: "Deze tijd valt buiten onze openingstijden." };
  }

  const now = amsterdamNow();
  if (date < now.dateStr || (date === now.dateStr && start < now.minutes + LEAD_TIME_MIN)) {
    return {
      ok: false, code: "too_soon",
      message: "Afspraken moeten minimaal 2,5 uur van tevoren geboekt worden. Kies een later tijdstip of bel ons.",
    };
  }

  // Capacity: max MAX_CONCURRENT overlapping appointments
  const { data: sameDay, error: dayErr } = await sb
    .from("appointments")
    .select("appointment_time, service_duration")
    .eq("appointment_date", date)
    .neq("status", "cancelled");
  if (dayErr) return { ok: false, code: "db_error", message: "Er ging iets mis, probeer het opnieuw." };

  const booked: BookedInterval[] = (sameDay || []).map((r: { appointment_time: string; service_duration: number }) => ({
    start: toMinutes(r.appointment_time),
    dur: Number(r.service_duration) || 60,
  }));
  if (!slotIsFree(start, duration, booked)) {
    return { ok: false, code: "full", message: "Deze tijd is helaas net volgeboekt. Kies een andere tijd." };
  }

  // Anti-hoarding: limit open upcoming appointments per phone number
  if (phone) {
    const { data: upcoming, error: upErr } = await sb
      .from("appointments")
      .select("id, appointment_date")
      .eq("phone", phone)
      .neq("status", "cancelled")
      .gte("appointment_date", now.dateStr);
    if (!upErr && (upcoming || []).length >= MAX_UPCOMING_PER_PHONE) {
      return {
        ok: false, code: "too_many",
        message: `Er staan al ${MAX_UPCOMING_PER_PHONE} afspraken open op dit telefoonnummer. Annuleer eerst een bestaande afspraak of bel ons.`,
      };
    }
  }

  return { ok: true };
}
