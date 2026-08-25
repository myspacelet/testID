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

// Счетчики выбранных слотов (пока локальные)
let mySelectedBreaks = 0;
let mySelectedLunches = 0;

// Асинхронный рендер интерфейса оператора (качает слоты из БД)
async function renderOperatorUI() {
    document.getElementById('op-dashboard').classList.remove('hide');
    document.getElementById('op-id-display').innerText = currentOperatorName;
    document.getElementById('op-channel-display').innerText = 
        selectedChannel === 'HL' ? 'ГОРЯЧАЯ ЛИНИЯ' : (selectedChannel === 'LIVE' ? 'ЧАТ LIVETEX' : 'ЧАТ НОЧЬ');

    const breaksContainer = document.getElementById('breaks-10-container');
    const lunchesContainer = document.getElementById('lunches-30-container');

    // Ставим индикатор загрузки, пока ждем ответ от Supabase
    breaksContainer.innerHTML = '<div style="text-align:center; padding:15px; font-size:13px; color:var(--text-muted);">⏳ Загрузка...</div>';
    lunchesContainer.innerHTML = '<div style="text-align:center; padding:15px; font-size:13px; color:var(--text-muted);">⏳ Загрузка...</div>';

    try {
        // 1. Запрашиваем актуальный справочник интервалов для выбранного канала
        const { data: intervals, error } = await supabaseClient
            .from('intervals_config')
            .select('type, time_slot')
            .eq('channel', selectedChannel)
            .order('time_slot', { ascending: true }); // Сортируем по времени (А-Я)

        if (error) throw error;

        // 2. Раскладываем полученные данные по двум массивам
        const breaksList = intervals.filter(i => i.type === 'break10').map(i => i.time_slot);
        const lunchesList = intervals.filter(i => i.type === 'lunch30').map(i => i.time_slot);

        // TODO: Здесь мы позже добавим проверку таблицы бронирований (hl_v), чтобы делать слоты серыми

        // 3. Отрисовываем ПЕРЕРЫВЫ
        if (breaksList.length > 0) {
            breaksContainer.innerHTML = breaksList.map(slot => `
                <div class="mac-slot" onclick="handleSlotClick(this, 'break', '${slot}')">${slot}</div>
            `).join('');
        } else {
            breaksContainer.innerHTML = '<div style="text-align:center; font-size:12px; color:var(--text-muted);">Нет доступных интервалов</div>';
        }

        // 4. Отрисовываем ОБЕДЫ
        if (lunchesList.length > 0) {
            lunchesContainer.innerHTML = lunchesList.map(slot => `
                <div class="mac-slot" onclick="handleSlotClick(this, 'lunch', '${slot}')">${slot}</div>
            `).join('');
        } else {
            lunchesContainer.innerHTML = '<div style="text-align:center; font-size:12px; color:var(--text-muted);">Нет доступных интервалов</div>';
        }

    } catch (err) {
        console.error("Ошибка загрузки интервалов:", err);
        breaksContainer.innerHTML = '<div style="color:var(--danger); text-align:center; font-size:12px;">Ошибка загрузки базы</div>';
        lunchesContainer.innerHTML = '<div style="color:var(--danger); text-align:center; font-size:12px;">Ошибка загрузки базы</div>';
    }
}

// Обработка клика по слоту (Проверка лимитов)
function handleSlotClick(element, type, timeString) {
    if (element.classList.contains('booked') || element.classList.contains('my')) return;

    if (type === 'break' && mySelectedBreaks >= LIMITS.breaks) {
        alert("Вы достигли лимита: 4 перерыва.");
        return;
    }
    if (type === 'lunch' && mySelectedLunches >= LIMITS.lunches) {
        alert("Вы достигли лимита: 1 обед.");
        return;
    }

    // Визуальная "бронь"
    element.classList.add('my');

    if (type === 'break') mySelectedBreaks++;
    if (type === 'lunch') mySelectedLunches++;

    const tagsContainer = document.getElementById('my-booked-tags');
    const tag = document.createElement('div');
    tag.className = 'my-tag';
    tag.innerText = timeString;
    
    // ДОБАВЛЯЕМ ЛОГИКУ КЛИКА (Уход на перерыв)
    tag.onclick = function() {
        if (confirm(`Выйти в перерыв? ${timeString}`)) {
            // Если оператор нажал "ОК"
            this.classList.add('finished');
            
            // TODO: Отправим запись "ФИНИШ" в global_log в базе Supabase
            console.log(`ФИНИШ: ${timeString}`);
        }
    };

    tagsContainer.appendChild(tag);

    // TODO: Запись "БРОНЬ" в таблицу канала (hl_v) и в global_log
    console.log(`БРОНЬ: ${timeString}`);
}

// Функция выхода
function logout() {
    if (confirm("Выйти из системы?")) {
        supabaseClient.auth.signOut().then(() => {
            window.location.href = 'index.html';
        });
    }
}

// ========================================================
// 🌓 ТЕМА ОФОРМЛЕНИЯ
// ========================================================
function toggleTheme() {
    // Переключаем именно класс dark-mode
    const isDark = document.body.classList.toggle('dark-mode');
    
    // Запоминаем выбор
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    
    // Меняем иконку (показываем текущую тему)
    const btn = document.getElementById('theme-btn');
    if (btn) btn.innerText = isDark ? '🌙' : '☀️';
}

// Проверяем тему при старте страницы
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') { 
    document.body.classList.add('dark-mode'); 
} else if (savedTheme === 'light') {
    document.body.classList.remove('dark-mode');
}

// Синхронизируем иконку кнопки после полной загрузки DOM
window.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('theme-btn');
    if (btn) {
        btn.innerText = document.body.classList.contains('dark-mode') ? '🌙' : '☀️';
    }
});