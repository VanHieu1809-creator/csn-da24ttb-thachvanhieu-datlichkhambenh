// Chuyển đổi giữa các giao diện công khai.
function switchView(viewName) {
  const targetView = document.getElementById(`view-${viewName}`);
  if (!targetView) {
    console.error(`Không tìm thấy giao diện: view-${viewName}`);
    return;
  }

  document.querySelectorAll('.page-view').forEach(view => {
    view.classList.toggle('active', view === targetView);
  });

  document.querySelectorAll('.nav-link[data-view]').forEach(link => {
    link.classList.toggle('active', link.dataset.view === viewName);
  });

  document.getElementById('mainNav')?.classList.remove('show');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
}

let systemSpecialties = [];
let specialtiesLoading = true;
let specialtiesLoadError = '';
let systemDoctors = [];
let doctorsLoading = true;
let doctorsLoadError = '';
let publicDirectoryRequestId = 0;
let pendingHomeDoctorSpecialty = '';
const FEATURED_DOCTORS_COUNT = 3;

function escapeDoctorMarkup(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function preventOrphanWord(text) {
  const value = String(text ?? '').trim();
  const match = value.match(/^([\s\S]*\S)\s+(\S+)$/u);
  if (!match) return value;

  const precedingWords = match[1].trim().split(/\s+/u);
  if (precedingWords.length < 3 || Array.from(match[2]).length > 10) return value;
  return `${match[1]}\u00A0${match[2]}`;
}

function normalizeDoctorSearch(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi')
    .trim();
}

function isHomeDoctorFilterActive() {
  return Boolean(
    document.getElementById('homeDoctorSearch')?.value.trim() ||
    document.getElementById('homeDoctorSpecFilter')?.value
  );
}

function showHomeDoctorsBySpecialty(specialtyId) {
  const filter = document.getElementById('homeDoctorSpecFilter');
  if (!filter) return;

  const value = String(specialtyId);
  if (Array.from(filter.options).some(option => option.value === value)) {
    filter.value = value;
    filter.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    pendingHomeDoctorSpecialty = value;
  }

  const doctorsSection = document.querySelector('.doctors-section');
  if (doctorsSection) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    doctorsSection.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }
}

function renderDoctorCard(doctor) {
  const id = escapeDoctorMarkup(doctor.id);
  const name = escapeDoctorMarkup(doctor.full_name);
  const specialtyData = systemSpecialties.find(item => item.id === doctor.specialty_id);
  const specialtyPresentation = SPECIALTY_PRESENTATION[doctor.specialty_id] || {};
  const specialty = escapeDoctorMarkup(specialtyPresentation.label || specialtyData?.name || doctor.specialty_name);
  const specialtyIcon = escapeDoctorMarkup(specialtyPresentation.icon || 'fa-stethoscope');
  const description = escapeDoctorMarkup(preventOrphanWord(doctor.bio));
  const room = escapeDoctorMarkup(doctor.room);
  const experience = escapeDoctorMarkup(doctor.experience_years);
  const avatar = escapeDoctorMarkup(doctor.avatar);

  return `
    <article class="doctor-card" data-doctor-id="${id}">
      <div class="doctor-avatar-wrap">
        <img class="doctor-avatar" src="${avatar}" alt="Ảnh minh họa bác sĩ ${name}" loading="lazy" decoding="async">
        <span class="doctor-avatar-label">Ảnh minh họa</span>
      </div>
      <div class="doctor-card-content">
        <span class="doctor-spec-tag"><i class="fa-solid ${specialtyIcon}" aria-hidden="true"></i>${specialty}</span>
        <h3 class="doctor-name">${name}</h3>
        <p class="doctor-bio">${description}</p>
        <div class="doctor-meta-list">
          <div class="doctor-meta-item"><i class="fa-regular fa-clock" aria-hidden="true"></i><span>${experience} năm kinh nghiệm</span></div>
          <div class="doctor-meta-item"><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span>${room}</span></div>
        </div>
      </div>
      <div class="doctor-card-actions">
        <button type="button" class="btn btn-primary" data-doctor-action="book" data-doctor-id="${id}" ${doctor.bookingAvailable ? '' : 'disabled'}>Đặt lịch khám</button>
        <button type="button" class="btn btn-light-outline" data-doctor-action="details" data-doctor-id="${id}">Xem chi tiết</button>
      </div>
    </article>
  `;
}

