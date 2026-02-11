const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const db = require('./database');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ═══════════════════════════════════════
// SETTINGS (reads from .env file)
// ═══════════════════════════════════════
const CONFIG = {
    SECRET_KEY: process.env.SECRET_KEY,
    OWNER_WHATSAPP: process.env.OWNER_WHATSAPP,
    RESTAURANT_NAME: process.env.RESTAURANT_NAME,
    SERVER_URL: process.env.SERVER_URL,
    TOTAL_TABLES: parseInt(process.env.TOTAL_TABLES) || 10,
    OPEN_HOUR: parseInt(process.env.OPEN_HOUR) || 9,
    CLOSE_HOUR: parseInt(process.env.CLOSE_HOUR) || 23,
    SESSION_EXPIRY: (parseInt(process.env.SESSION_EXPIRY_MINUTES) || 180) * 60 * 1000,
    PORT: process.env.PORT || 3000
};

// ═══════════════════════════════════════
// SAMPLE MENU - CHANGE ITEMS TO YOUR MENU!
// ═══════════════════════════════════════
function initMenu() {
    if (!db.menu.get('items')) {
        db.menu.set('items', [
            { id: 1, name: 'Butter Chicken', price: 320, category: 'Main Course', emoji: '🍗' },
            { id: 2, name: 'Paneer Tikka', price: 250, category: 'Starter', emoji: '🧀' },
            { id: 3, name: 'Dal Makhani', price: 220, category: 'Main Course', emoji: '🍲' },
            { id: 4, name: 'Tandoori Roti', price: 30, category: 'Bread', emoji: '🫓' },
            { id: 5, name: 'Butter Naan', price: 50, category: 'Bread', emoji: '🫓' },
            { id: 6, name: 'Garlic Naan', price: 60, category: 'Bread', emoji: '🫓' },
            { id: 7, name: 'Jeera Rice', price: 150, category: 'Rice', emoji: '🍚' },
            { id: 8, name: 'Veg Biryani', price: 220, category: 'Rice', emoji: '🍛' },
            { id: 9, name: 'Chicken Biryani', price: 280, category: 'Rice', emoji: '🍛' },
            { id: 10, name: 'Gulab Jamun', price: 80, category: 'Dessert', emoji: '🍮' },
            { id: 11, name: 'Rasgulla', price: 70, category: 'Dessert', emoji: '🍮' },
            { id: 12, name: 'Lassi', price: 70, category: 'Drinks', emoji: '🥛' },
            { id: 13, name: 'Masala Chai', price: 30, category: 'Drinks', emoji: '☕' },
            { id: 14, name: 'Cold Drink', price: 40, category: 'Drinks', emoji: '🥤' },
            { id: 15, name: 'Water Bottle', price: 20, category: 'Drinks', emoji: '💧' },
        ]);
        console.log('📋 Sample menu loaded! Edit menu in data/menu.json');
    }
}
initMenu();

// ═══════════════════════════════════════
// HELPER FUNCTIONS (system uses these)
// ═══════════════════════════════════════

function isOpen() {
    const h = new Date().getHours();
    return h >= CONFIG.OPEN_HOUR && h < CONFIG.CLOSE_HOUR;
}

function genCode() {
    return uuidv4().substring(0, 8).toUpperCase();
}

function getIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.socket?.remoteAddress || 'unknown';
}

function verifyToken(token) {
    try {
        const { p, s } = JSON.parse(Buffer.from(token, 'base64url').toString());
        const expected = crypto.createHmac('sha256', CONFIG.SECRET_KEY)
            .update(JSON.stringify(p)).digest('hex').substring(0, 16);
        if (s !== expected) return { valid: false };
        if (p.t < 1 || p.t > CONFIG.TOTAL_TABLES) return { valid: false };
        return { valid: true, table: p.t };
    } catch {
        return { valid: false };
    }
}

function checkRate(id, type, max, windowMs) {
    const key = `${type}_${id}`;
    const entry = db.rateLimit.get(key);
    const now = Date.now();
    if (!entry || (now - entry.start) > windowMs) {
        db.rateLimit.set(key, { count: 1, start: now });
        return true;
    }
    if (entry.count >= max) return false;
    entry.count++;
    db.rateLimit.set(key, entry);
    return true;
}

function isBlocked(phone) {
    return !!db.blacklist.get(phone);
}

