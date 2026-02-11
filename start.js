// start.js - This runs when server starts on Render
const fs = require('fs');
const path = require('path');

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('📁 Data directory created');
}

// Create qr-codes directory
const qrDir = path.join(__dirname, 'qr-codes');
if (!fs.existsSync(qrDir)) {
    fs.mkdirSync(qrDir, { recursive: true });
    console.log('📁 QR codes directory created');
}

// Generate QR codes first, then start server
console.log('🔧 Generating QR codes...');
require('./generate-qr.js');

// Wait a moment for QR generation, then start server
setTimeout(() => {
    console.log('🚀 Starting server...');
    require('./server.js');
}, 3000);