function filterDoctors(doctors, searchValue, specialtyValue) {
  const query = normalizeDoctorSearch(searchValue);
  return doctors.filter(doctor => {
    const doctorName = String(doctor.name || doctor.full_name || doctor.display_name || '').trim();
    const matchesQuery = !query || normalizeDoctorSearch(doctorName).includes(query);
    const matchesSpecialty = !specialtyValue || Number(doctor.specialty_id ?? doctor.specialtyId ?? doctor.specialty?.id ?? 0) === Number(specialtyValue);
    return matchesQuery && matchesSpecialty;
  });
}

function doctorListMessage() {
  if (doctorsLoading) return '<p class="doctor-empty-state" role="status">Đang tải danh sách bác sĩ...</p>';
  if (doctorsLoadError) {
    return `<div class="doctor-empty-state" role="alert"><p>Chưa thể tải danh sách bác sĩ.</p><button type="button" class="doctor-filter-reset" onclick="initializeDoctors()">Thử lại</button></div>`;
  }
  return '';
}

function renderDoctorLists() {
  const homeGrid = document.getElementById('homeDoctorsGrid');
  const pageGrid = document.getElementById('pageDoctorsGrid');
  const pageSearch = document.getElementById('pageDoctorSearch');
  const pageSelect = document.getElementById('pageDoctorSelect');
  const homeSearch = document.getElementById('homeDoctorSearch');
  const homeSelect = document.getElementById('homeDoctorSpecFilter');
  const homeSummary = document.getElementById('homeDoctorResultsSummary');
  const summary = document.getElementById('doctorResultsSummary');
  const loadingOrError = doctorListMessage();

  if (homeGrid) {
    const filtersActive = isHomeDoctorFilterActive();
    const matches = filterDoctors(systemDoctors, homeSearch?.value || '', homeSelect?.value || '');
    const visibleDoctors = filtersActive
      ? matches
      : systemDoctors.slice(0, FEATURED_DOCTORS_COUNT);

    homeGrid.innerHTML = loadingOrError || (visibleDoctors.length
      ? visibleDoctors.map(renderDoctorCard).join('')
      : systemDoctors.length
        ? '<div class="doctor-empty-state"><p>Không tìm thấy bác sĩ phù hợp</p><button type="button" class="doctor-filter-reset" data-doctor-filter-reset>Xóa bộ lọc</button></div>'
        : '<p class="doctor-empty-state" role="status">Hiện chưa có bác sĩ đang hoạt động.</p>');
    if (homeSummary) {
      homeSummary.textContent = filtersActive ? `Tìm thấy ${matches.length} bác sĩ` : '';
      homeSummary.hidden = !filtersActive;
    }
  }

  if (pageGrid) {
    const doctors = filterDoctors(systemDoctors, pageSearch?.value || '', pageSelect?.value || '');
    pageGrid.innerHTML = loadingOrError || (doctors.length
      ? doctors.map(renderDoctorCard).join('')
      : systemDoctors.length
        ? '<p class="doctor-empty-state">Không tìm thấy bác sĩ phù hợp.</p>'
        : '<p class="doctor-empty-state" role="status">Hiện chưa có bác sĩ đang hoạt động.</p>');
    if (summary) {
      summary.textContent = `Hiển thị ${doctors.length} / ${systemDoctors.length} bác sĩ`;
    }
  }
}

