import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

const app = express(),
  up = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8e6 } }),
  sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY),
  SECRET = process.env.JWT_SECRET || "dev-secret",
  DEMO_OTP = "1234",
  SLA = { critical: 4, high: 24, medium: 48, low: 72 };

const allowedOrigins = [
  "https://civic360-pi.vercel.app",
  "http://localhost:5173",
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json());

// --- Health check (keeps Render awake when pinged)
app.get("/", (q, s) => s.json({ status: "CIVIC360 API is live" }));
app.get("/health", (q, s) => s.status(200).json({ status: "ok" }));

const wrap = (f) => (q, s) => f(q, s).catch((e) => s.status(500).json({ error: e.message }));
const auth =
  (...roles) =>
  (q, s, n) => {
    try {
      q.user = jwt.verify((q.headers.authorization || "").slice(7), SECRET);
      if (roles.length && !roles.includes(q.user.role)) return s.sendStatus(403);
      n();
    } catch {
      s.sendStatus(401);
    }
  };
const km = (a, b) => {
  const r = (x) => (x * Math.PI) / 180,
    d =
      Math.sin(r(b.lat - a.lat) / 2) ** 2 +
      Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(d));
};
const prio = (t, c) =>
  /flood|burst|accident|manhole|cluster|sewage|danger/i.test(t)
    ? "critical"
    : ["drainage", "water"].includes(c)
    ? "high"
    : c == "other"
    ? "low"
    : "medium";
async function store(files = []) {
  const out = [];
  for (const f of files) {
    const p = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
      { error } = await sb.storage
        .from("complaint-photos")
        .upload(p, f.buffer, { contentType: f.mimetype });
    if (error) throw error;
    out.push(sb.storage.from("complaint-photos").getPublicUrl(p).data.publicUrl);
  }
  return out;
}
const upd = (id, patch) => sb.from("complaints").update(patch).eq("id", id);

// --- Auth (demo OTP is 1234). To go live, send a real SMS in /send (MSG91 / Twilio) and store the OTP with an expiry.
app.post(
  "/api/auth/send",
  wrap(async (q, s) => {
    if (!/^[6-9]\d{9}$/.test(q.body.phone))
      return s.status(400).json({ error: "Enter a valid 10-digit mobile number" });
    s.json({ ok: 1 });
  })
);
app.post(
  "/api/auth/verify",
  wrap(async (q, s) => {
    const { phone, otp } = q.body;
    if (otp !== DEMO_OTP) return s.status(401).json({ error: "Incorrect OTP" });
    let { data: u } = await sb.from("users").select("*").eq("phone", phone).maybeSingle();
    if (!u) {
      const r = await sb
        .from("users")
        .insert({ phone, name: "Citizen " + phone.slice(-4) })
        .select()
        .single();
      if (r.error) throw r.error;
      u = r.data;
    }
    s.json({
      token: jwt.sign({ id: u.id, phone: u.phone, role: u.role, name: u.name }, SECRET, {
        expiresIn: "7d",
      }),
      user: { id: u.id, phone: u.phone, role: u.role, name: u.name },
    });
  })
);

// --- Complaints
app.get(
  "/api/complaints",
  auth(),
  wrap(async (q, s) => {
    let r = sb
      .from("complaints")
      .select("*, assignee:users!assigned_to(name)")
      .order("created_at", { ascending: false });
    if (q.query.assigned) r = r.eq("assigned_to", q.user.id);
    const { data, error } = await r;
    if (error) throw error;
    s.json(data);
  })
);
app.post(
  "/api/complaints",
  auth(),
  up.array("photos", 5),
  wrap(async (q, s) => {
    const b = q.body,
      lat = +b.lat,
      lng = +b.lng,
      p = prio(b.description + " " + b.category, b.category);
    const { data: open } = await sb
      .from("complaints")
      .select("id,lat,lng")
      .eq("category", b.category)
      .not("status", "in", "(resolved,verified)");
    const dup = (open || []).find((c) => km(c, { lat, lng }) < 0.1);
    const row = {
      id: "PMC-" + Date.now().toString().slice(-6),
      category: b.category,
      description: b.description,
      ward: +b.ward,
      address: b.address,
      lat,
      lng,
      priority: p,
      created_by: q.user.id,
      due_at: new Date(Date.now() + SLA[p] * 36e5).toISOString(),
      duplicate_of: dup ? dup.id : null,
      photos: await store(q.files),
    };
    const { data, error } = await sb.from("complaints").insert(row).select().single();
    if (error) throw error;
    s.json(data);
  })
);
app.post(
  "/api/complaints/:id/upvote",
  auth(),
  wrap(async (q, s) => {
    const { data: c } = await sb
      .from("complaints")
      .select("votes")
      .eq("id", q.params.id)
      .single();
    await upd(q.params.id, { votes: c.votes + 1 });
    s.json({ ok: 1 });
  })
);
app.post(
  "/api/complaints/:id/rate",
  auth(),
  wrap(async (q, s) => {
    await upd(q.params.id, { rating: +q.body.rating });
    s.json({ ok: 1 });
  })
);
app.get(
  "/api/officers",
  auth("admin"),
  wrap(async (q, s) => {
    const { data } = await sb.from("users").select("id,name").eq("role", "officer");
    s.json(data);
  })
);
app.post(
  "/api/complaints/:id/assign",
  auth("admin"),
  wrap(async (q, s) => {
    await upd(q.params.id, {
      assigned_to: q.body.officer_id || null,
      status: q.body.officer_id ? "assigned" : "open",
    });
    s.json({ ok: 1 });
  })
);
app.post(
  "/api/complaints/:id/merge",
  auth("admin"),
  wrap(async (q, s) => {
    const { data: c } = await sb
      .from("complaints")
      .select("duplicate_of,votes")
      .eq("id", q.params.id)
      .single();
    if (c.duplicate_of) {
      const { data: p } = await sb
        .from("complaints")
        .select("votes")
        .eq("id", c.duplicate_of)
        .single();
      await upd(c.duplicate_of, { votes: p.votes + c.votes + 1 });
    }
    await sb.from("complaints").delete().eq("id", q.params.id);
    s.json({ ok: 1 });
  })
);
app.post(
  "/api/complaints/:id/verify",
  auth("admin"),
  wrap(async (q, s) => {
    await upd(q.params.id, { status: "verified" });
    s.json({ ok: 1 });
  })
);
app.post(
  "/api/complaints/:id/checkin",
  auth("officer", "admin"),
  wrap(async (q, s) => {
    await upd(q.params.id, { status: "in_progress" });
    s.json({ ok: 1 });
  })
);
app.post(
  "/api/complaints/:id/complete",
  auth("officer", "admin"),
  up.fields([{ name: "before" }, { name: "after" }]),
  wrap(async (q, s) => {
    const f = q.files || {};
    if (!f.after || !f.after.length)
      return s.status(400).json({ error: "An after photo is required" });
    await upd(q.params.id, {
      status: "resolved",
      before_photos: await store(f.before),
      after_photos: await store(f.after),
    });
    s.json({ ok: 1 });
  })
);

app.listen(process.env.PORT || 4000, () =>
  console.log("CIVIC360 API on :" + (process.env.PORT || 4000))
);