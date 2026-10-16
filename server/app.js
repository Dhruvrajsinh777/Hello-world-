// HTTP API + static file server. No external dependencies.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const catalog = require('./catalog');
const valuation = require('./valuation');
const { checklist, grade, CONDITION_POINTS } = require('./checklist');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
};
const MAX_BODY = 15 * 1024 * 1024;
const MAX_PHOTOS = 8;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const OTP_TTL_MS = 5 * 60 * 1000;
const COMMISSION_RATE = 0.015; // 1–2% success commission

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);

function createApp(db, { uploadsDir, devOtp = true, now = () => Date.now() } = {}) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  const routes = [];
  const route = (method, pattern, ...handlers) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '(\\d+)'; }) + '$');
    routes.push({ method, re, keys, handlers });
  };
  const q = (sql, ...args) => db.prepare(sql).all(...args);
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);

  // ---------- middleware ----------
  const auth = (req) => {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const user = token && one('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?', token);
    if (!user) throw new HttpError(401, 'Please log in');
    req.user = user;
  };
  const role = (...roles) => (req) => {
    auth(req);
    if (!roles.includes(req.user.role)) throw new HttpError(403, 'Not allowed');
  };

  // ---------- helpers ----------
  const int = (v, name, { min = -Infinity, max = Infinity } = {}) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw bad(`Invalid ${name}`);
    return n;
  };
  const str = (v, name, { max = 200, required = true } = {}) => {
    if (v == null || v === '') { if (required) throw bad(`${name} is required`); return null; }
    if (typeof v !== 'string' || v.length > max) throw bad(`Invalid ${name}`);
    return v.trim();
  };
  const oneOf = (v, name, options) => { if (!options.includes(v)) throw bad(`Invalid ${name}`); return v; };

  const savePhoto = (dataUrl) => {
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
    if (!m) throw bad('Photos must be JPEG, PNG or WebP');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_PHOTO_BYTES) throw bad('Each photo must be under 2 MB');
    const name = crypto.randomBytes(12).toString('hex') + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
    fs.writeFileSync(path.join(uploadsDir, name), buf);
    return '/uploads/' + name;
  };

  const listingSummarySql = `
    SELECT l.id, l.type, l.asking_price, l.final_price, l.status, l.city, l.created_at, l.featured_till,
           c.brand, c.model, c.variant, c.year, c.fuel, c.transmission, c.km_driven, c.owners, c.color, c.reg_number,
           (SELECT url FROM car_photos p WHERE p.car_id = c.id ORDER BY sort_order LIMIT 1) AS photo,
           (SELECT grade FROM inspections i WHERE i.car_id = c.id AND i.status = 'done' ORDER BY i.id DESC LIMIT 1) AS grade
    FROM listings l JOIN cars c ON c.id = l.car_id`;

  const maskReg = (r) => (r ? r.slice(0, 4) + '••' + r.slice(-2) : null);
  const publicListing = (l) => ({ ...l, reg_number: maskReg(l.reg_number) });

  // ---------- public ----------
  route('GET', '/api/catalog', () => ({ models: catalog.models, fuels: ['Petrol', 'Diesel', 'CNG', 'Electric'], transmissions: ['Manual', 'Automatic'] }));
  route('GET', '/api/checklist', () => ({ checklist }));

  route('POST', '/api/estimate', (req) => {
    const b = req.body;
    try {
      return valuation.estimate({
        brand: b.brand, model: b.model,
        year: int(b.year, 'year', { min: 1990, max: new Date(now()).getFullYear() }),
        kmDriven: int(b.kmDriven, 'km driven', { min: 0, max: 1000000 }),
        owners: int(b.owners, 'owners', { min: 1, max: 9 }),
        grade: b.grade || 'B', accident: !!b.accident, now: new Date(now()),
      });
    } catch (e) { throw e instanceof HttpError ? e : bad(e.message); }
  });

  route('GET', '/api/listings', (req) => {
    const p = req.query;
    const where = ["l.status IN ('live','booked')"];
    const args = [];
    const add = (cond, val) => { where.push(cond); args.push(val); };
    if (p.q) { const like = `%${p.q}%`; where.push('(c.brand LIKE ? OR c.model LIKE ? OR c.variant LIKE ?)'); args.push(like, like, like); }
    if (p.brand) add('c.brand = ?', p.brand);
    if (p.model) add('c.model = ?', p.model);
    if (p.fuel) add('c.fuel = ?', p.fuel);
    if (p.transmission) add('c.transmission = ?', p.transmission);
    if (p.city) add('l.city = ?', p.city);
    if (p.minPrice) add('l.asking_price >= ?', Number(p.minPrice));
    if (p.maxPrice) add('l.asking_price <= ?', Number(p.maxPrice));
    if (p.minYear) add('c.year >= ?', Number(p.minYear));
    if (p.maxKm) add('c.km_driven <= ?', Number(p.maxKm));
    if (p.owners) add('c.owners <= ?', Number(p.owners));
    const sorts = { new: 'l.id DESC', price_asc: 'l.asking_price ASC', price_desc: 'l.asking_price DESC', km: 'c.km_driven ASC', year: 'c.year DESC' };
    const order = sorts[p.sort] || sorts.new;
    const rows = q(`${listingSummarySql} WHERE ${where.join(' AND ')}
      ORDER BY (CASE WHEN l.featured_till > datetime('now') THEN 0 ELSE 1 END), ${order} LIMIT 100`, ...args);
    return { listings: rows.map(publicListing) };
  });

  route('GET', '/api/listings/:id', (req) => {
    const l = one(`${listingSummarySql} WHERE l.id = ?`, req.params.id);
    const viewer = optionalUser(req);
    const isOwnerOrStaff = viewer && (viewer.role === 'admin' || one('SELECT 1 FROM listings WHERE id = ? AND seller_id = ?', l?.id, viewer.id));
    if (!l || (!['live', 'booked', 'sold'].includes(l.status) && !isOwnerOrStaff)) throw new HttpError(404, 'Car not found');
    const full = one('SELECT c.*, l.description, l.seller_id FROM listings l JOIN cars c ON c.id = l.car_id WHERE l.id = ?', l.id);
    const photos = q('SELECT url, angle FROM car_photos WHERE car_id = ? ORDER BY sort_order', full.id);
    const inspection = one("SELECT id, grade, score, slot_time FROM inspections WHERE car_id = ? AND status = 'done' ORDER BY id DESC LIMIT 1", full.id);
    const items = inspection ? q('SELECT category, item, condition, note FROM inspection_items WHERE inspection_id = ?', inspection.id) : [];
    const seller = one('SELECT name, city FROM users WHERE id = ?', full.seller_id);
    let estimate = null;
    try {
      estimate = valuation.estimate({ brand: full.brand, model: full.model, year: full.year, kmDriven: full.km_driven,
        owners: full.owners, grade: inspection?.grade || 'B', accident: !!full.accident, now: new Date(now()) });
    } catch { /* model not in catalog */ }
    const wishlisted = viewer ? !!one('SELECT 1 FROM wishlist WHERE user_id = ? AND listing_id = ?', viewer.id, l.id) : false;
    return { listing: { ...publicListing(l), description: full.description, accident: !!full.accident, rc_status: full.rc_status },
      photos, inspection: inspection && { ...inspection, items }, seller: { name: (seller.name || 'Seller').split(' ')[0], city: seller.city },
      estimate, wishlisted, supportPhone: process.env.SUPPORT_PHONE || '' };
  });

  function optionalUser(req) {
    try { auth(req); return req.user; } catch { return null; }
  }

  // ---------- auth (OTP) ----------
  route('POST', '/api/auth/otp', (req) => {
    const mobile = str(req.body.mobile, 'mobile', { max: 10 });
    if (!/^[6-9]\d{9}$/.test(mobile)) throw bad('Enter a valid 10-digit mobile number');
    const code = String(crypto.randomInt(100000, 1000000));
    run('INSERT INTO otps (mobile, code, expires_at, attempts) VALUES (?, ?, ?, 0) ON CONFLICT(mobile) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, attempts = 0',
      mobile, code, now() + OTP_TTL_MS);
    // Production: send via MSG91 / Gupshup here instead of returning it.
    return devOtp ? { sent: true, devOtp: code } : { sent: true };
  });

  route('POST', '/api/auth/verify', (req) => {
    const mobile = str(req.body.mobile, 'mobile', { max: 10 });
    const code = str(String(req.body.otp ?? ''), 'OTP', { max: 6 });
    const row = one('SELECT * FROM otps WHERE mobile = ?', mobile);
    if (!row || row.expires_at < now() || row.attempts >= 5) throw bad('OTP expired, request a new one');
    if (row.code !== code) { run('UPDATE otps SET attempts = attempts + 1 WHERE mobile = ?', mobile); throw bad('Wrong OTP'); }
    run('DELETE FROM otps WHERE mobile = ?', mobile);
    let user = one('SELECT * FROM users WHERE mobile = ?', mobile);
    if (!user) {
      const name = str(req.body.name, 'name', { max: 80, required: false }) || 'Customer';
      const id = run("INSERT INTO users (name, mobile, role, city) VALUES (?, ?, 'customer', ?)", name, mobile,
        str(req.body.city, 'city', { max: 60, required: false })).lastInsertRowid;
      user = one('SELECT * FROM users WHERE id = ?', id);
    }
    const token = crypto.randomBytes(24).toString('hex');
    run('INSERT INTO sessions (token, user_id) VALUES (?, ?)', token, user.id);
    return { token, user };
  });

  route('GET', '/api/me', auth, (req) => ({ user: req.user }));
  route('POST', '/api/logout', auth, (req) => {
    run('DELETE FROM sessions WHERE token = ?', req.headers.authorization.replace(/^Bearer /, ''));
    return { ok: true };
  });

  // ---------- seller ----------
  route('POST', '/api/sell', auth, (req) => {
    const b = req.body;
    if (!catalog.find(b.brand, b.model)) throw bad('Pick a brand and model from the list');
    const year = int(b.year, 'year', { min: 1990, max: new Date(now()).getFullYear() });
    const km = int(b.kmDriven, 'km driven', { min: 0, max: 1000000 });
    const owners = int(b.owners, 'owners', { min: 1, max: 9 });
    const reg = str(b.regNumber, 'registration number', { max: 15 }).toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/.test(reg)) throw bad('Invalid registration number (e.g. GJ01AB1234)');
    const type = oneOf(b.type || 'marketplace', 'sale type', ['marketplace', 'instant']);
    const photos = Array.isArray(b.photos) ? b.photos : [];
    if (photos.length > MAX_PHOTOS) throw bad(`Up to ${MAX_PHOTOS} photos`);
    const est = valuation.estimate({ brand: b.brand, model: b.model, year, kmDriven: km, owners, accident: !!b.accident, now: new Date(now()) });
    const asking = b.askingPrice ? int(b.askingPrice, 'asking price', { min: 10000, max: 50000000 }) : est.price;
    const urls = photos.map(savePhoto);

    db.exec('BEGIN');
    try {
      const carId = run(`INSERT INTO cars (reg_number, brand, model, variant, year, fuel, transmission, km_driven, owners, color, accident)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, reg, b.brand, b.model, str(b.variant, 'variant', { max: 40, required: false }), year,
        oneOf(b.fuel, 'fuel', ['Petrol', 'Diesel', 'CNG', 'Electric']), oneOf(b.transmission, 'transmission', ['Manual', 'Automatic']),
        km, owners, str(b.color, 'color', { max: 30, required: false }), b.accident ? 1 : 0).lastInsertRowid;
      urls.forEach((u, i) => run('INSERT INTO car_photos (car_id, url, sort_order) VALUES (?, ?, ?)', carId, u, i));
      run('INSERT INTO price_estimates (car_id, min_price, max_price, method) VALUES (?, ?, ?, ?)', carId, est.min, est.max, 'rule_v1');
      const listingId = run(`INSERT INTO listings (car_id, seller_id, type, asking_price, city, description, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        carId, req.user.id, type, asking, str(b.city, 'city', { max: 60, required: false }) || req.user.city,
        str(b.description, 'description', { max: 1000, required: false })).lastInsertRowid;
      run('INSERT INTO inspections (car_id, slot_time, address, status) VALUES (?, ?, ?, ?)', carId,
        str(b.inspectionSlot, 'inspection slot', { max: 30 }), str(b.inspectionAddress, 'inspection address', { max: 300 }), 'requested');
      db.exec('COMMIT');
      return { listingId: Number(listingId), estimate: est };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  });

  route('GET', '/api/my/listings', auth, (req) => {
    const rows = q(`${listingSummarySql} WHERE l.seller_id = ? ORDER BY l.id DESC`, req.user.id);
    return { listings: rows.map((r) => ({ ...r,
      leads: one('SELECT COUNT(*) AS n FROM leads WHERE listing_id = ?', r.id).n,
      bookings: one("SELECT COUNT(*) AS n FROM bookings WHERE listing_id = ? AND status != 'cancelled'", r.id).n,
      inspection: one('SELECT i.status, i.slot_time, i.grade FROM inspections i JOIN listings l ON l.car_id = i.car_id WHERE l.id = ? ORDER BY i.id DESC LIMIT 1', r.id),
    })) };
  });

  // ---------- buyer ----------
  const liveListing = (id) => {
    const l = one('SELECT * FROM listings WHERE id = ?', id);
    if (!l || l.status !== 'live') throw bad('This car is not available');
    return l;
  };

  route('POST', '/api/listings/:id/wishlist', auth, (req) => {
    const id = Number(req.params.id);
    if (!one('SELECT 1 FROM listings WHERE id = ?', id)) throw new HttpError(404, 'Car not found');
    if (one('SELECT 1 FROM wishlist WHERE user_id = ? AND listing_id = ?', req.user.id, id)) {
      run('DELETE FROM wishlist WHERE user_id = ? AND listing_id = ?', req.user.id, id);
      return { wishlisted: false };
    }
    run('INSERT INTO wishlist (user_id, listing_id) VALUES (?, ?)', req.user.id, id);
    return { wishlisted: true };
  });
  route('GET', '/api/my/wishlist', auth, (req) => ({
    listings: q(`${listingSummarySql} JOIN wishlist w ON w.listing_id = l.id WHERE w.user_id = ? ORDER BY l.id DESC`, req.user.id).map(publicListing),
  }));

  route('POST', '/api/listings/:id/lead', (req) => {
    const id = Number(req.params.id);
    if (!one('SELECT 1 FROM listings WHERE id = ?', id)) throw new HttpError(404, 'Car not found');
    const viewer = optionalUser(req);
    run('INSERT INTO leads (listing_id, buyer_id, source) VALUES (?, ?, ?)', id, viewer?.id ?? null,
      oneOf(req.body.source, 'source', ['app', 'whatsapp', 'call']));
    return { ok: true };
  });

  route('POST', '/api/listings/:id/test-drive', auth, (req) => {
    const l = liveListing(req.params.id);
    if (l.seller_id === req.user.id) throw bad('You cannot book your own car');
    const id = run("INSERT INTO bookings (listing_id, buyer_id, type, slot_time, at_home) VALUES (?, ?, 'test_drive', ?, ?)",
      l.id, req.user.id, str(req.body.slotTime, 'slot', { max: 30 }), req.body.atHome ? 1 : 0).lastInsertRowid;
    run("INSERT INTO leads (listing_id, buyer_id, source, status) VALUES (?, ?, 'app', 'test_drive')", l.id, req.user.id);
    return { bookingId: Number(id) };
  });

  // Token booking: buyer pays ₹1,000–₹5,000; money held in escrow; car shows as booked.
  route('POST', '/api/listings/:id/token', auth, (req) => {
    const l = liveListing(req.params.id);
    if (l.seller_id === req.user.id) throw bad('You cannot book your own car');
    const amount = int(req.body.amount, 'token amount', { min: 1000, max: 5000 });
    db.exec('BEGIN');
    try {
      const bookingId = run("INSERT INTO bookings (listing_id, buyer_id, type, amount, status) VALUES (?, ?, 'token', ?, 'paid')",
        l.id, req.user.id, amount).lastInsertRowid;
      // Production: create a Razorpay/Cashfree order here and confirm via webhook.
      run("INSERT INTO payments (listing_id, booking_id, user_id, amount, gateway_ref, type, status) VALUES (?, ?, ?, ?, ?, 'token', 'held')",
        l.id, bookingId, req.user.id, amount, 'mock_' + crypto.randomBytes(6).toString('hex'));
      run("UPDATE listings SET status = 'booked' WHERE id = ?", l.id);
      db.exec('COMMIT');
      return { bookingId: Number(bookingId) };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  });

  route('GET', '/api/my/bookings', auth, (req) => ({
    bookings: q(`SELECT b.*, c.brand, c.model, c.year, l.asking_price, l.status AS listing_status
      FROM bookings b JOIN listings l ON l.id = b.listing_id JOIN cars c ON c.id = l.car_id WHERE b.buyer_id = ? ORDER BY b.id DESC`, req.user.id),
  }));

  // Cancelling a token refunds it (token is refundable if the car fails the buyer's test drive).
  route('POST', '/api/bookings/:id/cancel', auth, (req) => {
    const b = one('SELECT * FROM bookings WHERE id = ?', req.params.id);
    if (!b || (b.buyer_id !== req.user.id && req.user.role !== 'admin')) throw new HttpError(404, 'Booking not found');
    if (['cancelled', 'refunded'].includes(b.status)) throw bad('Already cancelled');
    if (one("SELECT status FROM listings WHERE id = ?", b.listing_id).status === 'sold') throw bad('Car already sold');
    db.exec('BEGIN');
    try {
      if (b.type === 'token') {
        run("UPDATE payments SET status = 'refunded' WHERE booking_id = ? AND type = 'token'", b.id);
        run("INSERT INTO payments (listing_id, booking_id, user_id, amount, type, status) VALUES (?, ?, ?, ?, 'refund', 'released')", b.listing_id, b.id, b.buyer_id, b.amount);
        run("UPDATE listings SET status = 'live' WHERE id = ? AND status = 'booked'", b.listing_id);
      }
      run("UPDATE bookings SET status = ? WHERE id = ?", b.type === 'token' ? 'refunded' : 'cancelled', b.id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { ok: true };
  });

  // ---------- inspector ----------
  route('GET', '/api/inspector/jobs', role('inspector', 'admin'), (req) => ({
    jobs: q(`SELECT i.id, i.slot_time, i.address, i.status, i.grade, i.score, c.brand, c.model, c.variant, c.year, c.reg_number, c.fuel, c.km_driven,
        u.name AS seller_name, u.mobile AS seller_mobile
      FROM inspections i JOIN cars c ON c.id = i.car_id JOIN listings l ON l.car_id = c.id JOIN users u ON u.id = l.seller_id
      WHERE i.inspector_id = ? OR (? = 'admin' AND i.inspector_id IS NOT NULL) ORDER BY (i.status = 'done'), i.slot_time`, req.user.id, req.user.role),
  }));

  route('POST', '/api/inspector/jobs/:id', role('inspector', 'admin'), (req) => {
    const insp = one('SELECT * FROM inspections WHERE id = ?', req.params.id);
    if (!insp || (req.user.role !== 'admin' && insp.inspector_id !== req.user.id)) throw new HttpError(404, 'Job not found');
    if (insp.status === 'done') throw bad('Report already submitted');
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (items.length < 5) throw bad('Fill in the checklist');
    for (const i of items) {
      if (!(i.condition in CONDITION_POINTS)) throw bad('Invalid condition');
      str(i.category, 'category', { max: 60 }); str(i.item, 'item', { max: 80 }); str(i.note, 'note', { max: 300, required: false });
    }
    const result = grade(items);
    const accident = !!req.body.accident;
    db.exec('BEGIN');
    try {
      for (const i of items) {
        run('INSERT INTO inspection_items (inspection_id, category, item, condition, note) VALUES (?, ?, ?, ?, ?)',
          insp.id, i.category, i.item, i.condition, i.note || null);
      }
      run("UPDATE inspections SET status = 'done', grade = ?, score = ?, report_json = ? WHERE id = ?",
        result.grade, result.score, JSON.stringify({ summary: str(req.body.summary, 'summary', { max: 1000, required: false }) }), insp.id);
      run("UPDATE cars SET accident = ?, rc_status = ? WHERE id = ?", accident ? 1 : 0, req.body.rcVerified ? 'verified' : 'unverified', insp.car_id);
      const car = one('SELECT * FROM cars WHERE id = ?', insp.car_id);
      const est = valuation.estimate({ brand: car.brand, model: car.model, year: car.year, kmDriven: car.km_driven, owners: car.owners,
        grade: result.grade, accident, now: new Date(now()) });
      run('INSERT INTO price_estimates (car_id, min_price, max_price, method) VALUES (?, ?, ?, ?)', car.id, est.min, est.max, 'post_inspection');
      db.exec('COMMIT');
      return { ...result, estimate: est };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  });

  // ---------- admin ----------
  const admin = role('admin');
  route('GET', '/api/admin/stats', admin, () => {
    const count = (sql) => one(sql).n;
    return {
      listings: Object.fromEntries(q('SELECT status, COUNT(*) AS n FROM listings GROUP BY status').map((r) => [r.status, r.n])),
      leads: count('SELECT COUNT(*) AS n FROM leads'),
      testDrives: count("SELECT COUNT(*) AS n FROM bookings WHERE type = 'test_drive'"),
      pendingInspections: count("SELECT COUNT(*) AS n FROM inspections WHERE status != 'done'"),
      escrowHeld: count("SELECT COALESCE(SUM(amount), 0) AS n FROM payments WHERE status = 'held' AND type IN ('token','full')"),
      revenue: count("SELECT COALESCE(SUM(amount), 0) AS n FROM payments WHERE type = 'fee'"),
      salesValue: count("SELECT COALESCE(SUM(final_price), 0) AS n FROM listings WHERE status = 'sold'"),
      users: count('SELECT COUNT(*) AS n FROM users'),
      pendingRc: count("SELECT COUNT(*) AS n FROM rc_transfers WHERE status != 'completed'"),
    };
  });

  route('GET', '/api/admin/listings', admin, (req) => {
    const status = req.query.status;
    const rows = q(`${listingSummarySql.replace('FROM listings l', ', u.name AS seller_name, u.mobile AS seller_mobile FROM listings l')}
      JOIN users u ON u.id = l.seller_id ${status ? 'WHERE l.status = ?' : ''} ORDER BY l.id DESC LIMIT 200`, ...(status ? [status] : []));
    return { listings: rows };
  });

  route('POST', '/api/admin/listings/:id/status', admin, (req) => {
    const status = oneOf(req.body.status, 'status', ['live', 'rejected']);
    const l = one('SELECT * FROM listings WHERE id = ?', req.params.id);
    if (!l) throw new HttpError(404, 'Listing not found');
    if (['sold', 'booked'].includes(l.status)) throw bad(`Listing is ${l.status}`);
    run('UPDATE listings SET status = ? WHERE id = ?', status, l.id);
    if (req.body.featuredDays) run("UPDATE listings SET featured_till = datetime('now', ?) WHERE id = ?", `+${int(req.body.featuredDays, 'days', { min: 1, max: 60 })} days`, l.id);
    return { ok: true };
  });

  route('GET', '/api/admin/inspections', admin, () => ({
    inspections: q(`SELECT i.*, c.brand, c.model, c.year, c.reg_number, u.name AS inspector_name
      FROM inspections i JOIN cars c ON c.id = i.car_id LEFT JOIN users u ON u.id = i.inspector_id
      ORDER BY (i.status = 'done'), i.id DESC LIMIT 200`),
    inspectors: q("SELECT id, name, mobile FROM users WHERE role = 'inspector'"),
  }));

  route('POST', '/api/admin/inspections/:id/assign', admin, (req) => {
    const inspector = one("SELECT id FROM users WHERE id = ? AND role = 'inspector'", Number(req.body.inspectorId));
    if (!inspector) throw bad('Pick an inspector');
    const r = run("UPDATE inspections SET inspector_id = ?, status = 'assigned' WHERE id = ? AND status != 'done'", inspector.id, req.params.id);
    if (!r.changes) throw bad('Inspection not found or already done');
    return { ok: true };
  });

  route('GET', '/api/admin/bookings', admin, () => ({
    bookings: q(`SELECT b.*, c.brand, c.model, c.year, u.name AS buyer_name, u.mobile AS buyer_mobile
      FROM bookings b JOIN listings l ON l.id = b.listing_id JOIN cars c ON c.id = l.car_id JOIN users u ON u.id = b.buyer_id
      ORDER BY b.id DESC LIMIT 200`),
  }));

  route('POST', '/api/admin/bookings/:id/confirm', admin, (req) => {
    const r = run("UPDATE bookings SET status = 'confirmed' WHERE id = ? AND type = 'test_drive' AND status = 'requested'", req.params.id);
    if (!r.changes) throw bad('Booking cannot be confirmed');
    return { ok: true };
  });

  // Mark sold: buyer's full payment is held in escrow; seller is paid only after RC transfer is filed.
  route('POST', '/api/admin/listings/:id/sold', admin, (req) => {
    const l = one('SELECT * FROM listings WHERE id = ?', req.params.id);
    if (!l || !['live', 'booked'].includes(l.status)) throw bad('Listing cannot be sold');
    const price = int(req.body.finalPrice, 'final price', { min: 10000, max: 50000000 });
    const token = one("SELECT b.* FROM bookings b WHERE b.listing_id = ? AND b.type = 'token' AND b.status = 'paid' ORDER BY id DESC LIMIT 1", l.id);
    const buyerId = token?.buyer_id ?? null;
    db.exec('BEGIN');
    try {
      run("UPDATE listings SET status = 'sold', final_price = ? WHERE id = ?", price, l.id);
      run("INSERT INTO payments (listing_id, booking_id, user_id, amount, gateway_ref, type, status) VALUES (?, ?, ?, ?, ?, 'full', 'held')",
        l.id, token?.id ?? null, buyerId, price - (token?.amount ?? 0), 'mock_' + crypto.randomBytes(6).toString('hex'));
      run("INSERT INTO payments (listing_id, booking_id, user_id, amount, type, status) VALUES (?, ?, ?, ?, 'fee', 'released')",
        l.id, token?.id ?? null, l.seller_id, Math.round(price * COMMISSION_RATE));
      run("INSERT INTO rc_transfers (listing_id, rto_office, status) VALUES (?, ?, 'pending')", l.id, str(req.body.rtoOffice, 'RTO office', { max: 60, required: false }));
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { ok: true, commission: Math.round(price * COMMISSION_RATE) };
  });

  route('GET', '/api/admin/rc', admin, () => ({
    transfers: q(`SELECT r.*, c.brand, c.model, c.reg_number, l.final_price FROM rc_transfers r
      JOIN listings l ON l.id = r.listing_id JOIN cars c ON c.id = l.car_id ORDER BY (r.status = 'completed'), r.id DESC`),
  }));

  route('POST', '/api/admin/rc/:id', admin, (req) => {
    const rc = one('SELECT * FROM rc_transfers WHERE id = ?', req.params.id);
    if (!rc) throw new HttpError(404, 'Not found');
    const status = oneOf(req.body.status, 'status', ['filed', 'completed']);
    if (rc.status === 'completed') throw bad('Already completed');
    db.exec('BEGIN');
    try {
      if (status === 'filed') run("UPDATE rc_transfers SET status = 'filed', filed_on = date('now'), rto_office = COALESCE(?, rto_office) WHERE id = ?",
        str(req.body.rtoOffice, 'RTO office', { max: 60, required: false }), rc.id);
      if (status === 'completed') run("UPDATE rc_transfers SET status = 'completed', completed_on = date('now'), filed_on = COALESCE(filed_on, date('now')) WHERE id = ?", rc.id);
      // Once filed, release escrow and pay the seller (price minus commission).
      if (rc.status === 'pending') {
        const l = one('SELECT * FROM listings WHERE id = ?', rc.listing_id);
        run("UPDATE payments SET status = 'released' WHERE listing_id = ? AND status = 'held' AND type IN ('token','full')", l.id);
        run("INSERT INTO payments (listing_id, user_id, amount, type, status) VALUES (?, ?, ?, 'payout', 'released')",
          l.id, l.seller_id, l.final_price - Math.round(l.final_price * COMMISSION_RATE));
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { ok: true };
  });

  route('GET', '/api/admin/users', admin, () => ({
    users: q('SELECT id, name, mobile, role, city, created_at FROM users ORDER BY id DESC LIMIT 500'),
  }));

  // ---------- server ----------
  async function readBody(req) {
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return {};
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) throw new HttpError(413, 'Request too large');
      chunks.push(c);
    }
    if (!size) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw bad('Invalid JSON'); }
  }

  function serveStatic(res, urlPath) {
    let file;
    if (urlPath.startsWith('/uploads/')) file = path.join(uploadsDir, path.basename(urlPath));
    else file = path.join(PUBLIC_DIR, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(PUBLIC_DIR) && !file.startsWith(uploadsDir)) file = null;
    if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC_DIR, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return serveStatic(res, decodeURIComponent(url.pathname));
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    };
    try {
      const match = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
      if (!match) throw new HttpError(404, 'Not found');
      const m = match.re.exec(url.pathname);
      req.params = Object.fromEntries(match.keys.map((k, i) => [k, Number(m[i + 1])]));
      req.query = Object.fromEntries(url.searchParams);
      req.body = await readBody(req);
      let result;
      for (const h of match.handlers) result = await h(req);
      send(200, result);
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e);
      send(e.status || 500, { error: e instanceof HttpError ? e.message : 'Something went wrong' });
    }
  });
}

module.exports = { createApp };