function renderSpecialtyCards() {
  const grid = document.getElementById('specialtyCardsGrid');
  if (!grid) return;
  if (specialtiesLoading) {
    grid.innerHTML = '<p class="booking-inline-status" role="status">Đang tải danh sách chuyên khoa...</p>';
    return;
  }
  if (specialtiesLoadError) {
    grid.innerHTML = '<div class="doctor-empty-state" role="alert"><p>Chưa thể tải danh sách chuyên khoa.</p><button type="button" class="doctor-filter-reset" onclick="initializeDoctors()">Thử lại</button></div>';
    return;
  }
  if (!systemSpecialties.length) {
    grid.innerHTML = '<p class="booking-inline-status" role="status">Hiện chưa có chuyên khoa đang hoạt động.</p>';
    return;
  }
  grid.innerHTML = systemSpecialties.map(specialty => {
    const presentation = SPECIALTY_PRESENTATION[specialty.id] || {};
    return `
      <div class="specialty-card" style="align-items:center;">
        <div class="specialty-icon" style="margin-bottom:10px;"><i class="fa-solid ${escapeDoctorMarkup(presentation.icon || 'fa-stethoscope')}" aria-hidden="true"></i></div>
        <h3 class="specialty-name">${escapeDoctorMarkup(presentation.label || specialty.name)}</h3>
        <p class="specialty-desc">${escapeDoctorMarkup(preventOrphanWord(specialty.description || ''))}</p>
        <button type="button" class="specialty-action" data-home-doctor-specialty="${escapeDoctorMarkup(specialty.id)}">Xem bác sĩ <span aria-hidden="true">→</span></button>
      </div>
    `;
  }).join('');
}

function populateDoctorFilters() {
  const homeSelect = document.getElementById('homeDoctorSpecFilter');
  const pageSelect = document.getElementById('pageDoctorSelect');
  const sidebar = document.getElementById('specialtySidebarList');
  const options = systemSpecialties.map(specialty => {
    const label = SPECIALTY_PRESENTATION[specialty.id]?.label || specialty.name;
    return `<option value="${escapeDoctorMarkup(specialty.id)}">${escapeDoctorMarkup(label)}</option>`;
  }).join('');

  if (homeSelect) homeSelect.innerHTML = '<option value="">Tất cả chuyên khoa</option>' + options;
  if (pageSelect) pageSelect.innerHTML = '<option value="">Tất cả chuyên khoa</option>' + options;

  if (sidebar) {
    sidebar.innerHTML = `
      <li><a href="#" class="active" data-spec=""><i class="fa-solid fa-border-all" aria-hidden="true"></i> Tất cả</a></li>
      ${systemSpecialties.map(specialty => {
        const presentation = SPECIALTY_PRESENTATION[specialty.id] || {};
        return `<li><a href="#" data-spec="${escapeDoctorMarkup(specialty.id)}"><i class="fa-solid ${escapeDoctorMarkup(presentation.icon || 'fa-stethoscope')}" aria-hidden="true"></i> ${escapeDoctorMarkup(presentation.label || specialty.name)}</a></li>`;
      }).join('')}
    `;
  }
}

function showDoctorDetails(doctor) {
  const modal = document.getElementById('doctorDetailModal');
  const body = document.getElementById('doctorModalBody');
  if (!modal || !body) return;

  body.innerHTML = `
    <button type="button" class="doctor-detail-close" aria-label="Đóng hồ sơ bác sĩ">&times;</button>
    <img class="doctor-detail-avatar" src="${escapeDoctorMarkup(doctor.avatar)}" alt="Ảnh minh họa bác sĩ ${escapeDoctorMarkup(doctor.full_name)}">
    <span class="doctor-avatar-label doctor-detail-avatar-label">Ảnh minh họa</span>
    <span class="doctor-spec-tag">${escapeDoctorMarkup(SPECIALTY_PRESENTATION[doctor.specialty_id]?.label || systemSpecialties.find(item => item.id === doctor.specialty_id)?.name || doctor.specialty_name)}</span>
    <h2 class="doctor-detail-name" id="doctorDetailName">${escapeDoctorMarkup(doctor.full_name)}</h2>
    <p class="doctor-bio">${escapeDoctorMarkup(preventOrphanWord(doctor.bio))}</p>
    <div class="doctor-meta-list">
      <div class="doctor-meta-item"><i class="fa-regular fa-clock" aria-hidden="true"></i><span>${escapeDoctorMarkup(doctor.experience_years)} năm kinh nghiệm</span></div>
      <div class="doctor-meta-item"><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span>${escapeDoctorMarkup(doctor.room)}</span></div>
    </div>
    <button type="button" class="btn btn-primary doctor-detail-book" data-doctor-action="book" data-doctor-id="${escapeDoctorMarkup(doctor.id)}" ${doctor.bookingAvailable ? '' : 'disabled'}>Đặt lịch khám</button>
  `;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  body.querySelector('.doctor-detail-close')?.focus();
}

