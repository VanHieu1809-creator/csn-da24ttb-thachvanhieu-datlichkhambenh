import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const app = express();
const port = Number(process.env.PORT || 3001);
const jwtSecret = process.env.JWT_SECRET || 'replace-this-secret-in-production';
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'phong_kham',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

const mailUser = process.env.GMAIL_USER || process.env.SMTP_USER;
const mailPassword = (process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASSWORD || '').replace(/\s/g, '');
const mailer = mailUser && mailPassword
  ? nodemailer.createTransport(process.env.GMAIL_USER ? {
      service: 'gmail',
      auth: { user: mailUser, pass: mailPassword },
    } : {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: mailUser, pass: mailPassword },
    })
  : null;

app.use(cors());
app.use(express.json());

function sendError(res, status, message) {
  return res.status(status).json({ message });
}

function auth(requiredRoles = []) {
  return (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return sendError(res, 401, 'Vui lòng đăng nhập để tiếp tục.');
    try {
      const user = jwt.verify(token, jwtSecret);
      if (requiredRoles.length && !requiredRoles.includes(user.role)) {
        return sendError(res, 403, 'Bạn không có quyền thực hiện thao tác này.');
      }
      req.user = user;
      return next();
    } catch {
      return sendError(res, 401, 'Phiên đăng nhập đã hết hạn.');
    }
  };
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sendConfirmation(appointment) {
  if (!mailer) return false;
  await mailer.sendMail({
    from: process.env.GMAIL_USER || process.env.SMTP_FROM || mailUser,
    to: appointment.patient_email,
    subject: `Xác nhận lịch khám #${appointment.id} - Phòng khám Hiếu Tâm`,
    text: `Xin chào ${appointment.patient_name},\n\nLịch khám của bạn đã được ghi nhận.\nBác sĩ: ${appointment.doctor_name}\nChuyên khoa: ${appointment.specialty_name}\nThời gian: ${appointment.appointment_date} ${appointment.appointment_time}\nTrạng thái: Chờ xác nhận\n\nVui lòng giữ email này để đối chiếu khi đến phòng khám.`,
  });
  return true;
}

app.get('/api/email-status', (_req, res) => {
  return res.json({ configured: Boolean(mailer), provider: process.env.GMAIL_USER ? 'gmail' : 'smtp' });
});

app.get('/api/catalog', async (_req, res) => {
  try {
    const [specialties] = await pool.query('SELECT id, name, description FROM specialties WHERE active = 1 ORDER BY name');
    const [doctors] = await pool.query(`SELECT d.id, d.full_name, d.title, d.bio, d.specialty_id, s.name specialty_name
      FROM doctors d JOIN specialties s ON s.id = d.specialty_id WHERE d.active = 1 ORDER BY d.full_name`);
    const [schedules] = await pool.query(`SELECT id, doctor_id, work_date, start_time, end_time, slot_minutes
      FROM schedules WHERE active = 1 AND work_date >= CURRENT_DATE ORDER BY work_date, start_time`);
    return res.json({ specialties, doctors, schedules });
  } catch (error) {
    console.error('catalog failed', error);
    return sendError(res, 500, 'Không thể tải dữ liệu phòng khám.');
  }
});

app.post('/api/appointments', async (req, res) => {
  const { doctorId, specialtyId, appointmentDate, appointmentTime, patientName, patientPhone, patientEmail, patientBirthInfo, reason } = req.body;
  if (!doctorId || !specialtyId || !appointmentDate || !appointmentTime || !patientName || !patientPhone || !patientEmail || !patientBirthInfo || !reason) {
    return sendError(res, 400, 'Vui lòng điền đầy đủ thông tin đặt lịch.');
  }
  if (!validEmail(patientEmail)) return sendError(res, 400, 'Email bệnh nhân chưa đúng định dạng.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [slotRows] = await connection.execute(`SELECT s.id FROM schedules s
      WHERE s.doctor_id = ? AND s.work_date = ? AND ? >= s.start_time AND ? < s.end_time AND s.active = 1 FOR UPDATE`,
      [doctorId, appointmentDate, appointmentTime, appointmentTime]);
    if (!slotRows.length) {
      await connection.rollback();
      return sendError(res, 409, 'Khung giờ này không nằm trong lịch làm việc của bác sĩ.');
    }
    const [existing] = await connection.execute(`SELECT id FROM appointments
      WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? AND status IN ('pending', 'confirmed') FOR UPDATE`,
      [doctorId, appointmentDate, appointmentTime]);
    if (existing.length) {
      await connection.rollback();
      return sendError(res, 409, 'Khung giờ này vừa được người khác đặt. Vui lòng chọn khung giờ khác.');
    }
    const [result] = await connection.execute(`INSERT INTO appointments
      (doctor_id, specialty_id, appointment_date, appointment_time, patient_name, patient_phone, patient_email, patient_birth_info, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [doctorId, specialtyId, appointmentDate, appointmentTime, patientName.trim(), patientPhone.trim(), patientEmail.trim(), patientBirthInfo.trim(), reason.trim()]);
    await connection.commit();
    const [rows] = await pool.execute(`SELECT a.*, d.full_name doctor_name, s.name specialty_name FROM appointments a
      JOIN doctors d ON d.id = a.doctor_id JOIN specialties s ON s.id = a.specialty_id WHERE a.id = ?`, [result.insertId]);
    let emailSent = false;
    try { emailSent = await sendConfirmation(rows[0]); } catch (error) { console.error('confirmation email failed', error); }
    return res.status(201).json({ appointment: rows[0], emailSent });
  } catch (error) {
    await connection.rollback();
    console.error('appointment create failed', error);
    return sendError(res, 500, 'Không thể tạo lịch hẹn lúc này.');
  } finally { connection.release(); }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return sendError(res, 400, 'Vui lòng nhập email và mật khẩu.');
  try {
    const [rows] = await pool.execute('SELECT id, full_name, email, password_hash, role, doctor_id FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return sendError(res, 401, 'Email hoặc mật khẩu không đúng.');
    const profile = { id: user.id, fullName: user.full_name, email: user.email, role: user.role, doctorId: user.doctor_id };
    return res.json({ token: jwt.sign(profile, jwtSecret, { expiresIn: '8h' }), user: profile });
  } catch (error) {
    console.error('login failed', error);
    return sendError(res, 500, 'Không thể đăng nhập lúc này.');
  }
});

app.get('/api/appointments', auth(['admin', 'doctor']), async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const filter = req.user.role === 'doctor' ? 'AND a.doctor_id = ?' : '';
    const values = req.user.role === 'doctor' ? [date, req.user.doctorId] : [date];
    const [rows] = await pool.execute(`SELECT a.*, d.full_name doctor_name, s.name specialty_name FROM appointments a
      JOIN doctors d ON d.id = a.doctor_id JOIN specialties s ON s.id = a.specialty_id
      WHERE a.appointment_date = ? ${filter} ORDER BY a.appointment_time`, values);
    return res.json({ appointments: rows });
  } catch (error) {
    console.error('appointments list failed', error);
    return sendError(res, 500, 'Không thể tải danh sách lịch hẹn.');
  }
});

