/**
 * Gillco RWA Attendance App
 * Express + MongoDB backend.
 *
 * - Admin credentials are stored in MongoDB (admins collection) with a status field.
 * - Admin-only member creation & attendance marking.
 * - Member IDs use prefix "MEM" + a sequence starting at YYYYMM01.
 * - Public attendance view shows per-flat attendance %, red/green by threshold.
 * - Admin-configurable minimum attendance threshold (default 70%).
 * - CSV export endpoints for members & attendance.
 * - Only admins with status "active" can log in; "inactive" admins are declined.
 */
"use strict";

require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { MongoClient } = require("mongodb");

const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb+srv://gillcorwa:gillcorwaF203@mo.ujybdmp.mongodb.net/?appName=MO";
const DB_NAME = process.env.DB_NAME || "gillco_rwa";
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

const MEMBER_PREFIX = "MEM";
const DEFAULT_THRESHOLD = 70; // %

/* ------------------------------------------------------------------ *
 *  Admin credential bootstrap (stored in MongoDB: admins collection)
 *  Each admin document: { username, passwordHash, status, createdAt }
 *  status = "active" | "inactive"
 * ------------------------------------------------------------------ */
async function ensureAdminCredentials() {
  // Create unique index on username
  await db.collection("admins").createIndex({ username: 1 }, { unique: true });

  // Check if any admin already exists
  const existing = await db.collection("admins").findOne({ username: "admin" });
  if (existing) return existing;

  // First run — generate default credentials
  const username = "admin";
  const password = crypto.randomBytes(6).toString("hex"); // 12-char password
  const passwordHash = bcrypt.hashSync(password, 10);

  const adminDoc = {
    username,
    passwordHash,
    status: "active",
    createdAt: new Date().toISOString(),
  };
  await db.collection("admins").insertOne(adminDoc);

  console.log("\n=========================================================");
  console.log("  GILLCO RWA — Admin credentials (first run)");
  console.log("  Stored in MongoDB: gillco_rwa.admins collection");
  console.log(`  Username: ${username}`);
  console.log(`  Password: ${password}`);
  console.log("  Status:   active");
  console.log("=========================================================\n");
  return adminDoc;
}

/* ------------------------------------------------------------------ *
 *  Mongo connection
 * ------------------------------------------------------------------ */
let db = null;

async function connectMongo() {
  const client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  await client.connect();
  db = client.db(DB_NAME);

  await db.collection("admins").createIndex({ username: 1 }, { unique: true });
  await db.collection("members").createIndex({ memberId: 1 }, { unique: true });
  await db.collection("members").createIndex({ flatNumber: 1 });
  await db.collection("attendance").createIndex({ date: 1 }, { unique: true });
  console.log(`[mongo] connected → ${DB_NAME}`);
  return db;
}

/* ------------------------------------------------------------------ *
 *  Configurable attendance threshold (settings collection)
 * ------------------------------------------------------------------ */
async function getThreshold() {
  const doc = await db.collection("settings").findOne({ _id: "attendance" });
  if (doc && typeof doc.threshold === "number") return doc.threshold;
  return DEFAULT_THRESHOLD;
}

