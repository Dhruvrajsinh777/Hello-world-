// SQLite schema (plan section 7) using Node's built-in node:sqlite.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, mobile TEXT UNIQUE NOT NULL, email TEXT,
  role TEXT NOT NULL DEFAULT 'customer', -- customer (buyer+seller) / dealer / inspector / admin
  city TEXT, kyc_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS otps (
  mobile TEXT PRIMARY KEY, code TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reg_number TEXT, brand TEXT NOT NULL, model TEXT NOT NULL, variant TEXT,
  year INTEGER NOT NULL, fuel TEXT, transmission TEXT, km_driven INTEGER,
  owners INTEGER DEFAULT 1, color TEXT, insurance_till TEXT, rc_status TEXT DEFAULT 'unverified',
  accident INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  car_id INTEGER NOT NULL REFERENCES cars(id), seller_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL DEFAULT 'marketplace', -- instant / marketplace
  asking_price INTEGER, final_price INTEGER, city TEXT, description TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending / live / booked / sold / rejected
  featured_till TEXT, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS car_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, car_id INTEGER NOT NULL REFERENCES cars(id),
  url TEXT NOT NULL, angle TEXT, sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT, car_id INTEGER NOT NULL REFERENCES cars(id),
  inspector_id INTEGER REFERENCES users(id), slot_time TEXT, address TEXT,
  status TEXT NOT NULL DEFAULT 'requested', -- requested / assigned / done
  grade TEXT, score INTEGER, report_json TEXT
);
CREATE TABLE IF NOT EXISTS inspection_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, inspection_id INTEGER NOT NULL REFERENCES inspections(id),
  category TEXT, item TEXT, condition TEXT, photo_url TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS price_estimates (
  id INTEGER PRIMARY KEY AUTOINCREMENT, car_id INTEGER REFERENCES cars(id),
  min_price INTEGER, max_price INTEGER, method TEXT, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id INTEGER NOT NULL REFERENCES listings(id),
  buyer_id INTEGER REFERENCES users(id), source TEXT, status TEXT DEFAULT 'new', notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id INTEGER NOT NULL REFERENCES listings(id),
  buyer_id INTEGER NOT NULL REFERENCES users(id), type TEXT NOT NULL, -- test_drive / token
  slot_time TEXT, at_home INTEGER DEFAULT 0, amount INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'requested', -- requested / confirmed / paid / cancelled / refunded
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id INTEGER REFERENCES listings(id), booking_id INTEGER REFERENCES bookings(id),
  user_id INTEGER REFERENCES users(id), amount INTEGER NOT NULL, gateway_ref TEXT,
  type TEXT NOT NULL, -- token / full / fee / refund / payout
  status TEXT NOT NULL DEFAULT 'held', -- held (escrow) / released / refunded
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS wishlist (
  user_id INTEGER NOT NULL REFERENCES users(id), listing_id INTEGER NOT NULL REFERENCES listings(id),
  PRIMARY KEY (user_id, listing_id)
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT, car_id INTEGER REFERENCES cars(id), user_id INTEGER REFERENCES users(id),
  type TEXT, file_url TEXT, verified INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rc_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id INTEGER NOT NULL REFERENCES listings(id),
  rto_office TEXT, filed_on TEXT, status TEXT DEFAULT 'pending', completed_on TEXT
);
`;

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  seed(db);
  return db;
}

function seed(db) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (n > 0) return;
  const addUser = db.prepare('INSERT INTO users (name, mobile, role, city) VALUES (?, ?, ?, ?)');
  addUser.run('Admin', '9999999999', 'admin', 'Ahmedabad');
  addUser.run('Ramesh (Inspector)', '8888888888', 'inspector', 'Ahmedabad');
  const sellerId = Number(addUser.run('Demo Seller', '7777777777', 'customer', 'Ahmedabad').lastInsertRowid);

  const addCar = db.prepare(`INSERT INTO cars (reg_number, brand, model, variant, year, fuel, transmission, km_driven, owners, color, rc_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified')`);
  const addListing = db.prepare(`INSERT INTO listings (car_id, seller_id, type, asking_price, city, description, status)
    VALUES (?, ?, 'marketplace', ?, ?, ?, 'live')`);
  const addInspection = db.prepare(`INSERT INTO inspections (car_id, inspector_id, status, grade, score, report_json)
    VALUES (?, 2, 'done', ?, ?, ?)`);
  const samples = [
    ['GJ01AB1234', 'Maruti Suzuki', 'Swift', 'VXI', 2019, 'Petrol', 'Manual', 42000, 1, 'Red', 465000, 'A', 92],
    ['GJ01CD5678', 'Hyundai', 'Creta', 'SX', 2020, 'Diesel', 'Manual', 61000, 1, 'White', 1050000, 'B', 84],
    ['GJ27EF9012', 'Tata', 'Nexon', 'XZ+', 2021, 'Petrol', 'Automatic', 28000, 1, 'Blue', 820000, 'A', 90],
    ['GJ01GH3456', 'Toyota', 'Innova', 'GX', 2017, 'Diesel', 'Manual', 98000, 2, 'Silver', 1250000, 'B', 80],
    ['GJ18JK7890', 'Honda', 'City', 'V', 2018, 'Petrol', 'Automatic', 55000, 2, 'Grey', 760000, 'B', 82],
    ['GJ01LM2468', 'Maruti Suzuki', 'Wagon R', 'LXI', 2016, 'CNG', 'Manual', 88000, 2, 'White', 285000, 'C', 70],
  ];
  for (const s of samples) {
    const carId = Number(addCar.run(...s.slice(0, 10)).lastInsertRowid);
    addListing.run(carId, sellerId, s[10], 'Ahmedabad', `Well maintained ${s[2]} ${s[3]}, all papers clear.`);
    addInspection.run(carId, s[11], s[12], JSON.stringify({ summary: 'Seeded demo inspection' }));
  }
}

module.exports = { open };
