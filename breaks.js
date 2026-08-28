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

        currentRole = profile.role; // Убрали заглушку || 'op'
        currentOperatorName = profile.full_name || 'Оператор';

        // 🛑 ЖЕСТКАЯ ПРОВЕРКА: Если роли вообще нет или она кривая - на выход
        if (!currentRole || !['op', 'id', 'admin'].includes(currentRole)) {
            await supabaseClient.auth.signOut();
            window.location.href = 'index.html';
            return;
        }

        // 3. ЖЕСТКАЯ МАРШРУТИЗАЦИЯ (RBAC)
        if (currentRole === 'id') {
            // Обычным операторам ИД 2.0 тут делать нечего — отправляем их домой
            window.location.href = 'index.html';
            return;
        }

        // Если это 'op' или 'admin' — пускаем!
        loader.classList.add('hide');

        // 🧠 ПРОВЕРЯЕМ ПАМЯТЬ БРАУЗЕРА
        const savedChannel = localStorage.getItem('savedChannel');
        if (savedChannel) {
            // Если канал уже был выбран — сразу загружаем его
            selectChannel(savedChannel);
        } else {
            // Если нет — показываем окно выбора
            channelScreen.classList.remove('hide');
        }

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
    localStorage.setItem('savedChannel', channelCode); 
    
    // Прячем меню выбора канала и показываем основное приложение
    document.getElementById('channel-screen').classList.add('hide');
    document.getElementById('breaks-app').classList.remove('hide');
    
    // Запускаем отрисовку интерфейса оператора
    renderOperatorUI();
    
    console.log(`🚀 Запуск панели перерывов для канала: ${selectedChannel}`);
}

// ========================================================
// ⏱️ КОНФИГУРАЦИЯ КАНАЛОВ И СЧЕТЧИКИ
// ========================================================

// Гибкая настройка для каждого канала
const CHANNEL_CONFIG = {
    'HL': {
        columns: [
            { type: 'break10', title: 'Перерывы (10 мин)', limit: 4 },
            { type: 'lunch30', title: 'Обеды (30 мин)', limit: 1 }
        ]
    },
    'LIVE': {
        columns: [
            { type: 'break15', title: 'Перерывы (15 мин)', limit: 2 },
            { type: 'break20', title: 'Перерывы (20 мин)', limit: 1 },
            { type: 'lunch40', title: 'Обеды (40 мин)', limit: 1 }
        ]
    },
    'NIGHT': {
        columns: [
            { type: 'break15', title: 'Перерывы (15 мин)', limit: 2 },
            { type: 'break20', title: 'Перерывы (20 мин)', limit: 1 },
            { type: 'lunch40', title: 'Обеды (40 мин)', limit: 1 }
        ]
    }
};

// Динамическое хранилище выбранных слотов (например: { break15: 2, lunch40: 0 })
let mySelections = {};

// ========================================================
// 🔢 ОБНОВЛЕНИЕ СЧЕТЧИКОВ
// ========================================================
function updateCounters() {
    if (!selectedChannel) return;
    
    const config = CHANNEL_CONFIG[selectedChannel].columns;
    
    config.forEach(col => {
        const selectedCount = mySelections[col.type] || 0;
        const left = Math.max(0, col.limit - selectedCount);
        
        const counterEl = document.getElementById(`counter-${col.type}`);
        if (counterEl) {
            counterEl.innerText = `Доступно: ${left} шт.`;
            counterEl.style.color = left === 0 ? '#ff5f56' : 'var(--text-muted)';
        }
    });
}