function closeDoctorDetails() {
  const modal = document.getElementById('doctorDetailModal');
  if (!modal) return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
}

function handleDoctorAction(event) {
  const actionButton = event.target.closest('[data-doctor-action]');
  if (!actionButton) return;

  const doctor = systemDoctors.find(item => String(item.id) === actionButton.dataset.doctorId);
  if (!doctor) {
    console.error(`Không tìm thấy hồ sơ bác sĩ có ID ${actionButton.dataset.doctorId}`);
    return;
  }

  if (actionButton.dataset.doctorAction === 'book') {
    closeDoctorDetails();
    quickBookDoctor(doctor.id);
  } else if (actionButton.dataset.doctorAction === 'details') {
    showDoctorDetails(doctor);
  }
}

const DOCTOR_AVATAR_BACKGROUNDS = [
  '#e3f5ef', '#e5f2f7', '#f7e9ed', '#e8eef8',
  '#edf2e5', '#f8efe2', '#e2f0f3', '#f3eafa'
];

const FEMALE_AVATAR_HAIRSTYLES = [
  {
    back: '<path d="M243 132c-9 20-10 43-4 65l12 15 8-67-7-25Zm154 0c9 20 10 43 4 65l-12 15-8-67 7-25Z" fill="#263c3a"/>',
    front: '<path d="M239 155c0-57 34-95 81-95s81 38 81 95c-17-19-35-29-55-35-10-3-20-4-29-3-29 2-54 15-78 38Z" fill="#263c3a"/>'
  },
  {
    back: '<path d="M243 132c-9 20-10 43-4 65l12 15 8-67-7-25Zm154 0c9 20 10 43 4 65l-12 15-8-67 7-25Z" fill="#263c3a"/>',
    front: '<path d="M239 154c3-56 36-94 82-94 42 0 74 31 80 79-18-18-36-29-57-34-12-3-23-3-34 0 15 7 25 18 30 33-26-15-60-12-101 16Z" fill="#263c3a"/><path d="M327 77c-7 15-8 30-2 44" fill="none" stroke="#617c75" stroke-width="4" stroke-linecap="round"/>'
  },
  {
    back: '<path d="M245 121c-14 28-18 70-12 111l9 54 20 8 12-16-8-79-3-61Zm150 0c14 28 18 70 12 111l-9 54-20 8-12-16 8-79 3-61Z" fill="#263c3a"/>',
    front: '<path d="M239 154c0-57 34-95 81-95s81 38 81 95c-18-20-39-31-61-35-34-6-68 7-101 35Z" fill="#263c3a"/><path d="M256 132c-4 20-3 36 1 50m127-50c4 20 3 36-1 50" fill="none" stroke="#617c75" stroke-width="3" stroke-linecap="round"/>'
  },
  {
    back: '<path d="M288 73c-8-17 0-38 17-47 18-10 43-7 54 9 10 14 7 32-6 44-16-8-48-9-65-6Z M243 132c-9 20-10 43-4 65l12 15 8-67-7-25Zm154 0c9 20 10 43 4 65l-12 15-8-67 7-25Z" fill="#263c3a"/>',
    front: '<path d="M241 155c4-53 34-88 79-88 40 0 70 31 78 78-23-18-47-27-71-25-30 2-58 14-86 35Z" fill="#263c3a"/>'
  }
];

