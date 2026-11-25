const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
require('dotenv').config();

const apiRoutes = require('./routes/api');
const { checkDatabaseConnection, pool } = require('./config/db');
const { expirePendingHoldsFromPool } = require('./services/appointmentHoldService');
const { processPendingEmails } = require('./services/appointmentEmailOutbox');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
let processingEmailOutbox = false;

function getLanUrls(port) {
    const interfaces = os.networkInterfaces();
    const urls = [];
    for (const iface of Object.values(interfaces)) {
        for (const config of iface || []) {
            if (config.family === 'IPv4' && !config.internal) {
                urls.push(`http://${config.address}:${port}`);
            }
        }
    }
    return urls;
}

function isLocalNetworkOrigin(origin) {
    try {
        const { protocol, hostname } = new URL(origin);
        if (protocol !== 'http:' && protocol !== 'https:') return false;
        return (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
            /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
            /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
        );
    } catch {
        return false;
    }
}

async function dispatchPendingEmails() {
    if (processingEmailOutbox) return;
    processingEmailOutbox = true;
    try {
        await processPendingEmails(pool);
    } catch (error) {
        console.error('Không thể xử lý hàng đợi email đặt lịch:', error.message);
    } finally {
        processingEmailOutbox = false;
    }
}

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

app.use(cors((req, callback) => {
    const origin = req.header('Origin');
    const host = req.header('Host');
    const isSameHost = host && (origin === `http://${host}` || origin === `https://${host}`);

    if (!origin || allowedOrigins.includes(origin) || isSameHost || isLocalNetworkOrigin(origin)) {
        return callback(null, { origin: true, credentials: true });
    }
    return callback(new Error('Origin không được phép bởi CORS.'));
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Nạp các file giao diện tĩnh từ thư mục frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Khai báo các tuyến đường API
app.use('/api', apiRoutes);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.use((err, req, res, next) => {
    console.error('[Lỗi Server]:', err);
    res.status(500).json({ success: false, message: 'Đã xảy ra lỗi không xác định trên máy chủ.' });
});

app.listen(PORT, '0.0.0.0', async () => {
    console.log('============================================================');
    console.log(`🏥 PHÒNG KHÁM ĐA KHOA HIẾU TÂM`);
    console.log(`💻 Mở trên máy tính: http://localhost:${PORT}`);
    const lanUrls = getLanUrls(PORT);
    if (lanUrls.length > 0) {
        lanUrls.forEach(url => console.log(`📱 Mở trên điện thoại (cùng Wi-Fi): ${url}`));
    }
    const dbCheck = await checkDatabaseConnection();
    if (dbCheck.connected) {
        console.log('✅ Kết nối CSDL MySQL: THÀNH CÔNG');
        try {
            await expirePendingHoldsFromPool(pool);
        } catch (error) {
            console.error('Không thể dọn yêu cầu đặt lịch hết hạn:', error.message);
        }
    } else {
        console.log('❌ Kết nối CSDL MySQL: THẤT BẠI (' + dbCheck.error + ')');
    }
    const expiryTimer = setInterval(async () => {
        try {
            await expirePendingHoldsFromPool(pool);
        } catch (error) {
            console.error('Không thể cập nhật yêu cầu đặt lịch hết hạn:', error.message);
        }
    }, 60 * 1000);
    expiryTimer.unref();
    void dispatchPendingEmails();
    const emailTimer = setInterval(dispatchPendingEmails, 10 * 1000);
    emailTimer.unref();
    console.log('============================================================');
});