// Асинхронный рендер интерфейса оператора
async function renderOperatorUI() {
    document.getElementById('op-dashboard').classList.remove('hide');
    document.getElementById('op-id-display').innerText = currentOperatorName;
    document.getElementById('op-channel-display').innerText = 
        selectedChannel === 'HL' ? 'ГОРЯЧАЯ ЛИНИЯ' : (selectedChannel === 'LIVE' ? 'ЧАТ LIVETEX' : 'ЧАТ LIVETEX НОЧЬ');

    const gridContainer = document.getElementById('dynamic-slots-grid');
    const tagsContainer = document.getElementById('my-booked-tags');
    tagsContainer.innerHTML = '';
    
    // Получаем настройки текущего канала
    const currentConfig = CHANNEL_CONFIG[selectedChannel].columns;

    // 1. Строим HTML-каркас колонок на лету
    gridContainer.innerHTML = currentConfig.map(col => `
        <div class="slots-col">
            <h3 class="slots-title">${col.title}</h3>
            <div id="counter-${col.type}" class="slots-counter">Доступно: ${col.limit} шт.</div>
            <div id="container-${col.type}" class="slots-container">
                <div style="text-align:center; padding:15px; font-size:13px; color:var(--text-muted);">⏳ Загрузка...</div>
            </div>
        </div>
    `).join('');

    // Сбрасываем локальные счетчики
    mySelections = {};
    currentConfig.forEach(col => mySelections[col.type] = 0);

    try {
        // 2. Качаем данные из базы
        const { data: intervals, error } = await supabaseClient
            .from('intervals_config')
            .select('type, time_slot')
            .eq('channel', selectedChannel)
            .order('time_slot', { ascending: true });

        if (error) throw error;

        const { data: activeBookings, error: bookingsError } = await supabaseClient
            .from('active_breaks')
            .select('*')
            .eq('channel', selectedChannel);

        if (bookingsError) throw bookingsError;

        const { data: finishLogs, error: logsError } = await supabaseClient
            .from('global_log')
            .select('time_slot')
            .eq('channel', selectedChannel)
            .eq('user_id', currentUser.id)
            .eq('action', 'ФИНИШ');
            
        const finishedSlots = finishLogs ? finishLogs.map(l => l.time_slot) : [];

        // Вспомогательная функция сборки кнопки
        const buildSlotHTML = (slot, type) => {
            const booking = activeBookings.find(b => b.time_slot === slot);
            if (booking) {
                if (booking.user_id === currentUser.id) {
                    return `<div class="mac-slot my" onclick="handleSlotClick(this, '${type}', '${slot}')">${slot}</div>`;
                } else {
                    return `<div class="mac-slot booked" title="Занято: ${booking.operator_name}">${slot}</div>`;
                }
            }
            return `<div class="mac-slot" onclick="handleSlotClick(this, '${type}', '${slot}')">${slot}</div>`;
        };

        // 3. Распределяем интервалы по колонкам
        currentConfig.forEach(col => {
            const container = document.getElementById(`container-${col.type}`);
            const typeIntervals = intervals.filter(i => i.type === col.type).map(i => i.time_slot);
            
            container.innerHTML = typeIntervals.length > 0 
                ? typeIntervals.map(slot => buildSlotHTML(slot, col.type)).join('') 
                : '<div style="text-align:center; font-size:12px; color:var(--text-muted);">Нет интервалов</div>';
                
            // Подсчитываем, сколько мы уже заняли в этой колонке
            mySelections[col.type] = activeBookings.filter(b => b.user_id === currentUser.id && typeIntervals.includes(b.time_slot)).length;
        });

        updateCounters();

        // 4. ВОССТАНАВЛИВАЕМ ТЕГИ СВЕРХУ
        const myBookings = activeBookings.filter(b => b.user_id === currentUser.id);
        myBookings.sort((a, b) => a.time_slot.localeCompare(b.time_slot));

        myBookings.forEach(booking => {
            const timeString = booking.time_slot;
            const tag = document.createElement('div');
            tag.className = 'my-tag';
            
            const textSpan = document.createElement('span');
            textSpan.innerText = timeString;
            tag.appendChild(textSpan);

            const closeBtn = document.createElement('button');
            closeBtn.className = 'tag-close-btn';
            closeBtn.innerHTML = '✕';
            closeBtn.onclick = (e) => { e.stopPropagation(); cancelBooking(tag, timeString); };
            tag.appendChild(closeBtn);

            tag.onclick = (e) => { if(e.target !== closeBtn) finishBreak(tag, timeString); };
            
            if (finishedSlots.includes(timeString)) {
                tag.classList.add('finished');
                const storageKey = `timer_target_${timeString}`;
                const savedTarget = localStorage.getItem(storageKey);
                
                if (savedTarget && parseInt(savedTarget, 10) > Date.now()) {
                    startIronTimer(tag, timeString, true);
                } else {
                    textSpan.innerText = `${timeString} (Завершен)`;
                    tag.style.color = 'var(--text-muted)';
                }
            }
            tagsContainer.appendChild(tag);
        });

    } catch (err) {
        console.error("Ошибка загрузки:", err);
        gridContainer.innerHTML = '<div style="color:var(--danger); text-align:center; width: 100%;">Ошибка загрузки базы данных</div>';
    }
}