async function setThreshold(value) {
  const v = Math.max(0, Math.min(100, Number(value)));
  if (isNaN(v)) throw new Error("Threshold must be a number 0–100.");
  await db.collection("settings").updateOne(
    { _id: "attendance" },
    { $set: { threshold: v, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
  return v;
}

/* ------------------------------------------------------------------ *
 *  Member ID generator — prefix MEM + seq from YYYYMM01
 * ------------------------------------------------------------------ */
async function nextMemberSeq(session) {
  const counters = db.collection("counters");
  const now = new Date();
  const base = parseInt(
    `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}01`,
    10
  );

  const filter = { _id: "memberSeq" };
  const update = {
    $setOnInsert: { seq: base },
  };
  await counters.updateOne(filter, update, { upsert: true, session });

  const next = await counters.findOneAndUpdate(
    { _id: "memberSeq" },
    { $inc: { seq: 1 } },
    { session, returnDocument: "after" }
  );
  return next.seq;
}

function buildMemberId(seq) {
  return `${MEMBER_PREFIX}${seq}`;
}

/* ------------------------------------------------------------------ *
 *  CSV helper
 * ------------------------------------------------------------------ */
function csvValue(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function csvRow(values) {
  return values.map(csvValue).join(",") + "\r\n";
}

/* ------------------------------------------------------------------ *
 *  Auth middleware
 * ------------------------------------------------------------------ */
function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res
    .status(401)
    .json({ ok: false, error: "Unauthorized — admin sign-in required." });
}

/* Async admin guard — also checks admin.status in MongoDB */
async function requireAdminAsync(req, res, next) {
  if (!req.session || !req.session.admin)
    return res.status(401).json({ ok: false, error: "Unauthorized — admin sign-in required." });
  try {
    const admin = await db.collection("admins").findOne({ username: req.session.admin.username });
    if (!admin || admin.status !== "active") {
      req.session.destroy(() => res.clearCookie("gillco.sid").status(403).json({ ok: false, error: "Account deactivated." }));
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

/* ------------------------------------------------------------------ *
 *  App
 * ------------------------------------------------------------------ */
async function createApp() {
  const adminCreds = await ensureAdminCredentials();

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, "public")));

  const MongoStore = require("connect-mongo");
  app.use(
    session({
      name: "gillco.sid",
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        clientPromise: (async () => {
          const client = new MongoClient(MONGODB_URI);
          await client.connect();
          return client;
        })(),
        dbName: DB_NAME,
        ttl: 60 * 60 * 8,
      }),
      cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 8,
        sameSite: "lax",
      },
    })
  );

  /* -------------------- Auth -------------------- */
  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password)
      return res
        .status(400)
        .json({ ok: false, error: "Username and password are required." });

    // Fetch admin from MongoDB by username
    const admin = await db.collection("admins").findOne({ username: username.trim() });
    if (!admin || !bcrypt.compareSync(password, admin.passwordHash)) {
      return res.status(401).json({ ok: false, error: "Invalid credentials." });
    }

    // Check admin status
    if (admin.status !== "active") {
      return res.status(403).json({
        ok: false,
        error: "Your admin account is inactive. Please contact the administrator.",
      });
    }

    req.session.admin = { username: admin.username };
    res.json({ ok: true, username: admin.username });
  });

  app.post("/api/logout", (req, res) => {
    req.session.destroy(() =>
      res.clearCookie("gillco.sid").json({ ok: true })
    );
  });

  app.get("/api/me", async (req, res) => {
    if (req.session && req.session.admin) {
      // Re-check status from DB in case admin was deactivated mid-session
      const admin = await db.collection("admins").findOne({ username: req.session.admin.username });
      if (!admin || admin.status !== "active") {
        req.session.destroy(() => res.clearCookie("gillco.sid").status(403).json({ ok: false, error: "Account deactivated." }));
        return;
      }
      return res.json({ ok: true, admin: req.session.admin });
    }
    res.status(401).json({ ok: false });
  });

  /* -------------------- Settings (threshold) -------------------- */
  app.get("/api/settings", async (req, res) => {
    const threshold = await getThreshold();
    res.json({ ok: true, threshold });
  });

  app.post("/api/settings", requireAdminAsync, async (req, res) => {
    const { threshold } = req.body || {};
    if (threshold === undefined || threshold === null)
      return res.status(400).json({ ok: false, error: "threshold is required." });
    try {
      const v = await setThreshold(threshold);
      res.json({ ok: true, threshold: v });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  /* -------------------- Members -------------------- */

  // Public: list members
  app.get("/api/members", async (req, res) => {
    const members = await db
      .collection("members")
      .find({}, { projection: { _id: 0 } })
      .sort({ flatNumber: 1, name: 1 })
      .toArray();
    res.json({ ok: true, members });
  });

  // Admin: create a member
  app.post("/api/members", requireAdminAsync, async (req, res) => {
    const { name, age, flatNumber } = req.body || {};
    if (!name || !flatNumber)
      return res
        .status(400)
        .json({ ok: false, error: "Name and Flat Number are required." });

    const seq = await nextMemberSeq();
    const memberId = buildMemberId(seq);
    const member = {
      memberId,
      name: String(name).trim(),
      age: age ? Number(age) : null,
      flatNumber: String(flatNumber).trim().toUpperCase(),
      onboardedDate: new Date().toISOString(),
    };

    try {
      await db.collection("members").insertOne(member);
      res.json({ ok: true, member });
    } catch (err) {
      if (err.code === 11000)
        return res
          .status(409)
          .json({ ok: false, error: "Duplicate member id — try again." });
      throw err;
    }
  });

  // Admin: delete a member
  app.delete("/api/members/:memberId", requireAdminAsync, async (req, res) => {
    const r = await db
      .collection("members")
      .deleteOne({ memberId: req.params.memberId });
    res.json({ ok: true, deleted: r.deletedCount });
  });

  /* -------------------- Attendance -------------------- */

  // Public: list all attendance sheets
  app.get("/api/attendance", async (req, res) => {
    const sheets = await db
      .collection("attendance")
      .find({}, { projection: { _id: 0 } })
      .sort({ date: -1 })
      .toArray();
    res.json({ ok: true, sheets });
  });

  // Public: per-flat attendance summary with %, color flag
  app.get("/api/attendance/summary", async (req, res) => {
    const threshold = await getThreshold();
    const members = await db
      .collection("members")
      .find({}, { projection: { _id: 0 } })
      .toArray();
    const sheets = await db
      .collection("attendance")
      .find({}, { projection: { _id: 0 } })
      .toArray();

    // Build flat -> members map
    const flatMap = {};
    for (const m of members) {
      if (!flatMap[m.flatNumber]) flatMap[m.flatNumber] = [];
      flatMap[m.flatNumber].push(m);
    }

    // Tally present / total per flat
    const tally = {};
    for (const f of Object.keys(flatMap)) {
      tally[f] = { present: 0, total: 0 };
    }
    for (const sheet of sheets) {
      for (const rec of sheet.records || []) {
        const f = rec.flatNumber;
        if (!tally[f]) tally[f] = { present: 0, total: 0 };
        tally[f].total += 1;
        if (rec.status === "present") tally[f].present += 1;
      }
    }

    const summary = Object.keys(flatMap)
      .sort()
      .map((flat) => {
        const t = tally[flat];
        const pct =
          t.total === 0 ? 0 : Math.round((t.present / t.total) * 1000) / 10;
        return {
          flatNumber: flat,
          members: flatMap[flat].map((m) => m.name).join(", "),
          memberCount: flatMap[flat].length,
          present: t.present,
          total: t.total,
          percentage: pct,
          status: pct < threshold ? "low" : "ok",
        };
      });

    res.json({ ok: true, summary, threshold });
  });

  // Admin: create / replace an attendance sheet for a date
  app.post("/api/attendance", requireAdminAsync, async (req, res) => {
    const { date, records } = req.body || {};
    if (!date)
      return res.status(400).json({ ok: false, error: "Date is required." });
    if (!Array.isArray(records))
      return res
        .status(400)
        .json({ ok: false, error: "records must be an array." });

    const cleanRecords = records
      .filter((r) => r.memberId && (r.status === "present" || r.status === "absent"))
      .map((r) => ({
        memberId: String(r.memberId),
        name: String(r.name || ""),
        flatNumber: String(r.flatNumber || "").toUpperCase(),
        status: r.status,
      }));

    const doc = {
      date,
      records: cleanRecords,
      updatedAt: new Date().toISOString(),
    };

    await db.collection("attendance").updateOne(
      { date },
      { $set: doc, $setOnInsert: { createdAt: new Date().toISOString() } },
      { upsert: true }
    );
    res.json({ ok: true, sheet: doc });
  });

  // Admin: fetch members for marking attendance
  app.get("/api/attendance/mark-list", requireAdminAsync, async (req, res) => {
    const members = await db
      .collection("members")
      .find({}, { projection: { _id: 0 } })
      .sort({ flatNumber: 1, name: 1 })
      .toArray();
    res.json({ ok: true, members });
  });

  /* -------------------- CSV Export (admin) -------------------- */
  app.get("/api/export/members", requireAdminAsync, async (req, res) => {
    const members = await db
      .collection("members")
      .find({}, { projection: { _id: 0 } })
      .sort({ flatNumber: 1, name: 1 })
      .toArray();

    let csv = csvRow(["Member ID", "Name", "Age", "Flat Number", "Onboarded Date"]);
    for (const m of members) {
      csv += csvRow([
        m.memberId,
        m.name,
        m.age ?? "",
        m.flatNumber,
        (m.onboardedDate || "").slice(0, 10),
      ]);
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="gillco-members-${todayStamp()}.csv"`
    );
    res.send(csv);
  });

  app.get("/api/export/attendance", requireAdminAsync, async (req, res) => {
    const sheets = await db
      .collection("attendance")
      .find({}, { projection: { _id: 0 } })
      .sort({ date: 1 })
      .toArray();

    let csv = csvRow([
      "Date",
      "Member ID",
      "Name",
      "Flat Number",
      "Status",
    ]);
    for (const s of sheets) {
      for (const rec of s.records || []) {
        csv += csvRow([
          s.date,
          rec.memberId,
          rec.name,
          rec.flatNumber,
          rec.status,
        ]);
      }
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="gillco-attendance-${todayStamp()}.csv"`
    );
    res.send(csv);
  });

  /* -------------------- 404 / errors -------------------- */
  app.use((req, res) => res.status(404).json({ ok: false, error: "Not found" }));
  app.use((err, req, res, next) => {
    console.error("[error]", err);
    res.status(500).json({ ok: false, error: "Server error" });
  });

  return app;
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ *
 *  Start
 * ------------------------------------------------------------------ */
(async () => {
  try {
    await connectMongo();
    const app = await createApp();
    app.listen(PORT, () => {
      console.log(`[gillco] RWA attendance app running at http://localhost:${PORT}`);
      console.log(`         Admin sign-in : http://localhost:${PORT}/login.html`);
      console.log(`         Public view   : http://localhost:${PORT}/`);
    });
  } catch (err) {
    console.error("Failed to start:", err.message);
    process.exit(1);
  }
})();