app.patch('/api/appointments/:id/status', auth(['admin', 'doctor']), async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) return sendError(res, 400, 'Trạng thái không hợp lệ.');
  try {
    const scope = req.user.role === 'doctor' ? 'AND doctor_id = ?' : '';
    const values = req.user.role === 'doctor' ? [status, req.params.id, req.user.doctorId] : [status, req.params.id];
    const [result] = await pool.execute(`UPDATE appointments SET status = ? WHERE id = ? ${scope}`, values);
    if (!result.affectedRows) return sendError(res, 404, 'Không tìm thấy lịch hẹn.');
    return res.json({ ok: true });
  } catch (error) {
    console.error('appointment status failed', error);
    return sendError(res, 500, 'Không thể cập nhật trạng thái lịch hẹn.');
  }
});

app.get('/api/admin/doctors', auth(['admin']), async (_req, res) => {
  try {
    const [rows] = await pool.query(`SELECT d.*, s.name specialty_name FROM doctors d JOIN specialties s ON s.id = d.specialty_id ORDER BY d.full_name`);
    return res.json({ doctors: rows });
  } catch (error) { console.error(error); return sendError(res, 500, 'Không thể tải danh sách bác sĩ.'); }
});

app.post('/api/admin/doctors', auth(['admin']), async (req, res) => {
  const { fullName, title, specialtyId, bio, email, password } = req.body;
  if (!fullName || !title || !specialtyId || !email || !password) return sendError(res, 400, 'Vui lòng nhập đủ thông tin bác sĩ và tài khoản đăng nhập.');
  if (!validEmail(email) || password.length < 8) return sendError(res, 400, 'Email không hợp lệ hoặc mật khẩu chưa đủ 8 ký tự.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute('INSERT INTO doctors (full_name, title, specialty_id, bio) VALUES (?, ?, ?, ?)', [fullName.trim(), title.trim(), specialtyId, bio?.trim() || '']);
    const passwordHash = await bcrypt.hash(password, 10);
    await connection.execute('INSERT INTO users (full_name, email, password_hash, role, doctor_id) VALUES (?, ?, ?, \'doctor\', ?)', [fullName.trim(), email.trim().toLowerCase(), passwordHash, result.insertId]);
    await connection.commit();
    return res.status(201).json({ id: result.insertId });
  } catch (error) {
    await connection.rollback();
    console.error('doctor creation failed', error);
    return sendError(res, 500, 'Không thể tạo bác sĩ và tài khoản đăng nhập.');
  } finally { connection.release(); }
});

app.post('/api/admin/specialties', auth(['admin']), async (req, res) => {
  const { name, description } = req.body;
  if (!name) return sendError(res, 400, 'Vui lòng nhập tên chuyên khoa.');
  try { const [result] = await pool.execute('INSERT INTO specialties (name, description) VALUES (?, ?)', [name.trim(), description?.trim() || '']); return res.status(201).json({ id: result.insertId }); }
  catch (error) { console.error(error); return sendError(res, 500, 'Không thể thêm chuyên khoa.'); }
});

app.post('/api/admin/schedules', auth(['admin']), async (req, res) => {
  const { doctorId, workDate, startTime, endTime, slotMinutes } = req.body;
  if (!doctorId || !workDate || !startTime || !endTime) return sendError(res, 400, 'Vui lòng điền đủ ca trực.');
  try { const [result] = await pool.execute('INSERT INTO schedules (doctor_id, work_date, start_time, end_time, slot_minutes) VALUES (?, ?, ?, ?, ?)', [doctorId, workDate, startTime, endTime, slotMinutes || 30]); return res.status(201).json({ id: result.insertId }); }
  catch (error) { console.error(error); return sendError(res, 500, 'Không thể thêm ca trực.'); }
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.use((_req, res) => res.sendFile(path.join(distPath, 'index.html')));

app.listen(port, () => {
  console.log(`Clinic server listening on port ${port}`);
  if (mailer) {
    mailer.verify().then(() => console.log('Gmail SMTP connection verified')).catch((error) => console.error('Gmail SMTP connection failed', error.message));
  } else {
    console.warn('Gmail is not configured; appointment emails are disabled');
  }
});