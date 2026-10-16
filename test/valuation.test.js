const test = require('node:test');
const assert = require('node:assert');
const v = require('../server/valuation');

const now = new Date('2026-06-01');

test('factor rules match the plan', () => {
  assert.equal(v.ownerFactor(1), 1); assert.equal(v.ownerFactor(2), 0.95); assert.equal(v.ownerFactor(3), 0.88);
  assert.equal(v.kmFactor(9000 * 3, 3), 1); assert.equal(v.kmFactor(12000 * 3, 3), 0.97); assert.equal(v.kmFactor(20000 * 3, 3), 0.93);
  assert.equal(v.conditionFactor('A'), 1); assert.equal(v.conditionFactor('C'), 0.85);
  assert.ok(Math.abs(v.ageDepreciation(1) - 0.175) < 1e-9);
  assert.equal(v.ageDepreciation(30), 0.85);
});

test('estimate gives a ±5% range rounded to ₹1,000', () => {
  const e = v.estimate({ brand: 'Maruti Suzuki', model: 'Swift', year: 2022, kmDriven: 30000, owners: 1, grade: 'A', now });
  // 4 years, 7,500 km/yr: 700000 × (1 − 0.445) × 1 × 1 × 1 × 1.05 ≈ 407,925
  assert.equal(e.price, 408000);
  assert.ok(e.min < e.price && e.price < e.max);
  assert.equal(e.min % 1000, 0);
});

test('accident and more owners lower the price', () => {
  const base = { brand: 'Hyundai', model: 'Creta', year: 2020, kmDriven: 50000, owners: 1, now };
  const clean = v.estimate(base).price;
  assert.ok(v.estimate({ ...base, accident: true }).price < clean);
  assert.ok(v.estimate({ ...base, owners: 3 }).price < clean);
});

test('unknown model throws', () => {
  assert.throws(() => v.estimate({ brand: 'X', model: 'Y', year: 2020, kmDriven: 1, owners: 1 }));
});
