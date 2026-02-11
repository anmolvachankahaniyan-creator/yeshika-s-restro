const QRCode = require('qrcode');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SECRET = process.env.SECRET_KEY;
const SERVER = process.env.SERVER_URL;
const TABLES = parseInt(process.env.TOTAL_TABLES) || 10;

function signTable(tableNum) {
    const payload = { t: tableNum, r: process.env.RESTAURANT_NAME };
    const sig = crypto.createHmac('sha256', SECRET)
        .update(JSON.stringify(payload))
        .digest('hex').substring(0, 16);
    return Buffer.from(JSON.stringify({ p: payload, s: sig }))
        .toString('base64url');
}

async function generate() {
    const dir = path.join(__dirname, 'qr-codes');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    console.log('\n🔧 Generating QR Codes for your restaurant...\n');

    let printHTML = `<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>Print QR Codes - ${process.env.RESTAURANT_NAME}</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,sans-serif;background:#f5f5f5}
        h1{text-align:center;padding:20px;color:#333}
        .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:20px;padding:20px;max-width:800px;margin:0 auto}
        .card{background:white;border:3px solid #222;border-radius:20px;padding:25px;text-align:center;page-break-inside:avoid}
        .card .name{font-size:18px;font-weight:bold;color:#e74c3c}
        .card .table{font-size:48px;font-weight:900;color:#333;margin:10px 0}
        .card .label{font-size:12px;color:#999;text-transform:uppercase;letter-spacing:2px}
        .card img{width:180px;height:180px;margin:15px 0}
        .card .hint{font-size:11px;color:#aaa;line-height:1.4}
        @media print{body{background:white}.card{box-shadow:none}}
    </style></head><body>
    <h1>🍽️ ${process.env.RESTAURANT_NAME} - QR Codes</h1>
    <div class="grid">`;

    for (let t = 1; t <= TABLES; t++) {
        const token = signTable(t);
        const url = `${SERVER}/scan/${token}`;

        await QRCode.toFile(path.join(dir, `table-${t}.png`), url, {
            width: 500, margin: 3, errorCorrectionLevel: 'H'
        });

        const dataURL = await QRCode.toDataURL(url, {
            width: 400, margin: 2, errorCorrectionLevel: 'H'
        });

        printHTML += `
        <div class="card">
            <div class="name">${process.env.RESTAURANT_NAME}</div>
            <div class="label">TABLE NUMBER</div>
            <div class="table">${t}</div>
            <img src="${dataURL}" alt="Table ${t}">
            <div class="hint">📱 Scan to order via WhatsApp</div>
        </div>`;

        console.log(`  ✅ Table ${t} QR code created!`);
    }

    printHTML += `</div></body></html>`;
    fs.writeFileSync(path.join(dir, 'print-all.html'), printHTML);

    console.log(`\n✅ All done! ${TABLES} QR codes are in the "qr-codes" folder`);
    console.log(`📄 Open "qr-codes/print-all.html" to print all QR codes\n`);
}

generate().catch(console.error);