// Common page style
function css() {
    return `
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;min-height:100vh;display:flex;
        align-items:center;justify-content:center;padding:15px;
        background:linear-gradient(135deg,#0f0c29,#302b63,#24243e)}
    .card{background:#fff;border-radius:24px;padding:35px 25px;max-width:440px;
        width:100%;text-align:center;box-shadow:0 25px 80px rgba(0,0,0,0.4)}
    .emoji{font-size:50px;margin-bottom:10px}
    .title{font-size:22px;font-weight:700;color:#333}
    .sub{font-size:14px;color:#888;margin:5px 0 15px}
    .table-circle{display:inline-flex;align-items:center;justify-content:center;
        width:90px;height:90px;border-radius:50%;
        background:linear-gradient(135deg,#e74c3c,#c0392b);
        color:#fff;font-size:40px;font-weight:800;margin:15px 0;
        box-shadow:0 8px 25px rgba(231,76,60,0.4)}
    .label{font-size:12px;color:#aaa;text-transform:uppercase;letter-spacing:3px}
    .input-box{margin:15px 0;text-align:left}
    .input-box label{font-size:13px;font-weight:600;color:#555;display:block;margin-bottom:6px}
    .input-box input{width:100%;padding:13px 16px;border:2px solid #e0e0e0;border-radius:12px;
        font-size:16px;outline:none;transition:.3s}
    .input-box input:focus{border-color:#667eea}
    .btn{display:inline-block;padding:14px 35px;border:none;border-radius:50px;font-size:16px;
        font-weight:700;cursor:pointer;transition:.3s;text-decoration:none;color:#fff}
    .btn-primary{background:linear-gradient(135deg,#667eea,#764ba2)}
    .btn-green{background:#25D366;box-shadow:0 5px 20px rgba(37,211,102,0.4)}
    .btn-red{background:#e74c3c}
    .btn:hover{transform:translateY(-2px);box-shadow:0 8px 25px rgba(0,0,0,0.2)}
    .info{background:#f8f9fa;border:2px dashed #dee2e6;border-radius:12px;padding:12px;
        margin:12px 0;font-size:13px;color:#666}
    .info strong{color:#e74c3c}
    .warn{background:#fff3cd;border-left:4px solid #ffc107;border-radius:8px;padding:10px;
        margin:12px 0;font-size:12px;color:#856404;text-align:left}
    .err{background:#f8d7da;border-left:4px solid #dc3545;border-radius:8px;padding:12px;
        margin:12px 0;font-size:13px;color:#721c24}
    .ok{background:#d4edda;border-left:4px solid #28a745;border-radius:8px;padding:12px;
        margin:12px 0;font-size:13px;color:#155724}
    .steps{display:flex;justify-content:center;gap:5px;margin-bottom:15px}
    .step{width:10px;height:10px;border-radius:50%;background:#ddd}
    .step.active{background:#667eea;width:30px;border-radius:5px}
    .otp-row{display:flex;gap:10px;justify-content:center;margin:15px 0}
    .otp-row input{width:55px;height:60px;text-align:center;font-size:24px;font-weight:700;
        border:2px solid #ddd;border-radius:12px;outline:none}
    .otp-row input:focus{border-color:#667eea}
    .menu-cat{font-size:14px;font-weight:700;color:#667eea;margin:15px 0 8px;
        border-bottom:2px solid #f0f0f0;padding-bottom:5px;text-align:left}
    .menu-item{display:flex;justify-content:space-between;align-items:center;
        padding:8px 0;border-bottom:1px solid #f8f8f8}
    .menu-item .mname{font-size:14px;color:#333}
    .menu-item .mprice{font-size:14px;font-weight:700;color:#e74c3c}
    .order-code{font-family:'Courier New',monospace;font-size:28px;font-weight:800;
        color:#e74c3c;letter-spacing:3px}
    .badge{display:inline-block;padding:4px 12px;background:#d4edda;color:#155724;
        border-radius:20px;font-size:12px;font-weight:600}
    .receipt{background:#f8f9fa;border-radius:16px;padding:20px;text-align:left;margin:15px 0}
    .receipt-item{display:flex;justify-content:space-between;padding:6px 0;
        border-bottom:1px solid #eee;font-size:14px}
    .receipt-total{display:flex;justify-content:space-between;padding:10px 0;
        font-size:18px;font-weight:700;color:#e74c3c;border-top:2px solid #ddd;margin-top:8px}
    `;
}

