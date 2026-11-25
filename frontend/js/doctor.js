function escapeDoctorScheduleMarkup(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function formatDoctorScheduleDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '—');
}

document.addEventListener('DOMContentLoaded', async () => {
  const tbody = document.getElementById('doctorScheduleBody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6">Đang tải lịch khám...</td></tr>';
  try {
    const response = await apiRequest('/doctor/appointments');
    const appointments = response.data;
    if (!Array.isArray(appointments)) throw new Error('Dữ liệu lịch khám không hợp lệ.');

    tbody.innerHTML = appointments.map(item => {
      const status = {
        pending: ['Chờ duyệt', 'badge-pending'],
        confirmed: ['Đã xác nhận', 'badge-confirmed'],
        completed: ['Đã hoàn tất', 'badge-completed'],
        cancelled: ['Đã hủy', 'badge-cancelled'],
        rejected: ['Bị từ chối', 'badge-cancelled'],
        expired: ['Hết hạn', 'badge-cancelled']
      }[item.status] || ['Không xác định', 'badge-cancelled'];
      const time = `${String(item.slot_time || '').slice(0, 5)} - ${String(item.end_time || '').slice(0, 5)}`;
      return `
        <tr>
          <td><strong>${escapeDoctorScheduleMarkup(item.appointment_code)}</strong></td>
          <td>${escapeDoctorScheduleMarkup(item.patient_name)}</td>
          <td>${escapeDoctorScheduleMarkup(item.patient_phone || '—')}</td>
          <td>${escapeDoctorScheduleMarkup(time)} · ${escapeDoctorScheduleMarkup(formatDoctorScheduleDate(item.appointment_date))}</td>
          <td>${escapeDoctorScheduleMarkup(item.reason || item.doctor_notes || '—')}</td>
          <td><span class="status-badge ${status[1]}">${status[0]}</span></td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="6">Chưa có lịch khám.</td></tr>';
  } catch (error) {
    if (error.status === 401 || error.status === 403) return;
    const message = error.status
      ? 'Không thể tải lịch khám. Vui lòng thử lại sau.'
      : 'Không thể kết nối đến máy chủ. Vui lòng thử lại.';
    tbody.innerHTML = `<tr><td colspan="6" role="alert">${message}</td></tr>`;
  }
});
