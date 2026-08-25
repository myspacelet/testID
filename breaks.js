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
    
    // Тут в будущем мы вызовем функцию загрузки перерывов из базы
    console.log(`🚀 Запуск панели перерывов для канала: ${selectedChannel}`);
}