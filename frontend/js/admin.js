function escapeAdminMarkup(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function formatAdminDate(value) {
  if (!value) return '';
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return year && month && day
    ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
      .format(new Date(year, month - 1, day))
    : String(value);
}

function adminAppointmentBadge(status) {
  const states = {
    pending: ['Chờ duyệt', 'badge-pending'],
    confirmed: ['Đã xác nhận', 'badge-confirmed'],
    rejected: ['Bị từ chối', 'badge-cancelled'],
    expired: ['Hết hạn', 'badge-cancelled'],
    cancelled: ['Đã hủy', 'badge-cancelled'],
    completed: ['Đã hoàn tất', 'badge-completed']
  };
  const [label, className] = states[status] || ['Không xác định', 'badge-pending'];
  return `<span class="status-badge ${className}">${label}</span>`;
}

function adminEmailDeliveryStatus(status) {
  const labels = {
    queued: 'Email đang chờ gửi',
    sending: 'Email đang được gửi',
    retry: 'Email lỗi, sẽ thử lại',
    sent: 'Email đã được máy chủ thư chấp nhận'
  };
  return labels[status] || '';
}

function adminDateToISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

let adminScheduleDoctorsLoaded = false;
let adminShiftRequestId = 0;
const adminShiftsById = new Map();

async function loadAdminScheduleDoctors() {
  const filter = document.getElementById('adminScheduleDoctorFilter');
  const formSelect = document.getElementById('adminScheduleCreateDoctor');
  const status = document.getElementById('adminScheduleDoctorsStatus');
  if (!filter || !formSelect || !status || adminScheduleDoctorsLoaded) return;

  filter.disabled = true;
  formSelect.disabled = true;
  filter.innerHTML = '<option value="all">Đang tải bác sĩ...</option>';
  formSelect.innerHTML = '<option value="">Đang tải bác sĩ...</option>';
  status.setAttribute('role', 'status');
  status.textContent = '';
  try {
    const response = await apiRequest('/admin/doctors');
    if (!Array.isArray(response.data)) throw new Error('Dữ liệu danh sách bác sĩ không hợp lệ.');
    const doctorOptions = response.data.map(doctor =>
      `<option value="${escapeAdminMarkup(doctor.id)}">${escapeAdminMarkup(doctor.display_name || doctor.full_name)}</option>`
    ).join('');
    filter.innerHTML = '<option value="all">Tất cả bác sĩ</option>' + doctorOptions;
    formSelect.innerHTML = '<option value="">Chọn bác sĩ</option>' + doctorOptions;
    filter.disabled = false;
    formSelect.disabled = false;
    adminScheduleDoctorsLoaded = true;
  } catch (error) {
    status.setAttribute('role', 'alert');
    status.innerHTML = `${escapeAdminMarkup(error.message || 'Không thể tải danh sách bác sĩ.')} <button type="button" class="booking-retry" id="adminScheduleDoctorsRetry">Thử lại</button>`;
    console.error('Không thể tải danh sách bác sĩ lọc ca trực:', error.message);
  }
}

async function loadAdminShifts() {
  const tbody = document.getElementById('adminSchedulesBody');
  const status = document.getElementById('adminSchedulesStatus');
  const doctorFilter = document.getElementById('adminScheduleDoctorFilter');
  const weekStart = document.getElementById('adminScheduleWeekStart');
  const weekEnd = document.getElementById('adminScheduleWeekEnd');
  if (!tbody || !status || !doctorFilter || !weekStart || !weekEnd) return;
  if (!weekStart.value || !weekEnd.value) {
    status.setAttribute('role', 'alert');
    status.textContent = 'Vui lòng chọn ngày bắt đầu và ngày kết thúc.';
    return;
  }
  if (weekStart.value > weekEnd.value) {
    status.setAttribute('role', 'alert');
    status.textContent = 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.';
    return;
  }

  const requestId = ++adminShiftRequestId;
  const params = new URLSearchParams({
    doctor_id: doctorFilter.value || 'all',
    week_start: weekStart.value,
    week_end: weekEnd.value
  });
  status.setAttribute('role', 'status');
  status.textContent = 'Đang tải ca trực...';
  adminShiftsById.clear();
  tbody.innerHTML = '';

  try {
    const response = await apiRequest(`/admin/shifts?${params.toString()}`);
    if (requestId !== adminShiftRequestId) return false;
    if (!Array.isArray(response.data)) throw new Error('Dữ liệu ca trực không hợp lệ.');
    const shifts = response.data;
    if (!shifts.length) {
      status.textContent = 'Không có ca trực trong khoảng ngày đã chọn.';
      return true;
    }

    shifts.forEach(shift => adminShiftsById.set(String(shift.id), shift));
    tbody.innerHTML = shifts.map(shift => {
      const shiftDate = String(shift.shift_date || '').slice(0, 10);
      return `
        <tr>
          <td>${escapeAdminMarkup(shift.doctor_display || '—')}</td>
          <td>${escapeAdminMarkup(shift.specialty_name || '—')}</td>
          <td>${escapeAdminMarkup(formatAdminDate(shiftDate) || '—')}</td>
          <td>${escapeAdminMarkup(String(shift.start_time || '').slice(0, 5))} – ${escapeAdminMarkup(String(shift.end_time || '').slice(0, 5))}</td>
          <td>${escapeAdminMarkup(shift.slot_duration ?? '—')}</td>
          <td>${escapeAdminMarkup(shift.active_bookings ?? 0)}</td>
          <td>
            <div class="admin-shift-actions">
              <button type="button" class="btn btn-light-outline admin-shift-edit" data-id="${escapeAdminMarkup(shift.id)}">Sửa ca</button>
              <button type="button" class="btn btn-light-outline admin-shift-delete" data-id="${escapeAdminMarkup(shift.id)}">Xóa ca</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    status.textContent = `Có ${shifts.length} ca trực trong khoảng ngày đã chọn.`;
    return true;
  } catch (error) {
    if (requestId !== adminShiftRequestId) return false;
    status.setAttribute('role', 'alert');
    status.innerHTML = `${escapeAdminMarkup(error.message || 'Không thể tải danh sách ca trực.')} <button type="button" class="booking-retry" id="adminShiftsRetry">Thử lại</button>`;
    console.error('Không thể tải danh sách ca trực quản trị:', error.message);
    return false;
  }
}

async function createAdminShift(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.getElementById('adminScheduleCreateStatus');
  const submitButton = document.getElementById('adminScheduleCreateButton');
  message.hidden = true;
  message.textContent = '';
  submitButton.disabled = true;

  try {
    const formData = new FormData(form);
    const response = await apiRequest('/admin/shifts', {
      method: 'POST',
      body: JSON.stringify({
        doctor_id: formData.get('doctor_id'),
        shift_date: formData.get('shift_date'),
        start_time: formData.get('start_time'),
        end_time: formData.get('end_time'),
        slot_duration: formData.get('slot_duration')
      })
    });
    form.reset();
    form.elements.slot_duration.value = '30';
    message.classList.remove('admin-schedule-error');
    message.classList.add('admin-schedule-success');
    message.setAttribute('role', 'status');
    message.textContent = response.message || 'Tạo ca trực mới thành công.';
    message.hidden = false;
    await loadAdminShifts();
  } catch (error) {
    message.classList.remove('admin-schedule-success');
    message.classList.add('admin-schedule-error');
    message.setAttribute('role', 'alert');
    message.textContent = error.message || 'Không thể tạo ca trực.';
    message.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
}

function openAdminShiftEdit(shiftId) {
  const shift = adminShiftsById.get(String(shiftId));
  const status = document.getElementById('adminSchedulesStatus');
  if (!shift) {
    status.setAttribute('role', 'alert');
    status.textContent = 'Ca trực không còn trong danh sách. Vui lòng tải lại.';
    return;
  }

  const dialog = document.getElementById('adminShiftEditDialog');
  const form = document.getElementById('adminShiftEditForm');
  form.dataset.shiftId = String(shift.id);
  document.getElementById('adminShiftEditDoctor').value = shift.doctor_display || '';
  form.elements.shift_date.value = String(shift.shift_date || '').slice(0, 10);
  form.elements.start_time.value = String(shift.start_time || '').slice(0, 5);
  form.elements.end_time.value = String(shift.end_time || '').slice(0, 5);
  form.elements.slot_duration.value = String(shift.slot_duration ?? '30');

  const errorMessage = document.getElementById('adminShiftEditError');
  errorMessage.hidden = true;
  errorMessage.textContent = '';
  document.getElementById('adminShiftEditSubmit').disabled = false;
  dialog.showModal();
  form.elements.shift_date.focus();
}

async function updateAdminShift(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const errorMessage = document.getElementById('adminShiftEditError');
  const submitButton = document.getElementById('adminShiftEditSubmit');
  errorMessage.hidden = true;
  errorMessage.textContent = '';
  submitButton.disabled = true;

  try {
    const formData = new FormData(form);
    const response = await apiRequest(`/admin/shifts/${encodeURIComponent(form.dataset.shiftId)}`, {
      method: 'PUT',
      body: JSON.stringify({
        shift_date: formData.get('shift_date'),
        start_time: formData.get('start_time'),
        end_time: formData.get('end_time'),
        slot_duration: formData.get('slot_duration')
      })
    });

    document.getElementById('adminShiftEditDialog').close();
    if (await loadAdminShifts()) {
      const status = document.getElementById('adminSchedulesStatus');
      status.setAttribute('role', 'status');
      status.textContent = response.message || 'Cập nhật ca trực thành công.';
    }
  } catch (error) {
    errorMessage.textContent = error.message || 'Không thể cập nhật ca trực.';
    errorMessage.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
}

async function deleteAdminShift(shiftId) {
  if (!window.confirm('Bạn có chắc chắn muốn xóa ca trực này?')) return;
  const status = document.getElementById('adminSchedulesStatus');
  status.setAttribute('role', 'status');
  status.textContent = 'Đang xóa ca trực...';
  try {
    const response = await apiRequest(`/admin/shifts/${encodeURIComponent(shiftId)}`, {
      method: 'DELETE'
    });
    await loadAdminShifts();
    status.setAttribute('role', 'status');
    status.textContent = response.message || 'Xóa ca trực thành công.';
  } catch (error) {
    status.setAttribute('role', 'alert');
    status.textContent = error.message || 'Không thể xóa ca trực.';
  }
}

async function loadAdminDashboard() {
  try {
    const response = await apiRequest('/admin/stats');
    const data = response.data || {};
    const counts = data.counts || {};
    const holdPolicy = document.getElementById('adminHoldPolicy');
    if (holdPolicy) holdPolicy.textContent = `Yêu cầu Chờ duyệt giữ chỗ tối đa ${data.appointment_hold_minutes} phút kể từ lúc gửi.`;
    document.getElementById('statTotalAppt').textContent = counts.total_appointments ?? 0;
    document.getElementById('statTotalPatients').textContent = counts.patients ?? 0;
    document.getElementById('statPendingAppointments').textContent = counts.pending ?? 0;
    document.getElementById('statCancelledAppointments').textContent =
      (Number(counts.cancelled) || 0) + (Number(counts.rejected) || 0) + (Number(counts.expired) || 0);

    const tbody = document.getElementById('adminAppointmentsBody');
    if (tbody) {
      tbody.innerHTML = (data.recent_appointments || []).slice(0, 8).map(item => `
        <tr>
          <td><strong>${escapeAdminMarkup(item.appointment_code)}</strong></td>
          <td>${escapeAdminMarkup(item.patient_name)}</td>
          <td>${escapeAdminMarkup(item.doctor_display || item.doctor_name)}</td>
          <td>${escapeAdminMarkup(formatAdminDate(item.appointment_date))}</td>
          <td>${adminAppointmentBadge(item.status)}</td>
        </tr>
      `).join('') || '<tr><td colspan="5">Chưa có lịch hẹn.</td></tr>';
    }
  } catch (error) {
    const tbody = document.getElementById('adminAppointmentsBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="5">${escapeAdminMarkup(error.message || 'Không thể tải dữ liệu.')}</td></tr>`;
    console.error('Không thể tải tổng quan quản trị:', error.message);
  }
}

async function loadAdminAppointments() {
  const tbody = document.getElementById('adminAppointmentsManagerBody');
  const status = document.getElementById('adminAppointmentsStatus');
  if (!tbody || !status) return;

  const statusFilter = document.getElementById('adminAppointmentStatusFilter').value;
  const search = document.getElementById('adminAppointmentSearch').value.trim();
  const params = new URLSearchParams();
  if (statusFilter !== 'all') params.set('status', statusFilter);
  if (search) params.set('search', search);
  status.textContent = 'Đang tải yêu cầu đặt lịch...';
  tbody.innerHTML = '';

  try {
    const response = await apiRequest(`/admin/appointments?${params.toString()}`);
    const appointments = Array.isArray(response.data) ? response.data : [];
    tbody.innerHTML = appointments.map(appointment => {
      const canReview = appointment.status === 'pending';
      const expiresAt = appointment.hold_expires_at
        ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
          .format(new Date(appointment.hold_expires_at))
        : '';
      return `
        <tr>
          <td><strong>${escapeAdminMarkup(appointment.appointment_code)}</strong></td>
          <td>${escapeAdminMarkup(appointment.patient_name)}<br>
            <small>${escapeAdminMarkup(appointment.patient_phone)} · ${escapeAdminMarkup(appointment.patient_email)}</small>
          </td>
          <td>${escapeAdminMarkup(appointment.doctor_display)}<br>
            <small>${escapeAdminMarkup(appointment.specialty_name)} · ${escapeAdminMarkup(appointment.room_number)}</small>
          </td>
          <td>${escapeAdminMarkup(formatAdminDate(appointment.appointment_date))}<br>
            <small>${escapeAdminMarkup(String(appointment.slot_time).slice(0, 5))}–${escapeAdminMarkup(String(appointment.end_time).slice(0, 5))}</small>
          </td>
          <td>${adminAppointmentBadge(appointment.status)}
            ${canReview ? `<small class="admin-hold-expiry">Giữ chỗ đến ${escapeAdminMarkup(expiresAt)}</small>` : ''}
            ${appointment.cancel_reason ? `<small class="admin-rejection-reason">${escapeAdminMarkup(appointment.cancel_reason)}</small>` : ''}
            ${appointment.email_delivery_status ? `<small class="admin-email-status">${escapeAdminMarkup(adminEmailDeliveryStatus(appointment.email_delivery_status))}</small>` : ''}
          </td>
          <td class="admin-appointment-actions">
            ${canReview ? `
              <button type="button" class="btn btn-primary admin-appointment-action" data-action="approve" data-id="${escapeAdminMarkup(appointment.id)}">Duyệt</button>
              <button type="button" class="btn btn-light-outline admin-appointment-action" data-action="reject" data-id="${escapeAdminMarkup(appointment.id)}">Từ chối</button>
            ` : '—'}
          </td>
        </tr>
      `;
    }).join('');
    status.textContent = appointments.length ? `Có ${appointments.length} lịch hẹn.` : 'Không có lịch hẹn ở trạng thái này.';
  } catch (error) {
    status.textContent = error.message || 'Không thể tải yêu cầu đặt lịch.';
    status.setAttribute('role', 'alert');
    console.error('Không thể tải danh sách lịch hẹn quản trị:', error.message);
  }
}

async function reviewAdminAppointment(id, action) {
  const payload = action === 'approve'
    ? { status: 'confirmed' }
    : { status: 'rejected', reason: window.prompt('Nhập lý do từ chối yêu cầu:')?.trim() || '' };
  if (action === 'approve' && !window.confirm('Xác nhận lịch hẹn này?')) return;
  if (action === 'reject' && !payload.reason) return;

  const buttons = [...document.querySelectorAll(`.admin-appointment-action[data-id="${CSS.escape(String(id))}"]`)];
  buttons.forEach(button => { button.disabled = true; });
  const status = document.getElementById('adminAppointmentsStatus');
  status.textContent = action === 'approve' ? 'Đang kiểm tra và xác nhận...' : 'Đang từ chối yêu cầu...';
  try {
    const response = await apiRequest(`/admin/appointments/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    status.textContent = response.message || 'Đã cập nhật trạng thái.';
  } catch (error) {
    status.textContent = error.message || 'Không thể xử lý yêu cầu.';
    status.setAttribute('role', 'alert');
  } finally {
    await loadAdminAppointments();
    await loadAdminDashboard();
  }
}

async function loadAdminDoctors() {
  const tbody = document.getElementById('adminDoctorsBody');
  const status = document.getElementById('adminDoctorsStatus');
  if (!tbody || !status) return;

  status.setAttribute('role', 'status');
  status.textContent = 'Đang tải danh sách bác sĩ...';
  tbody.innerHTML = '';
  try {
    const response = await apiRequest('/admin/doctors');
    if (!Array.isArray(response.data)) throw new Error('Dữ liệu danh sách bác sĩ không hợp lệ.');
    const doctors = response.data;
    if (!doctors.length) {
      status.textContent = '';
      tbody.innerHTML = '<tr><td colspan="6">Chưa có bác sĩ</td></tr>';
      return;
    }

    tbody.innerHTML = doctors.map(doctor => {
      const active = Number(doctor.is_active) === 1 && Number(doctor.user_active) !== 0;
      return `
        <tr>
          <td>${escapeAdminMarkup(doctor.display_name || doctor.full_name)}</td>
          <td>${escapeAdminMarkup(doctor.specialty_name)}</td>
          <td>${escapeAdminMarkup(doctor.email)}</td>
          <td>${escapeAdminMarkup(doctor.phone || '—')}</td>
          <td><span class="status-badge ${active ? 'badge-confirmed' : 'badge-cancelled'}">${active ? 'Hoạt động' : 'Tạm ngưng'}</span></td>
          <td>
            <button type="button" class="btn ${active ? 'btn-light-outline' : 'btn-primary'} admin-doctor-status-action"
              data-id="${escapeAdminMarkup(doctor.id)}" data-active="${active ? '1' : '0'}">
              ${active ? 'Tạm ngưng' : 'Kích hoạt'}
            </button>
          </td>
        </tr>
      `;
    }).join('');
    status.textContent = `Có ${doctors.length} bác sĩ.`;
  } catch (error) {
    status.setAttribute('role', 'alert');
    status.innerHTML = `${escapeAdminMarkup(error.message || 'Không thể tải danh sách bác sĩ.')} <button type="button" class="booking-retry" id="adminDoctorsRetry">Thử lại</button>`;
    console.error('Không thể tải danh sách bác sĩ quản trị:', error.message);
  }
}

async function loadAdminDoctorSpecialties() {
  const select = document.getElementById('adminDoctorSpecialty');
  const status = document.getElementById('adminDoctorSpecialtyStatus');
  const submitButton = document.getElementById('adminDoctorSubmitButton');
  if (!select || !status || !submitButton) return;

  select.disabled = true;
  submitButton.disabled = true;
  select.innerHTML = '<option value="">Đang tải chuyên khoa...</option>';
  status.setAttribute('role', 'status');
  status.textContent = '';
  try {
    const response = await apiRequest('/admin/specialties');
    if (!Array.isArray(response.data)) throw new Error('Dữ liệu chuyên khoa không hợp lệ.');
    const specialties = response.data;
    select.innerHTML = '<option value="">Chọn chuyên khoa</option>' + specialties.map(specialty =>
      `<option value="${escapeAdminMarkup(specialty.id)}">${escapeAdminMarkup(specialty.name)}</option>`
    ).join('');
    select.disabled = specialties.length === 0;
    submitButton.disabled = specialties.length === 0;
    if (!specialties.length) status.textContent = 'Chưa có chuyên khoa để lựa chọn.';
  } catch (error) {
    select.innerHTML = '<option value="">Không thể tải chuyên khoa</option>';
    status.setAttribute('role', 'alert');
    status.innerHTML = `${escapeAdminMarkup(error.message || 'Không thể tải chuyên khoa.')} <button type="button" class="booking-retry" id="adminDoctorSpecialtiesRetry">Thử lại</button>`;
    console.error('Không thể tải danh sách chuyên khoa quản trị:', error.message);
  }
}

async function toggleAdminDoctorStatus(button) {
  const id = button.dataset.id;
  const isActive = button.dataset.active === '1';
  if (isActive && !window.confirm('Bạn có chắc muốn tạm ngưng bác sĩ này?')) return;

  button.disabled = true;
  const notice = document.getElementById('adminDoctorsNotice');
  notice.setAttribute('role', 'status');
  notice.textContent = isActive ? 'Đang tạm ngưng bác sĩ...' : 'Đang kích hoạt bác sĩ...';
  try {
    const response = await apiRequest(`/admin/doctors/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive ? 0 : 1 })
    });
    await loadAdminDoctors();
    notice.textContent = response.message || 'Đã cập nhật trạng thái bác sĩ.';
  } catch (error) {
    notice.setAttribute('role', 'alert');
    notice.textContent = error.message || 'Không thể cập nhật trạng thái bác sĩ.';
    console.error('Không thể cập nhật trạng thái bác sĩ:', error.message);
  }
}