// Обработка клика по слоту
async function handleSlotClick(element, type, timeString) {
    if (element.classList.contains('booked') || element.classList.contains('my')) return;

    // Находим лимит для текущего типа слота (например, break15)
    const columnConfig = CHANNEL_CONFIG[selectedChannel].columns.find(c => c.type === type);
    
    if (mySelections[type] >= columnConfig.limit) {
        alert(`Вы достигли лимита: ${columnConfig.limit} шт. для "${columnConfig.title}".`);
        return;
    }

    element.style.pointerEvents = 'none';
    element.innerText = '⏳';
    element.style.opacity = '0.6';

    try {
        const { error: insertError } = await supabaseClient
            .from('active_breaks')
            .insert([{ operator_name: currentOperatorName, channel: selectedChannel, time_slot: timeString, user_id: currentUser.id }]);

        if (insertError) throw insertError;

        await supabaseClient
            .from('global_log')
            .insert([{ operator_name: currentOperatorName, channel: selectedChannel, action: 'БРОНЬ', time_slot: timeString, user_id: currentUser.id }]);

        element.classList.add('my');
        element.innerText = timeString;
        element.style.pointerEvents = 'auto';
        element.style.opacity = '1';

        // Увеличиваем динамический счетчик
        mySelections[type]++;
        updateCounters();

        const tagsContainer = document.getElementById('my-booked-tags');
        const tag = document.createElement('div');
        tag.className = 'my-tag';
        
        const textSpan = document.createElement('span');
        textSpan.innerText = timeString;
        tag.appendChild(textSpan);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'tag-close-btn';
        closeBtn.innerHTML = '✕';
        closeBtn.onclick = (e) => { e.stopPropagation(); cancelBooking(tag, timeString); };
        tag.appendChild(closeBtn);

        tag.onclick = (e) => { if(e.target !== closeBtn) finishBreak(tag, timeString); };
        
        const existingTags = Array.from(tagsContainer.children);
        const nextNode = existingTags.find(t => t.innerText > timeString);

        if (nextNode) {
            tagsContainer.insertBefore(tag, nextNode);
        } else {
            tagsContainer.appendChild(tag);
        }

    } catch (err) {
        console.error(err);
        alert("❌ Слот уже занят или произошла ошибка соединения!");
        element.innerText = timeString;
        element.style.pointerEvents = 'auto';
        element.style.opacity = '1';
    }
}

