CREATE DATABASE IF NOT EXISTS phong_kham CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE phong_kham;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'doctor') NOT NULL,
  doctor_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS specialties (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description VARCHAR(500) NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS doctors (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  title VARCHAR(120) NOT NULL,
  specialty_id INT UNSIGNED NOT NULL,
  bio VARCHAR(800) NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_doctor_specialty FOREIGN KEY (specialty_id) REFERENCES specialties(id)
);

CREATE TABLE IF NOT EXISTS schedules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  doctor_id INT UNSIGNED NOT NULL,
  work_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_schedule_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
  UNIQUE KEY unique_schedule_block (doctor_id, work_date, start_time, end_time)
);

CREATE TABLE IF NOT EXISTS appointments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  doctor_id INT UNSIGNED NOT NULL,
  specialty_id INT UNSIGNED NOT NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  patient_name VARCHAR(120) NOT NULL,
  patient_phone VARCHAR(30) NOT NULL,
  patient_email VARCHAR(190) NOT NULL,
  patient_birth_info VARCHAR(80) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status ENUM('pending', 'confirmed', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_appointment_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id),
  CONSTRAINT fk_appointment_specialty FOREIGN KEY (specialty_id) REFERENCES specialties(id),
  UNIQUE KEY unique_active_appointment (doctor_id, appointment_date, appointment_time, status)
);

ALTER TABLE users ADD CONSTRAINT fk_user_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE SET NULL;

INSERT IGNORE INTO specialties (name, description) VALUES
('Nội tổng quát', 'Khám và tư vấn các vấn đề sức khỏe tổng quát.'),
('Tim mạch', 'Tầm soát và theo dõi sức khỏe tim mạch.'),
('Nhi khoa', 'Chăm sóc sức khỏe cho trẻ em và vị thành niên.');

-- Tài khoản quản trị khởi tạo để có thể đăng nhập và nhập dữ liệu phòng khám.
INSERT IGNORE INTO users (full_name, email, password_hash, role)
VALUES ('Quản trị viên', 'admin@hieutam.vn', '$2b$10$fpHH2O7lcWnEKEuFgpQWeer9JEWi8OIN2y0.R8QqQ.zYz6.5g2Xna', 'admin');