async function createAdminDoctor(event) {
  event.preventDefault();
  const form = document.getElementById('adminDoctorForm');
  const errorMessage = document.getElementById('adminDoctorFormError');
  const submitButton = document.getElementById('adminDoctorSubmitButton');
  const notice = document.getElementById('adminDoctorsNotice');
  const formData = new FormData(form);
  const payload = {
    full_name: formData.get('full_name').trim(),
    email: formData.get('email').trim(),
    password: formData.get('password'),
    specialty_id: formData.get('specialty_id'),
    phone: formData.get('phone').trim(),
    room_number: formData.get('room_number').trim()
  };

  errorMessage.hidden = true;
  errorMessage.textContent = '';
  submitButton.disabled = true;
  try {
    const response = await apiRequest('/admin/doctors', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    form.reset();
    form.hidden = true;
    notice.setAttribute('role', 'status');
    notice.textContent = response.message || 'Thêm bác sĩ thành công.';
    await loadAdminDoctors();
  } catch (error) {
    errorMessage.textContent = error.message || 'Không thể tạo bác sĩ.';
    errorMessage.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
}

function switchAdminTab(tab, el) {
  document.querySelectorAll('.admin-sidebar .sidebar-menu a').forEach(link => link.classList.remove('active'));
  if (el) el.classList.add('active');
  const titles = {
    dashboard: 'Tổng quan',
    appointments: 'Quản lý lịch hẹn',
    doctors: 'Quản lý bác sĩ',
    schedules: 'Quản lý lịch trực'
  };
  const descriptions = {
    dashboard: 'Thống kê hoạt động trong hệ thống',
    appointments: 'Theo dõi và xử lý các yêu cầu đặt lịch.',
    doctors: 'Quản lý thông tin và trạng thái hoạt động của bác sĩ.',
    schedules: 'Theo dõi ca trực được thêm theo ngày của bác sĩ.'
  };
  document.getElementById('adminPageTitle').textContent = titles[tab] || 'Tổng quan';
  document.getElementById('adminPageDescription').textContent = descriptions[tab] || descriptions.dashboard;
  const isAppointments = tab === 'appointments';
  const isDoctors = tab === 'doctors';
  const isSchedules = tab === 'schedules';
  document.getElementById('adminDashboardContent').hidden = isAppointments || isDoctors || isSchedules;
  document.getElementById('adminAppointmentsPanel').hidden = !isAppointments;
  document.getElementById('adminDoctorsPanel').hidden = !isDoctors;
  document.getElementById('adminSchedulesPanel').hidden = !isSchedules;
  if (isAppointments) loadAdminAppointments();
  if (isDoctors) loadAdminDoctors();
  if (isSchedules) {
    loadAdminScheduleDoctors();
    loadAdminShifts();
  }
}

function initAdminDashboard() {
  loadAdminDashboard();
  const today = new Date();
  const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  document.getElementById('adminScheduleWeekStart').value = adminDateToISO(weekStart);
  document.getElementById('adminScheduleWeekEnd').value = adminDateToISO(weekEnd);
  document.getElementById('adminScheduleCreateDate').value = adminDateToISO(today);

  document.getElementById('adminAppointmentsRefresh')?.addEventListener('click', loadAdminAppointments);
  document.getElementById('adminAppointmentStatusFilter')?.addEventListener('change', loadAdminAppointments);
  document.getElementById('adminAppointmentSearch')?.addEventListener('input', () => {
    window.clearTimeout(window.adminAppointmentSearchTimer);
    window.adminAppointmentSearchTimer = window.setTimeout(loadAdminAppointments, 250);
  });
  document.getElementById('adminAppointmentsManagerBody')?.addEventListener('click', event => {
    const button = event.target.closest('.admin-appointment-action');
    if (button) reviewAdminAppointment(button.dataset.id, button.dataset.action);
  });
  document.getElementById('adminDoctorAddButton')?.addEventListener('click', () => {
    const form = document.getElementById('adminDoctorForm');
    const errorMessage = document.getElementById('adminDoctorFormError');
    form.hidden = false;
    errorMessage.hidden = true;
    errorMessage.textContent = '';
    document.getElementById('adminDoctorsNotice').textContent = '';
    loadAdminDoctorSpecialties();
    form.elements.full_name.focus();
  });
  document.getElementById('adminDoctorCancelButton')?.addEventListener('click', () => {
    const form = document.getElementById('adminDoctorForm');
    form.reset();
    form.hidden = true;
    document.getElementById('adminDoctorFormError').hidden = true;
  });
  document.getElementById('adminDoctorForm')?.addEventListener('submit', createAdminDoctor);
  document.getElementById('adminDoctorsBody')?.addEventListener('click', event => {
    const button = event.target.closest('.admin-doctor-status-action');
    if (button) toggleAdminDoctorStatus(button);
  });
  document.getElementById('adminDoctorsStatus')?.addEventListener('click', event => {
    if (event.target.id === 'adminDoctorsRetry') loadAdminDoctors();
  });
  document.getElementById('adminDoctorSpecialtyStatus')?.addEventListener('click', event => {
    if (event.target.id === 'adminDoctorSpecialtiesRetry') loadAdminDoctorSpecialties();
  });
  document.getElementById('adminScheduleLoadButton')?.addEventListener('click', loadAdminShifts);
  document.getElementById('adminScheduleCreateForm')?.addEventListener('submit', createAdminShift);
  document.getElementById('adminSchedulesBody')?.addEventListener('click', event => {
    const editButton = event.target.closest('.admin-shift-edit');
    if (editButton) {
      openAdminShiftEdit(editButton.dataset.id);
      return;
    }
    const deleteButton = event.target.closest('.admin-shift-delete');
    if (deleteButton) deleteAdminShift(deleteButton.dataset.id);
  });
  document.getElementById('adminShiftEditForm')?.addEventListener('submit', updateAdminShift);
  document.getElementById('adminShiftEditCancel')?.addEventListener('click', () => {
    document.getElementById('adminShiftEditDialog').close();
  });
  document.getElementById('adminScheduleDoctorsStatus')?.addEventListener('click', event => {
    if (event.target.id === 'adminScheduleDoctorsRetry') loadAdminScheduleDoctors();
  });
  document.getElementById('adminSchedulesStatus')?.addEventListener('click', event => {
    if (event.target.id === 'adminShiftsRetry') loadAdminShifts();
  });
  window.setInterval(() => {
    if (!document.getElementById('adminAppointmentsPanel')?.hidden) loadAdminAppointments();
  }, 30 * 1000);
}

document.addEventListener('DOMContentLoaded', initAdminDashboard);
