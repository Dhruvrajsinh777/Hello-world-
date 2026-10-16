const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { open } = require('../server/db');
const { createApp } = require('../server/app');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carapp-'));
const server = createApp(open(':memory:'), { uploadsDir: path.join(tmp, 'uploads') });
let base;
test.before(() => new Promise((r) => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
test.after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function call(method, url, body, token) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json() };
}
async function login(mobile, name) {
  const { data } = await call('POST', '/api/auth/otp', { mobile });
  const r = await call('POST', '/api/auth/verify', { mobile, otp: data.devOtp, name, city: 'Ahmedabad' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.token;
}
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('seeded live listings are searchable and filterable', async () => {
  const all = await call('GET', '/api/listings');
  assert.equal(all.data.listings.length, 6);
  assert.match(all.data.listings[0].reg_number, /••/); // number plate is masked
  const swift = await call('GET', '/api/listings?brand=Maruti%20Suzuki&maxPrice=500000&sort=price_asc');
  assert.deepEqual(swift.data.listings.map((l) => l.model), ['Wagon R', 'Swift']);
});

test('OTP login rejects wrong codes and bad numbers', async () => {
  assert.equal((await call('POST', '/api/auth/otp', { mobile: '12345' })).status, 400);
  await call('POST', '/api/auth/otp', { mobile: '9123456789' });
  assert.equal((await call('POST', '/api/auth/verify', { mobile: '9123456789', otp: '000000' })).data.error, 'Wrong OTP');
  assert.equal((await call('GET', '/api/me')).status, 401);
});

test('full flow: sell → approve → inspect → token → sold → RC → payout', async () => {
  const seller = await login('9000000001', 'Kiran');
  const buyer = await login('9000000002', 'Asha');
  const admin = await login('9999999999');
  const inspector = await login('8888888888');

  const sell = await call('POST', '/api/sell', { regNumber: 'gj01 xy 4321', brand: 'Tata', model: 'Nexon', year: 2021, fuel: 'Petrol',
    transmission: 'Manual', kmDriven: 30000, owners: 1, inspectionSlot: '2026-11-01T10:00', inspectionAddress: 'CG Road, Ahmedabad', photos: [PIXEL] }, seller);
  assert.equal(sell.status, 200, JSON.stringify(sell.data));
  const id = sell.data.listingId;

  // Pending listings are hidden from the public and from other users.
  assert.equal((await call('GET', `/api/listings/${id}`)).status, 404);
  assert.equal((await call('GET', `/api/listings/${id}`, null, seller)).status, 200);
  assert.equal((await call('POST', `/api/admin/listings/${id}/status`, { status: 'live' }, buyer)).status, 403);

  // Admin assigns inspector; inspector submits checklist.
  const { data: { inspections, inspectors } } = await call('GET', '/api/admin/inspections', null, admin);
  const insp = inspections.find((i) => i.reg_number === 'GJ01XY4321');
  assert.equal((await call('POST', `/api/admin/inspections/${insp.id}/assign`, { inspectorId: inspectors[0].id }, admin)).status, 200);
  const items = Array.from({ length: 10 }, (_, i) => ({ category: 'Body', item: 'Panel ' + i, condition: i < 9 ? 'good' : 'fair' }));
  const report = await call('POST', `/api/inspector/jobs/${insp.id}`, { items, rcVerified: true }, inspector);
  assert.deepEqual([report.data.grade, report.data.score], ['A', 95]);

  assert.equal((await call('POST', `/api/admin/listings/${id}/status`, { status: 'live' }, admin)).status, 200);
  const detail = await call('GET', `/api/listings/${id}`);
  assert.equal(detail.data.inspection.items.length, 10);
  assert.equal(detail.data.photos.length, 1);

  // Seller cannot book own car; buyer books test drive and pays token.
  assert.equal((await call('POST', `/api/listings/${id}/token`, { amount: 2000 }, seller)).status, 400);
  assert.equal((await call('POST', `/api/listings/${id}/test-drive`, { slotTime: '2026-11-02T11:00', atHome: true }, buyer)).status, 200);
  assert.equal((await call('POST', `/api/listings/${id}/token`, { amount: 9000 }, buyer)).status, 400);
  const tok = await call('POST', `/api/listings/${id}/token`, { amount: 2000 }, buyer);
  assert.equal(tok.status, 200);
  assert.equal((await call('GET', `/api/listings/${id}`)).data.listing.status, 'booked');

  // Cancel → refunded, back to live; book again.
  assert.equal((await call('POST', `/api/bookings/${tok.data.bookingId}/cancel`, null, buyer)).status, 200);
  assert.equal((await call('GET', `/api/listings/${id}`)).data.listing.status, 'live');
  await call('POST', `/api/listings/${id}/token`, { amount: 5000 }, buyer);

  const sold = await call('POST', `/api/admin/listings/${id}/sold`, { finalPrice: 800000, rtoOffice: 'GJ01' }, admin);
  assert.equal(sold.data.commission, 12000);
  let stats = (await call('GET', '/api/admin/stats', null, admin)).data;
  assert.equal(stats.escrowHeld, 800000); // 5,000 token + 795,000 balance
  assert.equal(stats.revenue, 12000);

  const rc = (await call('GET', '/api/admin/rc', null, admin)).data.transfers[0];
  assert.equal((await call('POST', `/api/admin/rc/${rc.id}`, { status: 'filed' }, admin)).status, 200);
  stats = (await call('GET', '/api/admin/stats', null, admin)).data;
  assert.equal(stats.escrowHeld, 0);
  assert.equal(stats.pendingRc, 1);
  assert.equal((await call('POST', `/api/admin/rc/${rc.id}`, { status: 'completed' }, admin)).status, 200);
  assert.equal((await call('GET', '/api/admin/stats', null, admin)).data.pendingRc, 0);

  const mine = await call('GET', '/api/my/listings', null, seller);
  assert.equal(mine.data.listings[0].status, 'sold');
});

test('sell validates input', async () => {
  const seller = await login('9000000003');
  const r = await call('POST', '/api/sell', { regNumber: 'bad!', brand: 'Tata', model: 'Nexon', year: 2021, kmDriven: 1, owners: 1 }, seller);
  assert.equal(r.status, 400);
  const r2 = await call('POST', '/api/sell', { regNumber: 'GJ01AA1111', brand: 'Tata', model: 'Nexon', year: 2021, fuel: 'Petrol', transmission: 'Manual',
    kmDriven: 1, owners: 1, inspectionSlot: 'x', inspectionAddress: 'y', photos: ['data:text/html;base64,PGgxPg=='] }, seller);
  assert.equal(r2.data.error, 'Photos must be JPEG, PNG or WebP');
});

test('static files cannot escape public dir', async () => {
  const res = await fetch(base + '/../server/app.js');
  assert.match(await res.text(), /<!doctype html>/i);
});