// Функция выхода
function logout() {
    if (confirm("Выйти из системы?")) {
        localStorage.removeItem('savedChannel'); // 👈 ОЧИЩАЕМ ПАМЯТЬ
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

// ========================================================
// ⬅️ ВОЗВРАТ К ВЫБОРУ КАНАЛА
// ========================================================
function goToChannelSelection() {
    // Стираем сохраненный канал из памяти
    localStorage.removeItem('savedChannel');
    
    // Прячем всё приложение перерывов целиком
    document.getElementById('breaks-app').classList.add('hide');
    
    // Сбрасываем дашборд оператора (чтобы при следующем входе не висели старые теги)
    document.getElementById('op-dashboard').classList.add('hide');
    document.getElementById('my-booked-tags').innerHTML = '';
    mySelectedBreaks = 0;
    mySelectedLunches = 0;
    
    // Показываем обратно экран выбора канала
    document.getElementById('channel-screen').classList.remove('hide');
    
    // Сбрасываем переменную выбранного канала
    selectedChannel = null;
    
    console.log("🔄 Возврат к выбору канала связи");
}

// ========================================================
// 🏷️ ЛОГИКА ТЕГОВ (ФИНИШ И ОТМЕНА)
// ========================================================

// Уход на перерыв (клик по самому тегу)
async function finishBreak(tagElement, timeString) {
    if (tagElement.classList.contains('finished')) return;

    if (confirm(`Выйти в перерыв? ${timeString}`)) {
        tagElement.classList.add('finished'); 
        
        // 👈 ЗАПУСКАЕМ ТАЙМЕР
        startIronTimer(tagElement, timeString);
        
        await supabaseClient.from('global_log').insert([{
            operator_name: currentOperatorName,
            channel: selectedChannel,
            action: 'ФИНИШ',
            time_slot: timeString,
            user_id: currentUser.id
        }]);
        
        console.log(`✅ ФИНИШ записан: ${timeString}`);
    }
}

// 2. Отмена брони (клик по крестику)
async function cancelBooking(tagElement, timeString) {
    if (confirm(`❌ Отменить бронь ${timeString}?\nИнтервал освободится для других операторов.`)) {
        tagElement.style.opacity = '0.5';
        tagElement.style.pointerEvents = 'none';

        try {
            // Удаляем из временной таблицы
            await supabaseClient.from('active_breaks')
                .delete()
                .eq('user_id', currentUser.id)
                .eq('channel', selectedChannel)
                .eq('time_slot', timeString);

            // Пишем в вечный лог
            await supabaseClient.from('global_log').insert([{
                operator_name: currentOperatorName,
                channel: selectedChannel,
                action: 'ОТМЕНА',
                time_slot: timeString,
                user_id: currentUser.id
            }]);

            console.log(`❌ Бронь отменена: ${timeString}`);
            tagElement.remove(); // Убираем тег с экрана
            
            // Перерисовываем сетку, чтобы кнопка снова стала доступной
            renderOperatorUI();
        } catch (err) {
            console.error("Ошибка отмены:", err);
            alert("Ошибка при отмене брони!");
            tagElement.style.opacity = '1';
            tagElement.style.pointerEvents = 'auto';
        }
    }
}

// ========================================================
// 🗑️ МАССОВАЯ ОТМЕНА БРОНЕЙ
// ========================================================
async function clearAllBookings() {
    // 1. Показываем то самое важное предупреждение
    if (!confirm('Вы уверены, что хотите отменить все забронированные перерывы?\n\nВАЖНО: Уже отгулянные (завершенные) перерывы не удалятся и станут доступны только в следующей смене!')) {
        return; // Если нажали "Отмена" - прерываем функцию
    }

    try {
        document.body.style.cursor = 'wait'; // Меняем курсор на загрузку

        // 2. Получаем все активные брони текущего оператора в этом канале
        const { data: activeBookings, error: bookingsError } = await supabaseClient
            .from('active_breaks')
            .select('time_slot')
            .eq('channel', selectedChannel)
            .eq('user_id', currentUser.id);

        if (bookingsError) throw bookingsError;

        if (!activeBookings || activeBookings.length === 0) {
            alert("У вас нет активных броней для отмены.");
            return;
        }

        // 3. Узнаем, какие из них УЖЕ отгуляны (ищем ФИНИШ)
        const { data: finishLogs, error: logsError } = await supabaseClient
            .from('global_log')
            .select('time_slot')
            .eq('channel', selectedChannel)
            .eq('user_id', currentUser.id)
            .eq('action', 'ФИНИШ');

        if (logsError) throw logsError;

        const finishedSlots = finishLogs ? finishLogs.map(l => l.time_slot) : [];

        // 4. Оставляем только те слоты, которые ЕЩЕ НЕ завершены
        const slotsToDelete = activeBookings
            .map(b => b.time_slot)
            .filter(slot => !finishedSlots.includes(slot));

        if (slotsToDelete.length === 0) {
            alert("Все ваши перерывы уже использованы. Отменять нечего.");
            return;
        }

        // 5. Удаляем незавершенные слоты из временной таблицы одним махом
        const { error: deleteError } = await supabaseClient
            .from('active_breaks')
            .delete()
            .in('time_slot', slotsToDelete)
            .eq('channel', selectedChannel)
            .eq('user_id', currentUser.id);

        if (deleteError) throw deleteError;

        // 6. 🧠 ОБНОВЛЕННАЯ ЛОГИКА: Формируем единую строку и пишем "СБРОС"
        const combinedSlotsString = slotsToDelete.join(', ');

        const { error: insertError } = await supabaseClient
            .from('global_log')
            .insert([{
                operator_name: currentOperatorName,
                channel: selectedChannel,
                action: 'СБРОС',
                time_slot: combinedSlotsString,
                user_id: currentUser.id
            }]);

        if (insertError) throw insertError;

        console.log(`🧹 Массовый сброс слотов: ${combinedSlotsString}`);
        
        // 7. Перерисовываем интерфейс
        renderOperatorUI();

    } catch (err) {
        console.error("Ошибка при массовой отмене:", err);
        alert("Произошла ошибка при отмене перерывов.");
    } finally {
        document.body.style.cursor = 'default';
    }
}

// ========================================================
// ⏱️ АБСОЛЮТНЫЙ И ГИБКИЙ ТАЙМЕР ПЕРЕРЫВА
// ========================================================

// 1. Высчитываем длительность из строки (например, "10:00-10:15" -> 15)
function getSlotDuration(timeString) {
    const [start, end] = timeString.split('-');
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);

    const startDate = new Date();
    startDate.setHours(startH, startM, 0, 0);

    const endDate = new Date();
    endDate.setHours(endH, endM, 0, 0);

    // Если перерыв переходит через полночь (например, 23:50-00:20)
    if (endDate < startDate) endDate.setDate(endDate.getDate() + 1);

    return Math.round((endDate - startDate) / 60000);
}

// 2. Запуск неубиваемого таймера (с фуллскрин-экраном)
function startIronTimer(tagElement, timeString, isRestore = false) {
    const textSpan = tagElement.querySelector('span');
    const storageKey = `timer_target_${timeString}`;
    
    // Подхватываем элементы большого экрана
    const overlay = document.getElementById('fullscreen-timer-overlay');
    const bigTimeDisplay = document.getElementById('big-timer-time');
    const bigSlotDisplay = document.getElementById('big-timer-slot');
    const btnEndEarly = document.getElementById('btn-end-timer-early'); // 👈 Новая кнопка
    
    let targetTime;
    let intervalId; // 👈 Вынесли переменную наверх, чтобы избежать ошибки ReferenceError

    if (isRestore && localStorage.getItem(storageKey)) {
        targetTime = parseInt(localStorage.getItem(storageKey), 10);
    } else {
        const durationMinutes = getSlotDuration(timeString);
        targetTime = Date.now() + (durationMinutes * 60 * 1000);
        localStorage.setItem(storageKey, targetTime.toString());
    }

    // Подсвечиваем маленький тег
    tagElement.style.background = 'rgba(0, 174, 239, 0.15)';
    tagElement.style.border = '1px solid #00aeef';

    // Включаем оверлей
    bigSlotDisplay.innerText = timeString;
    overlay.classList.remove('hide');

    const updateDisplays = () => {
        const remaining = targetTime - Date.now();

        if (remaining <= 0) {
            // ТАЙМЕР ВЫШЕЛ
            clearInterval(intervalId);
            localStorage.removeItem(storageKey);
            
            // Обновляем тег
            textSpan.innerText = `${timeString} (Завершен)`;
            tagElement.style.background = 'rgba(255, 255, 255, 0.05)';
            tagElement.style.border = '1px solid var(--border-color)';
            tagElement.style.color = 'var(--text-muted)';
            
            // Прячем оверлей
            overlay.classList.add('hide');
        } else {
            // ТАЙМЕР ИДЕТ
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            textSpan.innerText = `${timeString} ⏳ ${formattedTime}`;
            bigTimeDisplay.innerText = formattedTime;
        }
    };

    // Привязываем досрочное завершение
    btnEndEarly.onclick = () => {
        if (confirm('Завершить перерыв досрочно?')) {
            targetTime = 0; // Принудительно обнуляем время
            updateDisplays(); // Вызываем немедленную проверку, которая всё закроет и очистит
        }
    };

    // Вызываем сразу 1 раз
    updateDisplays(); 
    
    // И запускаем цикл (теперь intervalId присваивается безопасно)
    intervalId = setInterval(updateDisplays, 1000);
}