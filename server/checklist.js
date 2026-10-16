// Inspection checklist used by the inspector app. Grows towards 100+ points over time.
const checklist = {
  Engine: ['Engine start / idle', 'Engine noise', 'Oil leakage', 'Exhaust smoke', 'Coolant level', 'Battery health'],
  Transmission: ['Clutch operation', 'Gear shifting', 'Gearbox noise'],
  'Suspension & Steering': ['Steering play', 'Shock absorbers', 'Wheel alignment'],
  Brakes: ['Brake pads', 'Brake disc / drum', 'Hand brake'],
  Body: ['Front bumper', 'Rear bumper', 'Bonnet', 'Doors', 'Roof', 'Paint (gauge reading)', 'Rust', 'Panel gaps'],
  Tyres: ['Front left', 'Front right', 'Rear left', 'Rear right', 'Spare tyre'],
  Interior: ['Seats', 'Dashboard', 'AC cooling', 'Music system', 'Power windows', 'Odometer vs records'],
  Electricals: ['Headlights', 'Tail lights', 'Indicators', 'Horn', 'Wipers', 'OBD scan (no error codes)'],
  Documents: ['RC matches chassis number', 'RC matches engine number', 'Insurance valid', 'PUC valid', 'No hypothecation / NOC present'],
};

const CONDITION_POINTS = { good: 2, fair: 1, poor: 0 };

// items: [{ condition: 'good'|'fair'|'poor' }] → { score 0–100, grade A/B/C }
function grade(items) {
  if (!items.length) return { score: 0, grade: 'C' };
  const total = items.reduce((s, i) => s + (CONDITION_POINTS[i.condition] ?? 0), 0);
  const score = Math.round((total / (items.length * 2)) * 100);
  return { score, grade: score >= 85 ? 'A' : score >= 70 ? 'B' : 'C' };
}

module.exports = { checklist, grade, CONDITION_POINTS };
