# Hệ thống Đặt lịch Hẹn Khám Bệnh – Phòng khám Hiếu Tâm

## 1. Giới thiệu

**Hệ thống Đặt lịch Hẹn Khám Bệnh cho Phòng khám Hiếu Tâm** là ứng dụng web hỗ trợ bệnh nhân đặt lịch khám trực tuyến, đồng thời giúp phòng khám quản lý lịch hẹn và lịch làm việc của bác sĩ thuận tiện hơn.

Dự án được thực hiện trong khuôn khổ Đồ án cơ sở ngành – Công nghệ thông tin.

## 2. Mục tiêu

- Hỗ trợ bệnh nhân lựa chọn chuyên khoa, bác sĩ và thời gian khám.
- Hiển thị thông tin lịch hẹn sau khi đặt lịch.
- Hỗ trợ gửi email xác nhận lịch hẹn.
- Giúp bác sĩ theo dõi danh sách lịch hẹn trong ngày.
- Hỗ trợ Admin quản lý thông tin bác sĩ và ca trực.
- Hạn chế tình trạng trùng lịch khám.

## 3. Chức năng chính

### 3.1. Bệnh nhân

- Xem thông tin chuyên khoa và bác sĩ.
- Lựa chọn thời gian khám phù hợp.
- Đặt lịch hẹn khám bệnh.
- Theo dõi thông tin lịch hẹn.
- Nhận email xác nhận lịch hẹn.

### 3.2. Bác sĩ

- Xem danh sách lịch hẹn trong ngày.
- Theo dõi lịch làm việc.

### 3.3. Quản trị viên (Admin)

- Quản lý thông tin bác sĩ.
- Quản lý chuyên khoa.
- Quản lý ca trực và lịch làm việc.
- Theo dõi và quản lý lịch hẹn.

## 4. Công nghệ sử dụng

| Công nghệ | Vai trò |
|---|---|
| HTML5, CSS3, JavaScript | Xây dựng giao diện web |
| React, TypeScript | Phát triển giao diện người dùng |
| Vite | Công cụ phát triển frontend |
| Node.js, Express.js | Xử lý phía máy chủ và API |
| MySQL | Lưu trữ và quản lý dữ liệu |
| Nodemailer, SMTP | Hỗ trợ gửi email xác nhận |
| Tailwind CSS | Hỗ trợ thiết kế giao diện |

## 5. Cấu trúc dự án

```text
hieu-tam-clinic/
├── database/          # Cơ sở dữ liệu
├── server/            # Backend và API
├── src/               # Mã nguồn giao diện
├── .gitignore
├── index.html
├── package.json
├── package-lock.json
├── eslint.config.js
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
└── vite.config.ts
```

## 6. Hướng dẫn cài đặt và chạy dự án

### 6.1. Yêu cầu môi trường

- Node.js và npm.
- MySQL Server.
- Visual Studio Code hoặc trình soạn thảo mã nguồn tương đương.

### 6.2. Tải mã nguồn

```bash
git clone <URL_REPOSITORY>
cd <TEN_THU_MUC_DU_AN>
```

### 6.3. Cài đặt thư viện

```bash
npm install
```

### 6.4. Cấu hình cơ sở dữ liệu

- Khởi động MySQL Server.
- Kiểm tra các tệp trong thư mục `database/`.
- Tạo cơ sở dữ liệu và nhập dữ liệu theo cấu trúc SQL của dự án.
- Cấu hình thông tin kết nối MySQL trong backend.

### 6.5. Cấu hình môi trường

Tạo tệp `.env` theo cấu hình backend yêu cầu.

Ví dụ:

```env
PORT=3001
DB_HOST=localhost
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=phong_kham
```

Bổ sung các biến cấu hình email SMTP nếu cần. Không công khai mật khẩu hoặc thông tin xác thực trên GitHub.

### 6.6. Khởi chạy ứng dụng

Chạy frontend:

```bash
npm run dev
```

Khởi chạy backend bằng lệnh được khai báo trong `package.json`. Nếu script `start` chạy tệp `server/index.js`, sử dụng:

```bash
npm start
```

Sau khi khởi chạy thành công, truy cập địa chỉ frontend được hiển thị trong terminal.

Lưu ý: Các lệnh và biến môi trường cần phù hợp với cấu hình thực tế của dự án.

## 7. Cơ sở dữ liệu

Hệ thống sử dụng MySQL để lưu trữ và quản lý dữ liệu liên quan đến:

- Bệnh nhân.
- Bác sĩ.
- Chuyên khoa.
- Ca trực.
- Lịch hẹn khám bệnh.

Cấu trúc bảng và các mối quan hệ được xác định trong các tệp cơ sở dữ liệu của dự án.

## 8. Phạm vi đề tài

Dự án tập trung vào quy trình đặt lịch hẹn khám bệnh và quản lý lịch làm việc của phòng khám. Hệ thống được xây dựng phục vụ mục đích học tập, thực hành phân tích thiết kế hệ thống, lập trình web và quản trị cơ sở dữ liệu.

Đề tài không tập trung vào các nghiệp vụ chuyên môn như chẩn đoán bệnh, kê đơn thuốc, thanh toán hoặc quản lý hồ sơ bệnh án điện tử.

## 9. Thông tin dự án

- **Tên đề tài:** Hệ thống Đặt lịch Hẹn Khám Bệnh cho Phòng Khám
- **Tên phòng khám:** Phòng khám Đa khoa Hiếu Tâm
- **Lĩnh vực:** Công nghệ thông tin – Phát triển ứng dụng web
- **Mục đích:** Đồ án cơ sở ngành

---

© 2026 – Phòng khám Đa khoa Hiếu Tâm. Dự án phục vụ học tập.
