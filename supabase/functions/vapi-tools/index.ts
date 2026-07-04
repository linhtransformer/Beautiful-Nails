import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  LEAD_TIME_MIN,
  OPENING_HOURS,
  amsterdamNow,
  normalizePhone,
  slotIsFree,
  toMinutes,
  validateBooking,
  type BookedInterval,
} from "../_shared/booking.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

// ── Available slots helper ────────────────────────────────────────────────────
function generateSlots(
  openTime: string,  // "HH:MM:SS"
  closeTime: string, // "HH:MM:SS"
  serviceDuration: number, // minutes
  bookedSlots: BookedInterval[]
): string[] {
  const openMin = toMinutes(openTime);
  const closeMin = toMinutes(closeTime);

  const slots: string[] = [];
  for (let m = openMin; m + serviceDuration <= closeMin; m += 15) {
    if (slotIsFree(m, serviceDuration, bookedSlots)) {
      slots.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
    }
  }
  return slots;
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // Vapi sends tool calls as: { message: { toolCalls: [{ id, function: { name, arguments } }] } }
  // Support both direct { action, ... } calls and Vapi's nested format
  let action: string;
  let params: Record<string, unknown>;
  let toolCallId: string | null = null;

  if (body.message && (body.message as Record<string, unknown>).toolCalls) {
    const toolCall = ((body.message as Record<string, unknown>).toolCalls as Record<string, unknown>[])[0];
    toolCallId = (toolCall.id as string) || null;
    const fn = toolCall.function as Record<string, unknown>;
    action = fn.name as string;
    params = typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : (fn.arguments as Record<string, unknown>) || {};
  } else {
    action = body.action as string;
    params = body as Record<string, unknown>;
  }

  // Return in Vapi format (with toolCallId) when called from Vapi, otherwise plain
  function result(value: unknown) {
    const resultStr = typeof value === "string" ? value : JSON.stringify(value);
    if (toolCallId) {
      return json({ results: [{ toolCallId, result: resultStr }] });
    }
    return json({ result: value });
  }

  // ── get_business_info ──────────────────────────────────────────────────────
  if (action === "get_business_info") {
    const { data, error } = await sb.from("business_info").select("*");
    if (error) return json({ error: error.message }, 500);

    let info: Record<string, string> = {};
    if (Array.isArray(data)) {
      if (data[0] && "key" in data[0]) {
        data.forEach((row: { key: string; value: string }) => { info[row.key] = row.value; });
      } else {
        info = data[0] as Record<string, string>;
      }
    }
    return result(info);
  }

  // ── get_services ───────────────────────────────────────────────────────────
  if (action === "get_services") {
    let query = sb.from("services").select("*").order("category").order("name");
    if (params.category) query = query.eq("category", params.category);
    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);
    return result(data);
  }

  // ── get_opening_hours ──────────────────────────────────────────────────────
  if (action === "get_opening_hours") {
    const { data, error } = await sb.from("opening_hours").select("*").order("day_of_week");
    if (error) return json({ error: error.message }, 500);

    const DAY_NAMES = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
    const formatted = (data || []).map((row: {
      day_of_week: number; is_open: boolean; open_time: string; close_time: string;
    }) => ({
      day: DAY_NAMES[row.day_of_week],
      is_open: row.is_open,
      hours: row.is_open ? `${row.open_time?.slice(0, 5)} – ${row.close_time?.slice(0, 5)}` : "gesloten",
    }));
    return result(formatted);
  }

  // ── get_available_slots ────────────────────────────────────────────────────
  if (action === "get_available_slots") {
    const date = params.date as string; // "YYYY-MM-DD"
    const serviceDuration = Number(params.service_duration) || 60;

    if (!date) return json({ error: "date is required" }, 400);

    // Always use hardcoded hours — skip DB (DB data may be wrong/stale)
    const dayOfWeek = new Date(date + "T12:00:00").getDay();
    const hours = OPENING_HOURS[dayOfWeek];
    if (!hours?.is_open) {
      return result(`De salon is op ${date} gesloten.`);
    }

    // Get existing bookings for this date
    const { data: booked, error: bookedErr } = await sb
      .from("appointments")
      .select("appointment_time, service_duration")
      .eq("appointment_date", date)
      .neq("status", "cancelled");

    if (bookedErr) return json({ error: bookedErr.message }, 500);

    const bookedSlots = (booked || []).map((r: { appointment_time: string; service_duration: number }) => {
      const [h, m] = r.appointment_time.split(":").map(Number);
      return { start: h * 60 + m, dur: r.service_duration };
    });

    let slots = generateSlots(hours.open_time, hours.close_time, serviceDuration, bookedSlots);

    // When querying today, hide slots that are past or within the lead time (Amsterdam timezone)
    const now = amsterdamNow();
    if (date === now.dateStr) {
      slots = slots.filter(slot => {
        const [h, m] = slot.split(":").map(Number);
        return h * 60 + m >= now.minutes + LEAD_TIME_MIN;
      });
    }

    if (slots.length === 0) {
      return result(`Er zijn geen beschikbare tijden meer op ${date}.`);
    }
    return result(`Beschikbare tijden op ${date}: ${slots.join(", ")}.`);
  }

  // ── book_appointment ───────────────────────────────────────────────────────
  if (action === "book_appointment") {
    const required = ["name", "phone", "service_name", "appointment_date", "appointment_time"];
    for (const field of required) {
      if (!params[field]) return json({ error: `${field} is required` }, 400);
    }

    params.phone = normalizePhone(String(params.phone));

    const timeStr = String(params.appointment_time).length === 5
      ? params.appointment_time + ":00"
      : params.appointment_time;

    // Same rules as the website: lead time, opening hours, capacity, per-phone limit
    const check = await validateBooking(sb, {
      date: String(params.appointment_date),
      time: String(timeStr),
      duration: Number(params.service_duration) || 60,
      phone: String(params.phone),
    });
    if (!check.ok) {
      return result(`Boeking niet mogelijk: ${check.message} `);
    }

    const { data, error } = await sb.from("appointments").insert([{
      name:             params.name,
      phone:            params.phone,
      email:            params.email,
      service_name:     params.service_name,
      service_price:    params.service_price || "Op aanvraag",
      service_duration: Number(params.service_duration) || 60,
      appointment_date: params.appointment_date,
      appointment_time: timeStr,
      status:           "pending",
      notes:            params.notes || null,
    }]).select("id").single();

    if (error) return json({ error: error.message }, 500);

    return result(`Afspraak geboekt voor ${params.name} op ${params.appointment_date} om ${params.appointment_time} voor ${params.service_name}. Afspraak ID: ${data.id}.`);
  }

  // ── update_appointment ─────────────────────────────────────────────────────
  if (action === "update_appointment") {
    if (!params.appointment_id) return json({ error: "appointment_id is required" }, 400);
    if (!["confirmed", "cancelled", "pending"].includes(params.status as string)) {
      return json({ error: "status must be confirmed, cancelled, or pending" }, 400);
    }

    const { error } = await sb
      .from("appointments")
      .update({ status: params.status })
      .eq("id", params.appointment_id);

    if (error) return json({ error: error.message }, 500);
    return result(`Status bijgewerkt naar ${params.status}.`);
  }

  // ── get_appointments ───────────────────────────────────────────────────────
  if (action === "get_appointments") {
    const date = params.date as string;
    if (!date) return json({ error: "date is required" }, 400);

    const { data, error } = await sb
      .from("appointments")
      .select("id, name, service_name, appointment_time, service_duration, status, phone, email, notes")
      .eq("appointment_date", date)
      .neq("status", "cancelled")
      .order("appointment_time");

    if (error) return json({ error: error.message }, 500);
    return result(data || []);
  }

  return json({ error: `Unknown action: ${action}` }, 400);
});
