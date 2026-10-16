const path = require('node:path');
const { open } = require('./db');
const { createApp } = require('./app');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const db = open(path.join(dataDir, 'cars.db'));
const app = createApp(db, {
  uploadsDir: path.join(dataDir, 'uploads'),
  // Shows the OTP on screen until an SMS provider (MSG91 / Gupshup) is connected.
  devOtp: process.env.NODE_ENV !== 'production',
});
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Car app running at http://localhost:${port}`));
