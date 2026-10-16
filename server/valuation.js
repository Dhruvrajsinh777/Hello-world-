// Rule-based price valuation (plan section 8).
// Price = Base × (1 − Age dep.) × KM factor × Owner factor × Condition factor × Local demand

const catalog = require('./catalog');

function ageDepreciation(ageYears) {
  if (ageYears <= 0) return 0.05;
  // Year 1: ~17.5%, then ~9% more each year, capped so old cars keep some value.
  const dep = 0.175 + 0.09 * (ageYears - 1);
  return Math.min(dep, 0.85);
}

function kmFactor(kmDriven, ageYears) {
  const perYear = kmDriven / Math.max(ageYears, 1);
  if (perYear < 10000) return 1.0;
  if (perYear <= 15000) return 0.97;
  return 0.93;
}

function ownerFactor(owners) {
  if (owners <= 1) return 1.0;
  if (owners === 2) return 0.95;
  return 0.88;
}

function conditionFactor(grade, accident) {
  const byGrade = { A: 1.0, B: 0.93, C: 0.85 };
  let f = byGrade[grade] ?? 0.93;
  if (accident) f *= 0.85; // accident history: −10 to −25%, use −15%
  return f;
}

function demandFactor(demand) {
  if (demand === 'high') return 1.05;
  if (demand === 'low') return 0.95;
  return 1.0;
}

// Returns { base, price, min, max, factors } in INR, rounded to ₹1,000.
function estimate({ brand, model, year, kmDriven, owners, grade = 'B', accident = false, now = new Date() }) {
  const entry = catalog.find(brand, model);
  if (!entry) throw new Error('Unknown brand/model');
  const age = Math.max(0, now.getFullYear() - Number(year));
  const factors = {
    age: 1 - ageDepreciation(age),
    km: kmFactor(Number(kmDriven) || 0, age),
    owner: ownerFactor(Number(owners) || 1),
    condition: conditionFactor(grade, accident),
    demand: demandFactor(entry.demand),
  };
  const raw = Object.values(factors).reduce((p, f) => p * f, entry.base);
  const round = (n) => Math.round(n / 1000) * 1000;
  return {
    base: entry.base,
    price: round(raw),
    min: round(raw * 0.95),
    max: round(raw * 1.05),
    factors,
  };
}

module.exports = { estimate, ageDepreciation, kmFactor, ownerFactor, conditionFactor, demandFactor };
