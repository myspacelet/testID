// ========================================================
// 🔧 НАСТРОЙКИ И ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ========================================================
const SUPABASE_URL = "https://rvukyvwgpondpfxvjoju.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_JinHB8pKvvmIkIkIFRjF4A_BXnnC0rD";

// Инициализация Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentOperatorName = 'Оператор';
let currentRole = null;
let selectedChannel = null;

// ========================================================
// 🚀 ПРОВЕРКА АВТОРИЗАЦИИ И МАРШРУТИЗАЦИЯ
// ========================================================
window.addEventListener('DOMContentLoaded', async () => {
    const loader = document.getElementById('auth-loader');
    const channelScreen = document.getElementById('channel-screen');
    const btnBackToId = document.getElementById('btn-back-to-id');

    try {
        // 1. Проверяем, есть ли активная сессия
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (!session) {
            // Если сессии нет, безжалостно выкидываем на страницу логина
            window.location.href = 'index.html';
            return;
        }

        currentUser = session.user;

        // 2. Узнаем, кто именно зашел (ищем роль и имя)
        const { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('role, full_name, approved')
            .eq('id', currentUser.id)
            .single();

        if (error || !profile || profile.approved !== true) {
            window.location.href = 'index.html';
            return;
        }

        currentRole = profile.role || 'op';
        currentOperatorName = profile.full_name || 'Оператор';

        // 3. ЖЕСТКАЯ МАРШРУТИЗАЦИЯ (RBAC)
        if (currentRole === 'id') {
            // Обычным операторам ИД 2.0 тут делать нечего — отправляем их домой
            window.location.href = 'index.html';
            return;
        }

        // Если это 'op' или 'admin' — пускаем!
        loader.classList.add('hide');
        channelScreen.classList.remove('hide');

        // Если это админ, показываем ему кнопку возврата в ИД 2.0
        if (currentRole === 'admin' && btnBackToId) {
            btnBackToId.classList.remove('hide');
        }

    } catch (err) {
        console.error("Ошибка проверки сессии:", err);
        window.location.href = 'index.html';
    }
});

// ========================================================
// 📞 ВЫБОР КАНАЛА СВЯЗИ
// ========================================================
function selectChannel(channelCode) {
    selectedChannel = channelCode;
    
    // Прячем меню выбора канала и показываем основное приложение
    document.getElementById('channel-screen').classList.add('hide');
    document.getElementById('breaks-app').classList.remove('hide');
    
    // Запускаем отрисовку интерфейса оператора
    renderOperatorUI();
    
    console.log(`🚀 Запуск панели перерывов для канала: ${selectedChannel}`);
}

// ========================================================
// ⏱️ ГЕНЕРАЦИЯ И ОТРИСОВКА ИНТЕРВАЛОВ
// ========================================================

// Лимиты для Горячей линии
const LIMITS = {
    breaks: 4,
    lunches: 1
};

// Заглушки для выбранных слотов (потом будем брать из базы)
let mySelectedBreaks = 0;
let mySelectedLunches = 0;

// Утилита: прибавляет минуты к времени "HH:MM"
function addMinutes(timeStr, minsToAdd) {
    let [h, m] = timeStr.split(':').map(Number);
    m += minsToAdd;
    h += Math.floor(m / 60);
    m = m % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Генератор списка слотов
function generateSlots(startTime, endTime, durationMins) {
    let slots = [];
    let current = startTime;
    while (current < endTime) {
        let next = addMinutes(current, durationMins);
        if (next > endTime) break;
        slots.push(`${current}-${next}`);
        current = next;
    }
    return slots;
}

// Рендер интерфейса оператора
function renderOperatorUI() {
    document.getElementById('op-dashboard').classList.remove('hide');
    document.getElementById('op-id-display').innerText = currentOperatorName;
    document.getElementById('op-channel-display').innerText = 
        selectedChannel === 'HL' ? 'ГОРЯЧАЯ ЛИНИЯ' : (selectedChannel === 'LIVE' ? 'ЧАТ LIVETEX' : 'ЧАТ НОЧЬ');

    const breaksContainer = document.getElementById('breaks-10-container');
    const lunchesContainer = document.getElementById('lunches-30-container');

    // Генерируем с 08:00 до 19:30
    const hlBreaks = generateSlots('08:00', '19:30', 10);
    const hlLunches = generateSlots('08:00', '19:30', 30);

    // Отрисовываем перерывы
    breaksContainer.innerHTML = hlBreaks.map(slot => `
        <div class="mac-slot" onclick="handleSlotClick(this, 'break', '${slot}')">${slot}</div>
    `).join('');

    // Отрисовываем обеды
    lunchesContainer.innerHTML = hlLunches.map(slot => `
        <div class="mac-slot" onclick="handleSlotClick(this, 'lunch', '${slot}')">${slot}</div>
    `).join('');
}

// Обработка клика по слоту (Проверка лимитов)
function handleSlotClick(element, type, timeString) {
    // Проверяем лимиты
    if (type === 'break' && mySelectedBreaks >= LIMITS.breaks) {
        alert("Вы достигли лимита: 4 перерыва.");
        return;
    }
    if (type === 'lunch' && mySelectedLunches >= LIMITS.lunches) {
        alert("Вы достигли лимита: 1 обед.");
        return;
    }

    // Если всё ок - "бронируем" слот визуально
    element.classList.add('my');
    element.onclick = null; // Отключаем повторный клик

    // Увеличиваем счетчик
    if (type === 'break') mySelectedBreaks++;
    if (type === 'lunch') mySelectedLunches++;

    // Добавляем тег наверх
    const tagsContainer = document.getElementById('my-booked-tags');
    const tag = document.createElement('div');
    tag.className = 'my-tag';
    tag.innerText = timeString;
    tagsContainer.appendChild(tag);

    // TODO: Здесь будет отправка данных в Supabase (hl_v и global_log)
    console.log(`Забронирован ${type}: ${timeString}`);
}

// Функция выхода
function logout() {
    if (confirm("Выйти из системы?")) {
        supabaseClient.auth.signOut().then(() => {
            window.location.href = 'index.html';
        });
    }
}