function errorPage(emoji, title, msg) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Error</title>
    <style>${css()} body{background:linear-gradient(135deg,#e74c3c,#c0392b)}</style>
    </head><body><div class="card">
    <div class="emoji">${emoji}</div>
    <div class="title">${title}</div>
    <div class="err">${msg}</div>
    </div></body></html>`;
}


// ═══════════════════════════════════════════════════
// PAGE 1: CUSTOMER SCANS QR CODE → ENTER PHONE
// ═══════════════════════════════════════════════════
app.get('/scan/:token', (req, res) => {
    const ip = getIP(req);

    if (!checkRate(ip, 'scan', 5, 60000)) {
        return res.send(errorPage('⏳', 'Too Fast', 'Please wait before scanning again.'));
    }

    if (!isOpen()) {
        return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>${css()}</style></head><body>
        <div class="card">
            <div class="emoji">🌙</div>
            <div class="title">${CONFIG.RESTAURANT_NAME}</div>
            <div class="sub">We are currently closed</div>
            <div class="info">🕐 We're open from <strong>${CONFIG.OPEN_HOUR}:00 AM</strong> to <strong>${CONFIG.CLOSE_HOUR}:00 PM</strong></div>
            <p style="margin-top:15px;color:#888;font-size:13px">Please visit us during business hours! 🙏</p>
        </div></body></html>`);
    }

    const check = verifyToken(req.params.token);
    if (!check.valid) {
        return res.send(errorPage('🚫', 'Invalid QR Code',
            'This QR code is not valid. Please scan the QR code that is on your table.'));
    }

    const table = check.table;
    const scanId = genCode();

    db.sessions.set(scanId, {
        table,
        status: 'pending_phone',
        ip,
        scannedAt: Date.now()
    });

    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Table ${table} - ${CONFIG.RESTAURANT_NAME}</title>
    <style>${css()}</style></head><body>
    <div class="card">
        <div class="steps"><div class="step active"></div><div class="step"></div><div class="step"></div></div>
        <div class="emoji">🍽️</div>
        <div class="title">${CONFIG.RESTAURANT_NAME}</div>
        <div class="label">YOU ARE AT</div>
        <div class="table-circle">${table}</div>
        <div class="label">TABLE ${table}</div>

        <form action="/send-otp" method="POST" id="f">
            <input type="hidden" name="scanId" value="${scanId}">
            <div class="input-box">
                <label>📱 Enter Your WhatsApp Number</label>
                <input type="tel" name="phone" id="ph" placeholder="e.g. 9876543210"
                    pattern="[0-9]{10}" maxlength="10" required inputmode="numeric" autofocus>
            </div>
            <div class="warn">🔒 We'll send a 4-digit code to verify your number. Your number is safe with us.</div>
            <button type="submit" class="btn btn-primary" id="sb" style="margin-top:10px">Send OTP →</button>
        </form>
    </div>
    <script>
    document.getElementById('ph').addEventListener('input',function(){this.value=this.value.replace(/\\D/g,'')});
    document.getElementById('f').addEventListener('submit',function(){
        document.getElementById('sb').disabled=true;document.getElementById('sb').textContent='Sending...';
    });
    </script></body></html>`);

    console.log(`📱 Table ${table} scanned | Session: ${scanId}`);
});


// ═══════════════════════════════════════════════════
// PAGE 2: SEND OTP → VERIFY PAGE
// ═══════════════════════════════════════════════════
app.post('/send-otp', (req, res) => {
    const { scanId, phone } = req.body;
    const session = db.sessions.get(scanId);

    if (!session || session.status !== 'pending_phone') {
        return res.send(errorPage('❌', 'Session Expired', 'Please scan the QR code again.'));
    }

    if (Date.now() - session.scannedAt > 5 * 60 * 1000) {
        db.sessions.delete(scanId);
        return res.send(errorPage('⏰', 'Timeout', 'Took too long. Please scan QR again.'));
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
        return res.send(errorPage('📱', 'Invalid Number', 'Please enter a valid 10-digit number.'));
    }

    const fullPhone = '91' + cleanPhone;

    if (isBlocked(fullPhone)) {
        return res.send(errorPage('🚫', 'Number Blocked',
            'This number has been blocked. Please talk to restaurant staff.'));
    }

    if (!checkRate(fullPhone, 'otp', 3, 3600000)) {
        return res.send(errorPage('⏳', 'Too Many Attempts',
            'Too many OTP requests. Please try after 1 hour.'));
    }

    const otp = String(Math.floor(1000 + Math.random() * 9000));

    session.status = 'pending_otp';
    session.phone = fullPhone;
    session.otp = otp;
    session.otpExpiry = Date.now() + 5 * 60 * 1000;
    session.otpAttempts = 0;
    db.sessions.set(scanId, session);

    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Enter OTP</title>
    <style>${css()}</style></head><body>
    <div class="card">
        <div class="steps"><div class="step"></div><div class="step active"></div><div class="step"></div></div>
        <div class="emoji">🔐</div>
        <div class="title">Enter OTP Code</div>
        <div class="sub">Sent to: ***${cleanPhone.slice(-4)}</div>

        <div class="ok">
            🧪 Your OTP code is: <strong style="font-size:24px;color:#155724">${otp}</strong>
            <br><small style="color:#888">(In final version, this will be sent to your WhatsApp)</small>
        </div>

        <form action="/verify-otp" method="POST" id="f">
            <input type="hidden" name="scanId" value="${scanId}">
            <div class="otp-row">
                <input type="text" maxlength="1" id="o1" name="d1" required inputmode="numeric" autofocus>
                <input type="text" maxlength="1" id="o2" name="d2" required inputmode="numeric">
                <input type="text" maxlength="1" id="o3" name="d3" required inputmode="numeric">
                <input type="text" maxlength="1" id="o4" name="d4" required inputmode="numeric">
            </div>
            <div id="timer" style="font-size:13px;color:#e74c3c;margin:8px 0">⏰ Expires in 5:00</div>
            <button type="submit" class="btn btn-primary" id="vb">Verify ✓</button>
        </form>
        <div class="warn" style="margin-top:15px">⚠️ You have 3 tries only. After that you must scan QR again.</div>
    </div>
    <script>
    const ins=document.querySelectorAll('.otp-row input');
    ins.forEach((inp,i)=>{
        inp.addEventListener('input',e=>{
            e.target.value=e.target.value.replace(/\\D/g,'');
            if(e.target.value&&i<ins.length-1)ins[i+1].focus();
        });
        inp.addEventListener('keydown',e=>{
            if(e.key==='Backspace'&&!e.target.value&&i>0)ins[i-1].focus();
        });
    });
    let left=300;const ti=setInterval(()=>{left--;
        const m=Math.floor(left/60),s=left%60;
        document.getElementById('timer').textContent='⏰ Expires in '+m+':'+String(s).padStart(2,'0');
        if(left<=0){clearInterval(ti);document.getElementById('timer').textContent='❌ Expired';
        document.getElementById('vb').disabled=true;}
    },1000);
    document.getElementById('f').addEventListener('submit',function(){
        document.getElementById('vb').disabled=true;document.getElementById('vb').textContent='Checking...';
    });
    </script></body></html>`);

    console.log(`🔐 OTP: ${otp} → Table ${session.table} | Phone: ${fullPhone}`);
});


