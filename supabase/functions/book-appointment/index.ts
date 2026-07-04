import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizePhone, validateBooking } from "../_shared/booking.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Content-Type": "application/json",
};

// Always respond 200 with { success, ... } so the frontend can show the
// specific Dutch message instead of a generic invoke error.
function reply(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status: 200, headers: CORS });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: CORS });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply({ success: false, code: "invalid_json", message: "Ongeldige aanvraag." });
  }

  const required = ["name", "phone", "email", "service_name", "appointment_date", "appointment_time"];
  for (const field of required) {
    if (!body[field] || String(body[field]).trim() === "") {
      return reply({ success: false, code: "missing_field", message: "Niet alle velden zijn ingevuld." });
    }
  }

  const name = String(body.name).trim().slice(0, 120);
  const email = String(body.email).trim().slice(0, 200);
  const phone = normalizePhone(String(body.phone));
  const serviceName = String(body.service_name).trim().slice(0, 300);
  const duration = Math.min(Math.max(Number(body.service_duration) || 60, 5), 480);
  const date = String(body.appointment_date);
  const rawTime = String(body.appointment_time);
  const time = rawTime.length === 5 ? rawTime + ":00" : rawTime;
  const notes = body.notes ? String(body.notes).trim().slice(0, 1000) : null;

  if (phone.length < 6) {
    return reply({ success: false, code: "invalid_phone", message: "Vul een geldig telefoonnummer in." });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const check = await validateBooking(sb, { date, time, duration, phone });
  if (!check.ok) {
    return reply({ success: false, code: check.code, message: check.message });
  }

  const { data, error } = await sb.from("appointments").insert([{
    name,
    phone,
    email,
    service_name:     serviceName,
    service_price:    body.service_price ? String(body.service_price).slice(0, 60) : "Op aanvraag",
    service_duration: duration,
    appointment_date: date,
    appointment_time: time,
    status:           "pending",
    notes,
  }]).select("id").single();

  if (error) {
    console.error("Insert error:", error);
    return reply({ success: false, code: "db_error", message: "Er ging iets mis, probeer het opnieuw." });
  }

  return reply({ success: true, id: data.id });
});