function createStableDoctorAvatar(doctor) {
  const doctorId = Number(doctor.id);
  const variant = Number.isInteger(doctorId) && doctorId > 0
    ? ((doctorId - 1) % DOCTOR_AVATAR_BACKGROUNDS.length) + 1
    : 1;
  const gender = variant % 2 === 0 ? 'female' : 'male';
  const avatar = createDoctorPlaceholder(
    String(doctor.name || ''),
    DOCTOR_AVATAR_BACKGROUNDS[variant - 1],
    gender,
    variant
  );
  if (gender !== 'female') return avatar;

  const svg = decodeURIComponent(avatar.slice('data:image/svg+xml,'.length));
  const face = '<circle cx="320" cy="170" r="82" fill="#f1c8ad"/>';
  const hair = svg.match(/<path d="[^"]+" fill="#263c3a"\/>/)?.[0];
  if (!hair || !svg.includes(face)) {
    console.error('Không thể áp dụng kiểu tóc SVG cho avatar bác sĩ nữ.');
    return avatar;
  }

  const hairstyleIndex = Math.floor((variant - 1) / 2) % FEMALE_AVATAR_HAIRSTYLES.length;
  const hairstyle = FEMALE_AVATAR_HAIRSTYLES[hairstyleIndex];
  const layeredSvg = svg.replace(`${face}${hair}`, `${hairstyle.back}${face}${hairstyle.front}`);
  return `data:image/svg+xml,${encodeURIComponent(layeredSvg)}`;
}

async function initializeDoctors() {
  const requestId = ++publicDirectoryRequestId;
  specialtiesLoading = true;
  specialtiesLoadError = '';
  doctorsLoading = true;
  doctorsLoadError = '';
  renderSpecialtyCards();
  renderDoctorLists();
  renderBookingStep();

  const [specialtiesResult, doctorsResult] = await Promise.allSettled([
    fetchSpecialtiesList(),
    fetchDoctorsList()
  ]);
  if (requestId !== publicDirectoryRequestId) return;
  if (specialtiesResult.status === 'fulfilled') {
    systemSpecialties = specialtiesResult.value;
  } else {
    systemSpecialties = [];
    specialtiesLoadError = 'specialties';
    console.error('Không thể tải danh sách chuyên khoa:', specialtiesResult.reason?.message);
  }
  if (doctorsResult.status === 'fulfilled') {
    systemDoctors = doctorsResult.value.map(doctor => ({
      ...doctor,
      avatar: createStableDoctorAvatar(doctor)
    }));
  } else {
    systemDoctors = [];
    doctorsLoadError = 'doctors';
    console.error('Không thể tải danh sách bác sĩ:', doctorsResult.reason?.message);
  }
  specialtiesLoading = false;
  doctorsLoading = false;
  populateDoctorFilters();
  renderSpecialtyCards();
  renderDoctorLists();
  renderBookingStep();

  ['homeDoctorSearch', 'pageDoctorSearch'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', renderDoctorLists);
  });

  ['homeDoctorSpecFilter', 'pageDoctorSelect'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', event => {
      if (id === 'pageDoctorSelect') {
        const activeLink = document.querySelector('#specialtySidebarList [data-spec].active');
        activeLink?.classList.remove('active');
        document.querySelector(`#specialtySidebarList [data-spec="${CSS.escape(event.target.value)}"]`)?.classList.add('active');
      }
      renderDoctorLists();
    });
  });

  const homeSelect = document.getElementById('homeDoctorSpecFilter');
  if (pendingHomeDoctorSpecialty && Array.from(homeSelect?.options || []).some(option => option.value === pendingHomeDoctorSpecialty)) {
    homeSelect.value = pendingHomeDoctorSpecialty;
    pendingHomeDoctorSpecialty = '';
    homeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }

  document.getElementById('homeDoctorsGrid')?.addEventListener('click', event => {
    if (!event.target.closest('[data-doctor-filter-reset]')) return;
    document.getElementById('homeDoctorSearch').value = '';
    document.getElementById('homeDoctorSpecFilter').value = '';
    renderDoctorLists();
  });

  document.getElementById('specialtySidebarList')?.addEventListener('click', event => {
    const link = event.target.closest('[data-spec]');
    if (!link) return;
    event.preventDefault();
    document.querySelectorAll('#specialtySidebarList [data-spec]').forEach(item => item.classList.toggle('active', item === link));
    const pageSelect = document.getElementById('pageDoctorSelect');
    if (pageSelect) pageSelect.value = link.dataset.spec;
    renderDoctorLists();
  });

  ['homeDoctorsGrid', 'pageDoctorsGrid', 'doctorModalBody'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', handleDoctorAction);
  });

  const modal = document.getElementById('doctorDetailModal');
  modal?.addEventListener('click', event => {
    if (event.target === modal || event.target.closest('.doctor-detail-close')) closeDoctorDetails();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeDoctorDetails();
  });
}