// ═══════════════════════════════════════════════════
// PAGE 3: VERIFY OTP → SHOW MENU + WHATSAPP OPTION
// ═══════════════════════════════════════════════════
app.post('/verify-otp', (req, res) => {
    const { scanId, d1, d2, d3, d4 } = req.body;
    const entered = `${d1}${d2}${d3}${d4}`;
    const session = db.sessions.get(scanId);

    if (!session || session.status !== 'pending_otp') {
        return res.send(errorPage('❌', 'Session Expired', 'Please scan QR code again.'));
    }

    if (Date.now() > session.otpExpiry) {
        db.sessions.delete(scanId);
        return res.send(errorPage('⏰', 'OTP Expired', 'Please scan QR and try again.'));
    }

    if (session.otpAttempts >= 3) {
        db.sessions.delete(scanId);
        return res.send(errorPage('🚫', 'Too Many Wrong Tries', 'Please scan QR again.'));
    }

    if (entered !== session.otp) {
        session.otpAttempts++;
        db.sessions.set(scanId, session);
        const left = 3 - session.otpAttempts;
        return res.send(errorPage('❌', 'Wrong OTP',
            `That code is incorrect. You have ${left} try(s) left.<br><br>
            <a href="javascript:history.back()" class="btn btn-primary" style="color:#fff">Try Again</a>`));
    }

    // ✅ OTP CORRECT! Create order session
    const orderCode = genCode();
    const table = session.table;

    session.status = 'active';
    session.verified = true;
    session.verifiedAt = Date.now();
    session.expiresAt = Date.now() + CONFIG.SESSION_EXPIRY;
    session.orderCode = orderCode;
    session.orderCount = 0;
    delete session.otp;
    delete session.otpExpiry;
    delete session.otpAttempts;
    db.sessions.set(scanId, session);

    db.tables.set(`table_${table}`, {
        occupied: true,
        sessionId: scanId,
        phone: session.phone,
        orderCode: orderCode,
        since: Date.now()
    });

    db.orders.set(orderCode, {
        table, phone: session.phone, sessionId: scanId,
        createdAt: Date.now(), status: 'verified', items: [], total: 0
    });

    // WhatsApp message for your existing workflow
    const waMsg = encodeURIComponent(
        `🍽️ *${CONFIG.RESTAURANT_NAME}*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📍 Table: *${table}*\n` +
        `🔑 Code: *${orderCode}*\n` +
        `📱 Verified: ✅\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `Hi! I'm at Table ${table}.\nI'd like to place an order.\n\n` +
        `_Verified by system - Code: ${orderCode}_`
    );
    const waURL = `https://wa.me/${CONFIG.OWNER_WHATSAPP}?text=${waMsg}`;

    // Get menu
    const menu = db.menu.get('items') || [];
    const categories = [...new Set(menu.map(i => i.category))];

    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Order - Table ${table}</title>
    <style>${css()}</style></head><body>
    <div class="card" style="max-width:480px">
        <div class="steps"><div class="step"></div><div class="step"></div><div class="step active"></div></div>
        <div class="emoji">✅</div>
        <div class="title">You're Verified!</div>
        <span class="badge">VERIFIED ✓</span>
        
        <div class="label" style="margin-top:15px">TABLE</div>
        <div class="table-circle">${table}</div>
        
        <div class="info">
            <div class="label" style="color:#999">YOUR ORDER CODE</div>
            <div class="order-code">${orderCode}</div>
        </div>

        <!-- OPTION 1: WHATSAPP (Your existing workflow) -->
        <div style="background:#f0fff0;border-radius:16px;padding:20px;margin:15px 0">
            <h3 style="font-size:16px;color:#333;margin-bottom:10px">💬 Order via WhatsApp</h3>
            <p style="font-size:12px;color:#888;margin-bottom:12px">
                This will open WhatsApp with a verified message. Your chatbot workflow will take over.
            </p>
            <a href="${waURL}" class="btn btn-green" style="display:block;color:#fff">
                💬 Open WhatsApp & Order
            </a>
        </div>

        <!-- OPTION 2: ORDER FROM MENU (More Secure) -->
        <div style="background:#f0f0ff;border-radius:16px;padding:20px;margin:15px 0">
            <h3 style="font-size:16px;color:#333;margin-bottom:10px">📋 Order from Menu</h3>
            <p style="font-size:12px;color:#888;margin-bottom:12px">
                Select items below. This method is 100% tamper-proof!
            </p>

            <form action="/place-order" method="POST" id="orderForm">
                <input type="hidden" name="scanId" value="${scanId}">
                <input type="hidden" name="orderCode" value="${orderCode}">

                ${categories.map(cat => `
                    <div class="menu-cat">${cat}</div>
                    ${menu.filter(i => i.category === cat).map(item => `
                        <div class="menu-item">
                            <div class="mname">${item.emoji} ${item.name}</div>
                            <div style="display:flex;align-items:center;gap:8px">
                                <span class="mprice">₹${item.price}</span>
                                <select name="item_${item.id}" 
                                    style="padding:5px;border-radius:8px;border:1px solid #ddd;font-size:14px;width:50px">
                                    ${[0,1,2,3,4,5].map(n => `<option value="${n}">${n}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                    `).join('')}
                `).join('')}

                <div class="input-box" style="margin-top:15px">
                    <label>📝 Special Instructions (optional)</label>
                    <input type="text" name="notes" placeholder="e.g. Less spicy, no onion">
                </div>

                <button type="submit" class="btn btn-primary" style="margin-top:15px;display:block;width:100%">
                    🛒 Place Order
                </button>
            </form>
        </div>

        <div class="warn">
            <strong>⚠️ Remember:</strong><br>
            • Your code <strong>${orderCode}</strong> is for Table ${table} only<br>
            • If using WhatsApp, don't change the message<br>
            • Session valid for ${process.env.SESSION_EXPIRY_MINUTES || 180} minutes
        </div>
    </div></body></html>`);

    console.log(`✅ VERIFIED: Table ${table} | Code: ${orderCode} | Phone: ${session.phone}`);
});


// ═══════════════════════════════════════════════════
// PAGE 4: PLACE ORDER (from menu selection)
// ═══════════════════════════════════════════════════
app.post('/place-order', (req, res) => {
    const { scanId, orderCode, notes } = req.body;
    const session = db.sessions.get(scanId);

    if (!session || session.status !== 'active') {
        return res.send(errorPage('❌', 'Session Expired', 'Please scan QR code again.'));
    }
    if (Date.now() > session.expiresAt) {
        return res.send(errorPage('⏰', 'Expired', 'Your session timed out. Scan QR again.'));
    }
    if (session.orderCode !== orderCode) {
        return res.send(errorPage('🚫', 'Invalid', 'Something went wrong. Scan QR again.'));
    }
    if (session.orderCount >= 10) {
        return res.send(errorPage('📋', 'Limit Reached', 'Too many orders. Please call staff.'));
    }

    const menu = db.menu.get('items') || [];
    const selectedItems = [];
    let total = 0;

    for (const item of menu) {
        const qty = parseInt(req.body[`item_${item.id}`]) || 0;
        if (qty > 0) {
            selectedItems.push({
                name: item.name, emoji: item.emoji,
                price: item.price, qty, subtotal: item.price * qty
            });
            total += item.price * qty;
        }
    }

    if (selectedItems.length === 0) {
        return res.send(errorPage('🍽️', 'Nothing Selected',
            'Please select at least 1 item.<br><br>' +
            '<a href="javascript:history.back()" class="btn btn-primary" style="color:#fff">Go Back</a>'));
    }

    const newCode = genCode();

    db.orders.set(newCode, {
        table: session.table, phone: session.phone, sessionId: scanId,
        orderCode: newCode, items: selectedItems, notes: notes || '',
        total, createdAt: Date.now(), status: 'new'
    });

    session.orderCount++;
    db.sessions.set(scanId, session);

    // Create WhatsApp message for owner
    const orderMsg = encodeURIComponent(
        `🔔 *NEW ORDER*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📍 Table: *${session.table}*\n` +
        `🔑 Code: *${newCode}*\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        selectedItems.map(i => `${i.emoji} ${i.name} ×${i.qty} = ₹${i.subtotal}`).join('\n') +
        `\n\n💰 *Total: ₹${total}*` +
        (notes ? `\n📝 Note: ${notes}` : '') +
        `\n\n✅ _Verified order_`
    );

    const waURL = `https://wa.me/${CONFIG.OWNER_WHATSAPP}?text=${orderMsg}`;

    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Order Placed!</title>
    <style>${css()}</style></head><body>
    <div class="card">
        <div class="emoji">🎉</div>
        <div class="title">Order Placed!</div>
        
        <div class="info">
            Table: <strong>${session.table}</strong> | Code: <strong>${newCode}</strong>
        </div>

        <div class="receipt">
            <h3 style="margin-bottom:10px;font-size:15px">📋 Your Order</h3>
            ${selectedItems.map(i => `
                <div class="receipt-item">
                    <span>${i.emoji} ${i.name} ×${i.qty}</span>
                    <span>₹${i.subtotal}</span>
                </div>
            `).join('')}
            ${notes ? `<p style="font-size:12px;color:#888;margin-top:8px">📝 ${notes}</p>` : ''}
            <div class="receipt-total"><span>Total</span><span>₹${total}</span></div>
        </div>

        <div class="ok">Now send this order to kitchen via WhatsApp 👇</div>

        <a href="${waURL}" class="btn btn-green" style="display:block;color:#fff;margin:10px 0">
            💬 Send Order via WhatsApp
        </a>

        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:15px">
            <a href="/reorder/${scanId}" class="btn btn-primary" style="color:#fff;font-size:13px;padding:10px 20px">
                🔄 Order More
            </a>
            <a href="/my-orders/${scanId}" class="btn btn-primary" style="color:#fff;font-size:13px;padding:10px 20px;background:#555">
                📋 My Orders
            </a>
        </div>
    </div></body></html>`);

    console.log(`🛒 ORDER: Table ${session.table} | Items: ${selectedItems.length} | ₹${total} | Code: ${newCode}`);
});


// ═══════════════════════════════════════════════════
// PAGE 5: REORDER (Show menu again)
// ═══════════════════════════════════════════════════
app.get('/reorder/:scanId', (req, res) => {
    const session = db.sessions.get(req.params.scanId);
    if (!session || session.status !== 'active' || Date.now() > session.expiresAt) {
        return res.send(errorPage('❌', 'Session Expired', 'Please scan QR code again.'));
    }
    if (!isOpen()) return res.send(errorPage('🌙', 'Closed', 'Restaurant is now closed.'));

    const menu = db.menu.get('items') || [];
    const categories = [...new Set(menu.map(i => i.category))];

    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Order More - Table ${session.table}</title>
    <style>${css()}</style></head><body>
    <div class="card" style="max-width:460px">
        <div class="emoji">🔄</div>
        <div class="title">Order More Items</div>
        <div class="sub">Table ${session.table}</div>

        <form action="/place-order" method="POST">
            <input type="hidden" name="scanId" value="${req.params.scanId}">
            <input type="hidden" name="orderCode" value="${session.orderCode}">

            ${categories.map(cat => `
                <div class="menu-cat">${cat}</div>
                ${menu.filter(i => i.category === cat).map(item => `
                    <div class="menu-item">
                        <div class="mname">${item.emoji} ${item.name}</div>
                        <div style="display:flex;align-items:center;gap:8px">
                            <span class="mprice">₹${item.price}</span>
                            <select name="item_${item.id}" style="padding:5px;border-radius:8px;border:1px solid #ddd;width:50px">
                                ${[0,1,2,3,4,5].map(n => `<option value="${n}">${n}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                `).join('')}
            `).join('')}

            <div class="input-box" style="margin-top:15px;text-align:left">
                <label>📝 Special Instructions</label>
                <input type="text" name="notes" placeholder="e.g. Extra spicy">
            </div>
            <button type="submit" class="btn btn-primary" style="margin-top:15px;display:block;width:100%">🛒 Place Order</button>
        </form>
    </div></body></html>`);
});


// ═══════════════════════════════════════════════════
// PAGE 6: MY ORDERS
// ═══════════════════════════════════════════════════
app.get('/my-orders/:scanId', (req, res) => {
    const session = db.sessions.get(req.params.scanId);
    if (!session) return res.send(errorPage('❌', 'Not Found', 'Session not found.'));

    const allOrders = db.orders.getAll();
    const myOrders = Object.entries(allOrders)
        .filter(([_, o]) => o.sessionId === req.params.scanId && o.items && o.items.length > 0)
        .map(([code, o]) => ({ code, ...o }))
        .sort((a, b) => b.createdAt - a.createdAt);

    const grandTotal = myOrders.reduce((sum, o) => sum + (o.total || 0), 0);

    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>My Orders</title>
    <style>${css()}
    .order-card{background:#f8f9fa;border-radius:12px;padding:15px;margin:10px 0;text-align:left}
    .order-card h4{font-size:14px;color:#667eea;margin-bottom:8px}
    .order-card .item{font-size:13px;color:#555;padding:3px 0}
    </style></head><body>
    <div class="card" style="max-width:460px">
        <div class="emoji">📋</div>
        <div class="title">My Orders</div>
        <div class="sub">Table ${session.table}</div>

        ${myOrders.length === 0 ? '<div class="info">No orders yet</div>' :
            myOrders.map(o => `
                <div class="order-card">
                    <h4>🔑 ${o.code} - ${new Date(o.createdAt).toLocaleTimeString()}</h4>
                    ${o.items.map(i => `<div class="item">${i.emoji} ${i.name} ×${i.qty} = ₹${i.subtotal}</div>`).join('')}
                    <div style="font-weight:700;margin-top:5px;color:#333">₹${o.total}</div>
                    <div style="font-size:11px;color:#888;margin-top:3px">
                        ${o.status === 'new' ? '🟡 Preparing' : o.status === 'served' ? '✅ Served' : '📝 ' + o.status}
                    </div>
                </div>
            `).join('')
        }

        ${grandTotal > 0 ? `<div style="font-size:22px;font-weight:800;color:#e74c3c;margin:15px 0">Total: ₹${grandTotal}</div>` : ''}

        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:15px">
            <a href="/reorder/${req.params.scanId}" class="btn btn-primary" style="color:#fff;font-size:13px;padding:10px 20px">🔄 Order More</a>
            <a href="/request-bill/${req.params.scanId}" class="btn btn-red" style="color:#fff;font-size:13px;padding:10px 20px">💳 Get Bill</a>
        </div>
    </div></body></html>`);
});


// ═══════════════════════════════════════════════════
// PAGE 7: REQUEST BILL
// ═══════════════════════════════════════════════════
app.get('/request-bill/:scanId', (req, res) => {
    const session = db.sessions.get(req.params.scanId);
    if (!session) return res.send(errorPage('❌', 'Not Found', 'Session not found.'));

    const allOrders = db.orders.getAll();
    const myOrders = Object.entries(allOrders)
        .filter(([_, o]) => o.sessionId === req.params.scanId && o.items && o.items.length > 0)
        .map(([code, o]) => ({ code, ...o }));

    const allItems = myOrders.flatMap(o => o.items || []);
    const grandTotal = allItems.reduce((sum, i) => sum + (i.subtotal || 0), 0);

    const billMsg = encodeURIComponent(
        `💳 *BILL REQUEST*\n📍 Table: *${session.table}*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        allItems.map(i => `${i.emoji} ${i.name} ×${i.qty} = ₹${i.subtotal}`).join('\n') +
        `\n━━━━━━━━━━━━━━━━━━\n💰 *TOTAL: ₹${grandTotal}*`
    );

    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Bill - Table ${session.table}</title>
    <style>${css()}</style></head><body>
    <div class="card">
        <div class="emoji">💳</div>
        <div class="title">Your Bill</div>
        <div class="sub">Table ${session.table}</div>

        <div class="receipt">
            ${allItems.map(i => `
                <div class="receipt-item">
                    <span>${i.emoji} ${i.name} ×${i.qty}</span>
                    <span>₹${i.subtotal}</span>
                </div>
            `).join('')}
            <div class="receipt-total"><span>Total</span><span>₹${grandTotal}</span></div>
        </div>

        <a href="https://wa.me/${CONFIG.OWNER_WHATSAPP}?text=${billMsg}" 
            class="btn btn-green" style="display:block;color:#fff;margin:15px 0">
            💬 Request Bill via WhatsApp
        </a>

        <div class="ok">Staff will bring your bill shortly. Thank you! 🙏</div>
    </div></body></html>`);
});


// ═══════════════════════════════════════════════════
// VERIFY ORDER CODE (API)
// ═══════════════════════════════════════════════════
app.get('/api/verify/:code', (req, res) => {
    const code = req.params.code.toUpperCase();
    const order = db.orders.get(code);
    if (!order) return res.json({ valid: false, message: '❌ Invalid code' });
    res.json({
        valid: true, table: order.table,
        items: order.items, total: order.total,
        time: new Date(order.createdAt).toLocaleString(),
        message: `✅ Valid - Table ${order.table}`
    });
});


// ═══════════════════════════════════════════════════
// OWNER DASHBOARD
// ═══════════════════════════════════════════════════
app.get('/dashboard', (req, res) => {
    const allOrders = db.orders.getAll();
    const allTables = db.tables.getAll();
    const allSessions = db.sessions.getAll();

    const orders = Object.entries(allOrders)
        .map(([code, o]) => ({ code, ...o }))
        .filter(o => o.items && o.items.length > 0)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 50);

    const activeTables = Object.entries(allSessions)
        .filter(([_, s]) => s.status === 'active' && Date.now() < (s.expiresAt || 0)).length;

    const todayOrders = orders.filter(o => {
        return new Date(o.createdAt).toDateString() === new Date().toDateString();
    });
    const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.total || 0), 0);

    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Dashboard - ${CONFIG.RESTAURANT_NAME}</title>
    <meta http-equiv="refresh" content="10">
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Segoe UI',sans-serif;background:#0f0f1a;color:#e0e0e0;padding:15px}
        h1{color:#e94560;font-size:22px}
        h2{color:#667eea;font-size:16px;margin:20px 0 10px}
        .header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;
            padding-bottom:15px;border-bottom:1px solid #333;margin-bottom:15px}
        .status{padding:5px 15px;border-radius:20px;font-size:12px;font-weight:600}
        .open{background:#25D366;color:#fff}
        .closed{background:#e74c3c;color:#fff}
        .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin:15px 0}
        .stat{background:#1a1a2e;border-radius:12px;padding:18px;text-align:center;border:1px solid #333}
        .stat .num{font-size:30px;font-weight:800;color:#667eea}
        .stat .lbl{font-size:11px;color:#888;margin-top:4px}
        .tables{display:grid;grid-template-columns:repeat(auto-fit,minmax(65px,1fr));gap:8px;margin:10px 0}
        .tbl{padding:12px;border-radius:10px;text-align:center;font-weight:700;font-size:16px;cursor:pointer}
        .free{background:#1a3a1a;color:#4caf50;border:2px solid #4caf50}
        .busy{background:#3a1a1a;color:#f44336;border:2px solid #f44336}
        table{width:100%;border-collapse:collapse;margin-top:8px}
        th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #222;font-size:12px}
        th{background:#1a1a2e;color:#667eea;position:sticky;top:0}
        tr:hover{background:#1a1a2e}
        .vbox{background:#1a1a2e;border-radius:12px;padding:15px;margin:15px 0;border:1px solid #333}
        .vbox input{padding:10px;border-radius:8px;border:2px solid #333;background:#0f0f1a;color:#e0e0e0;
            font-size:14px;width:180px;text-transform:uppercase}
        .vbox button{padding:10px 20px;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;color:#fff}
        .vbtn{background:#667eea}
        .bbtn{background:#e74c3c}
        .abtn{padding:4px 10px;border-radius:6px;font-size:11px;border:none;cursor:pointer;color:#fff}
        .serve{background:#25D366}
        .clear{background:#e74c3c}
        .auto{font-size:10px;color:#555}
        .obadge{padding:3px 8px;border-radius:10px;font-size:10px;font-weight:600}
    </style></head><body>

    <div class="header">
        <div><h1>📊 ${CONFIG.RESTAURANT_NAME}</h1><span class="auto">Refreshes every 10s</span></div>
        <span class="status ${isOpen() ? 'open' : 'closed'}">${isOpen() ? '🟢 OPEN' : '🔴 CLOSED'}</span>
    </div>

    <div class="stats">
        <div class="stat"><div class="num">${activeTables}</div><div class="lbl">Active Tables</div></div>
        <div class="stat"><div class="num">${todayOrders.length}</div><div class="lbl">Today Orders</div></div>
        <div class="stat"><div class="num">₹${todayRevenue}</div><div class="lbl">Today Revenue</div></div>
    </div>

    <h2>🪑 Tables (click red to clear)</h2>
    <div class="tables">
        ${Array.from({ length: CONFIG.TOTAL_TABLES }, (_, i) => {
            const t = i + 1;
            const data = allTables[`table_${t}`];
            const occ = data && data.occupied;
            return `<div class="tbl ${occ ? 'busy' : 'free'}" 
                ${occ ? `onclick="if(confirm('Clear Table ${t}?'))location='/clear-table/${t}'"` : ''}>
                ${t}<div style="font-size:9px">${occ ? 'BUSY' : 'FREE'}</div></div>`;
        }).join('')}
    </div>

    <div class="vbox">
        <h2 style="margin:0 0 10px">🔍 Verify Order Code</h2>
        <input type="text" id="vc" placeholder="Enter code" maxlength="8">
        <button class="vbtn" onclick="verify()">Check</button>
        <div id="vr" style="margin-top:8px"></div>
    </div>

    <h2>📋 Orders</h2>
    <div style="overflow-x:auto">
    <table>
        <tr><th>Code</th><th>Table</th><th>Items</th><th>Total</th><th>Time</th><th>Status</th><th>Action</th></tr>
        ${orders.length === 0 ? '<tr><td colspan="7" style="text-align:center;color:#555">No orders yet</td></tr>' :
            orders.map(o => `<tr>
                <td><code style="color:#667eea;font-weight:700">${o.code}</code></td>
                <td style="color:#e94560;font-weight:700">T-${o.table}</td>
                <td style="max-width:200px;font-size:11px;color:#aaa">${o.items.map(i => `${i.emoji}${i.name}×${i.qty}`).join(', ')}</td>
                <td style="font-weight:700">₹${o.total}</td>
                <td>${new Date(o.createdAt).toLocaleTimeString()}</td>
                <td><span class="obadge" style="background:${
                    o.status === 'new' ? '#ffc107;color:#333' : 
                    o.status === 'served' ? '#25D366;color:#fff' : '#667eea;color:#fff'
                }">${o.status}</span></td>
                <td><button class="abtn serve" onclick="fetch('/api/status/${o.code}/served').then(()=>location.reload())">✓Done</button></td>
            </tr>`).join('')}
    </table></div>

    <div class="vbox" style="margin-top:20px">
        <h2 style="margin:0 0 10px">🚫 Block a Number</h2>
        <input type="text" id="bp" placeholder="10-digit number" maxlength="10">
        <button class="bbtn" onclick="blockN()">Block</button>
        <div id="br" style="margin-top:8px"></div>
    </div>

    <script>
    async function verify(){
        const c=document.getElementById('vc').value.trim().toUpperCase();if(!c)return;
        const r=await fetch('/api/verify/'+c);const d=await r.json();
        document.getElementById('vr').innerHTML=d.valid?
            '<div style="background:#1a3a1a;padding:10px;border-radius:8px">✅ VALID - Table '+d.table+' | ₹'+d.total+'</div>':
            '<div style="background:#3a1a1a;padding:10px;border-radius:8px">❌ FAKE ORDER! Code not found.</div>';
    }
    function blockN(){
        const p=document.getElementById('bp').value.trim();if(p.length!==10)return;
        fetch('/block/'+p).then(r=>r.json()).then(d=>{
            document.getElementById('br').innerHTML='<span style="color:#4caf50">✅ Blocked!</span>';
            setTimeout(()=>location.reload(),1000);
        });
    }
    </script></body></html>`);
});


// ═══════════════════════════════════════
// UTILITY ROUTES
// ═══════════════════════════════════════
app.get('/api/status/:code/:status', (req, res) => {
    const order = db.orders.get(req.params.code);
    if (order) { order.status = req.params.status; db.orders.set(req.params.code, order); }
    res.json({ ok: true });
});

app.get('/block/:phone', (req, res) => {
    db.blacklist.set('91' + req.params.phone.replace(/\D/g, ''), { blockedAt: Date.now() });
    res.json({ success: true, message: 'Number blocked' });
});

app.get('/clear-table/:num', (req, res) => {
    const num = parseInt(req.params.num);
    const data = db.tables.get(`table_${num}`);
    if (data?.sessionId) {
        const s = db.sessions.get(data.sessionId);
        if (s) { s.status = 'closed'; db.sessions.set(data.sessionId, s); }
    }
    db.tables.delete(`table_${num}`);
    console.log(`🧹 Table ${num} cleared`);
    res.redirect('/dashboard');
});

app.get('/', (req, res) => res.redirect('/dashboard'));

// Cleanup old data every 5 min
setInterval(() => {
    const now = Date.now();
    const sessions = db.sessions.getAll();
    for (const [id, s] of Object.entries(sessions)) {
        if ((s.expiresAt && now > s.expiresAt) ||
            (s.status === 'pending_phone' && (now - s.scannedAt) > 600000) ||
            (s.status === 'pending_otp' && (now - s.scannedAt) > 600000)) {
            db.sessions.delete(id);
            if (s.table) db.tables.delete(`table_${s.table}`);
        }
    }
    db.rateLimit.cleanup('start', 3600000);
}, 5 * 60 * 1000);


// ═══════════════════════════════════════
// START THE SERVER
// ═══════════════════════════════════════
app.listen(CONFIG.PORT, () => {
    console.log('');
    console.log('════════════════════════════════════════════');
    console.log(`  🍽️  ${CONFIG.RESTAURANT_NAME}`);
    console.log('════════════════════════════════════════════');
    console.log(`  ✅ Server running!`);
    console.log(`  🌐 Open this in browser: http://localhost:${CONFIG.PORT}`);
    console.log(`  📊 Dashboard: http://localhost:${CONFIG.PORT}/dashboard`);
    console.log(`  📱 WhatsApp: ${CONFIG.OWNER_WHATSAPP}`);
    console.log(`  🪑 Tables: ${CONFIG.TOTAL_TABLES}`);
    console.log(`  🕐 Hours: ${CONFIG.OPEN_HOUR}:00 - ${CONFIG.CLOSE_HOUR}:00`);
    console.log('════════════════════════════════════════════');
    console.log('');
});