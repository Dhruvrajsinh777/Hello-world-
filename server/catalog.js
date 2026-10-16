// Approximate current ex-showroom base prices (INR) for common models.
// Tune these locally; they drive the valuation "Base" factor.
const models = [
  { brand: 'Maruti Suzuki', model: 'Swift', base: 700000, demand: 'high' },
  { brand: 'Maruti Suzuki', model: 'Baleno', base: 800000, demand: 'high' },
  { brand: 'Maruti Suzuki', model: 'Dzire', base: 750000, demand: 'high' },
  { brand: 'Maruti Suzuki', model: 'Wagon R', base: 600000, demand: 'high' },
  { brand: 'Maruti Suzuki', model: 'Alto', base: 450000, demand: 'normal' },
  { brand: 'Maruti Suzuki', model: 'Brezza', base: 1100000, demand: 'high' },
  { brand: 'Maruti Suzuki', model: 'Ertiga', base: 1050000, demand: 'high' },
  { brand: 'Hyundai', model: 'i20', base: 850000, demand: 'normal' },
  { brand: 'Hyundai', model: 'Creta', base: 1400000, demand: 'high' },
  { brand: 'Hyundai', model: 'Venue', base: 1000000, demand: 'normal' },
  { brand: 'Hyundai', model: 'Verna', base: 1300000, demand: 'normal' },
  { brand: 'Tata', model: 'Nexon', base: 1050000, demand: 'high' },
  { brand: 'Tata', model: 'Tiago', base: 600000, demand: 'normal' },
  { brand: 'Tata', model: 'Punch', base: 750000, demand: 'normal' },
  { brand: 'Mahindra', model: 'Scorpio', base: 1600000, demand: 'high' },
  { brand: 'Mahindra', model: 'XUV700', base: 2000000, demand: 'normal' },
  { brand: 'Mahindra', model: 'Bolero', base: 1000000, demand: 'normal' },
  { brand: 'Toyota', model: 'Innova', base: 2000000, demand: 'high' },
  { brand: 'Toyota', model: 'Fortuner', base: 3800000, demand: 'normal' },
  { brand: 'Honda', model: 'City', base: 1300000, demand: 'normal' },
  { brand: 'Honda', model: 'Amaze', base: 800000, demand: 'normal' },
  { brand: 'Kia', model: 'Seltos', base: 1450000, demand: 'normal' },
  { brand: 'Kia', model: 'Sonet', base: 1000000, demand: 'normal' },
  { brand: 'Renault', model: 'Kwid', base: 500000, demand: 'low' },
  { brand: 'Volkswagen', model: 'Polo', base: 750000, demand: 'low' },
];

function find(brand, model) {
  return models.find((m) => m.brand === brand && m.model === model);
}

module.exports = { models, find };