function renderHeroCalendar(selectedDate = new Date()) {
  const title = document.getElementById('heroCalendarTitle');
  const daysGrid = document.getElementById('heroCalendarDays');
  const hours = document.getElementById('heroClinicHours');
  const status = document.getElementById('heroScheduleStatus');
  if (!title || !daysGrid || !hours || !status) return;

  const selected = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
  const weekdayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const weekdayLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  const monday = new Date(selected);
  monday.setDate(selected.getDate() - ((selected.getDay() + 6) % 7));

  title.textContent = `${weekdayNames[selected.getDay()]}, ${selected.getDate()} tháng ${selected.getMonth() + 1}`;
  daysGrid.innerHTML = weekdayLabels.map((label, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const isSelected = date.getTime() === selected.getTime();
    const isSunday = index === 6;
    const dateValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const dayNumberClass = isSelected ? 'day-number-active' : 'day-number-text';

    return `
      <button type="button" class="mini-day${isSelected ? ' active' : ''}${isSunday ? ' is-sunday' : ''}" data-hero-calendar-date="${dateValue}" aria-pressed="${isSelected}" aria-label="${label}, ${date.getDate()} tháng ${date.getMonth() + 1}">
        <span class="mini-day-label">${label}</span>
        <span class="${dayNumberClass}">${date.getDate()}</span>
      </button>
    `;
  }).join('');

  const isSunday = selected.getDay() === 0;
  const isSaturday = selected.getDay() === 6;
  status.textContent = isSunday ? '• Nghỉ Chủ nhật' : '• Đang nhận lịch';
  status.classList.toggle('is-closed', isSunday);
  hours.textContent = isSunday
    ? 'Phòng khám nghỉ Chủ nhật'
    : isSaturday
      ? 'Giờ khám: 08:00–11:30 (Chiều nghỉ)'
      : 'Giờ khám: 08:00–11:30 · 13:30–17:00';
}

document.addEventListener('DOMContentLoaded', () => {
  const calendarDays = document.getElementById('heroCalendarDays');
  calendarDays?.addEventListener('click', event => {
    const dayButton = event.target.closest('[data-hero-calendar-date]');
    if (!dayButton) return;

    const [year, month, day] = dayButton.dataset.heroCalendarDate.split('-').map(Number);
    const selectedDate = new Date(year, month - 1, day);
    if (Number.isNaN(selectedDate.getTime())) {
      console.error('Ngày được chọn trên lịch Hero không hợp lệ.');
      return;
    }
    renderHeroCalendar(selectedDate);
  });
  renderHeroCalendar();

  document.getElementById('specialtyCardsGrid')?.addEventListener('click', event => {
    const specialtyButton = event.target.closest('[data-home-doctor-specialty]');
    if (!specialtyButton) return;

    const specialtyId = specialtyButton.dataset.homeDoctorSpecialty;
    switchView('home');
    window.setTimeout(() => showHomeDoctorsBySpecialty(specialtyId), 80);
  });

  initializeDoctors();

  const params = new URLSearchParams(window.location.search);
  const requestedView = params.get('view');
  if (requestedView === 'specialties' || requestedView === 'doctors') {
    switchView(requestedView);
  } else if (params.get('action') === 'booking') {
    startBooking();
  } else if (params.get('section') === 'lookup') {
    scrollToHomeSection('tra-cuu-lich-hen', 'lookup');
  }
});