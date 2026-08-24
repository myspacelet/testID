// ========================================================
// 🔧 НАСТРОЙКИ И ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ========================================================
const SUPABASE_URL = "https://rvukyvwgpondpfxvjoju.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_JinHB8pKvvmIkIkIFRjF4A_BXnnC0rD";
const DADATA_API_TOKEN = "27902abba6a5a04cbd55f5a334a9b85c05caef06"; 

// Инициализация Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentAuthMode = 'login';
let currentDeliveryMode = 'pvz';
let selectedStoreCode = null;
let activeLists = [];
let currentOperatorName = 'Оператор';
let isConvenientToTalk = null;
let shablonDataList = [];
let globalNearestCityName = "";
let currentSearchMode = 'city'; 
let listCount = 2;              
let storeDatabase = {};

const HFLABS_GEO_URL = "city.csv";
let russianCitiesGeoCache = {};

let activeDraggedModal = null;
let modalXOffset = 0;
let modalYOffset = 0;
let topModalZIndex = 2000;

// ========================================================
// 🚀 ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
// ========================================================
window.addEventListener('DOMContentLoaded', async () => {
    loadDatabase();
    loadExternalGeoDatabase();
    
    // Тема оформления
    if (localStorage.getItem('app-theme') === 'dark') {
        document.body.classList.add('dark-mode');
        const themeBtn = document.getElementById('theme-toggle-btn');
        if (themeBtn) themeBtn.innerText = '☀️';
    } else {
        const themeBtn = document.getElementById('theme-toggle-btn');
        if (themeBtn) themeBtn.innerText = '🌙';
    }

    // Поиск по Enter в гео-инпуте
    const geoInput = document.getElementById('geo-search-input');
    if (geoInput) {
        geoInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                findNearestStore();
            }
        });
    }

    // Проверка сессии пользователя
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            const { data: profile, error } = await supabaseClient
                .from('profiles')
                .select('approved, full_name')
                .eq('id', session.user.id)
                .single();

            if (!error && profile && profile.approved === true) {
                const overlay = document.getElementById('auth-overlay');
                if (overlay) overlay.style.display = 'none';

                const welcomeTitle = document.getElementById('app-welcome-title');
                if (welcomeTitle && profile && profile.full_name) {
                    const firstName = profile.full_name.trim().replace(/^[^\s]+\s+/, '');
                    welcomeTitle.innerText = `🚌 Добро пожаловать, ${firstName}!`;
                    currentOperatorName = firstName;
                    updateAllOperatorInputs(firstName);
                }
            } else {
                await supabaseClient.auth.signOut();
            }
        }
    } catch (err) {
        console.error("Ошибка проверки сессии авторизации:", err);
    }
});

// ========================================================
// 🔐 АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ
// ========================================================
function toggleAuthTab(mode) {
    currentAuthMode = mode;
    const tabLogin = document.getElementById('auth-tab-login');
    const tabRegister = document.getElementById('auth-tab-register');
    const regFields = document.getElementById('register-fields');
    const submitBtn = document.getElementById('auth-submit-btn');
    const title = document.getElementById('auth-title');
    const statusMsg = document.getElementById('auth-status-message');
    
    if (statusMsg) statusMsg.innerHTML = '';

    if (mode === 'login') {
        tabLogin?.classList.add('active');
        tabRegister?.classList.remove('active');
        if (regFields) regFields.style.display = 'none';
        if (submitBtn) submitBtn.innerText = 'Войти в систему';
        if (title) title.innerText = 'Авторизация оператора';
    } else {
        tabRegister?.classList.add('active');
        tabLogin?.classList.remove('active');
        if (regFields) regFields.style.display = 'block';
        if (submitBtn) submitBtn.innerText = 'Запросить доступ';
        if (title) title.innerText = 'Подача заявки на доступ';
    }
}

async function handleAuthSubmit() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const statusMsg = document.getElementById('auth-status-message');
    
    if (!email || !password) {
        if (statusMsg) {
            statusMsg.style.color = 'var(--danger)';
            statusMsg.innerHTML = "Заполните Email и Пароль";
        }
        return;
    }

    if (statusMsg) {
        statusMsg.style.color = 'var(--text-muted)';
        statusMsg.innerHTML = '⏳ Обработка запроса спутником...';
    }

    if (currentAuthMode === 'register') {
        const fullName = document.getElementById('auth-fullname').value.trim();
        const operatorId = document.getElementById('auth-operatorid').value.trim();

        if (!fullName || !operatorId) {
            if (statusMsg) {
                statusMsg.style.color = 'var(--danger)';
                statusMsg.innerHTML = "Укажите ваши Имя, Фамилию и ID";
            }
            return;
        }

        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: fullName,
                    operator_id: operatorId
                }
            }
        });

        if (error) {
            if (statusMsg) {
                statusMsg.style.color = 'var(--danger)';
                statusMsg.innerHTML = "Ошибка: " + error.message;
            }
        } else {
            if (statusMsg) {
                statusMsg.style.color = 'var(--success)';
                statusMsg.innerHTML = '✅ Заявка создана! Ожидайте подтверждения.';
            }
            document.getElementById('auth-fullname').value = '';
            document.getElementById('auth-operatorid').value = '';
        }
    } else {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            if (statusMsg) {
                statusMsg.style.color = 'var(--danger)';
                statusMsg.innerHTML = "Неверный логин или пароль";
            }
            return;
        }

        const user = data.user;
        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('approved, full_name')
            .eq('id', user.id)
            .single();

        if (profileError || !profile || profile.approved !== true) {
            await supabaseClient.auth.signOut();
            if (statusMsg) {
                statusMsg.style.color = 'var(--danger)';
                statusMsg.innerHTML = "🔒 Доступ ограничен. Администратор ещё не одобрил вашу заявку.";
            }
        } else {
            if (statusMsg) {
                statusMsg.style.color = 'var(--success)';
                statusMsg.innerHTML = '🚀 Доступ разрешен!';
            }
            
            const welcomeTitle = document.getElementById('app-welcome-title');
            if (welcomeTitle && profile && profile.full_name) {
                const firstName = profile.full_name.trim().replace(/^[^\s]+\s+/, '');
                welcomeTitle.innerText = `🚌 Добро пожаловать, ${firstName}!`;
                currentOperatorName = firstName;
                updateAllOperatorInputs(firstName);
            }

            setTimeout(() => { 
                const overlay = document.getElementById('auth-overlay');
                if(overlay) overlay.style.display = 'none'; 
            }, 800);
        }
    }
}

async function handleLogout() {
    try {
        await supabaseClient.auth.signOut();
        const authOverlay = document.getElementById('auth-overlay');
        if (authOverlay) authOverlay.style.display = 'flex';
        const statusMsg = document.getElementById('auth-status-message');
        if (statusMsg) statusMsg.innerHTML = '';
    } catch (err) {
        console.error("Ошибка при выходе из системы:", err);
        alert("Не удалось безопасно выйти из системы");
    }
}

// ========================================================
// 🗄 ЗАГРУЗКА БАЗ ДАННЫХ
// ========================================================
async function loadDatabase() {
    const statusText = document.querySelector('.status-active');
    if (statusText) statusText.innerHTML = "⏳ Загрузка базы данных магазинов...";
    
    try {
        const { data, error } = await supabaseClient
            .from('stores')
            .select('code, city, address');

        if (error) throw error;

        const formattedDb = {};
        (data || []).forEach(store => {
            const cleanCity = (store.city || '').trim();
            let addr = (store.address || '').trim();
            
            if (cleanCity && !addr.toLowerCase().startsWith(cleanCity.toLowerCase())) {
                addr = `${cleanCity} ${addr}`;
            }
            
            formattedDb[store.code] = {
                city: cleanCity,
                address: addr
            };
        });

        storeDatabase = formattedDb;
        if (statusText) statusText.innerHTML = `🟢 База городов: активна (${data.length} маг.)`;
    } catch (err) {
        console.error('Ошибка загрузки магазинов из Supabase:', err);
        if (statusText) statusText.innerHTML = "🔴 Ошибка загрузки базы магазинов";
    }
}

function updateDatabase() { loadDatabase(); }

async function loadExternalGeoDatabase() {
    const statusText = document.querySelector('.status-active');
    const originalStatus = statusText ? statusText.innerHTML : "";
    
    try {
        if (statusText) statusText.innerHTML = "⏳ Загрузка гео-базы городов России...";
        
        const response = await fetch(HFLABS_GEO_URL);
        const csvText = await response.text();
        const lines = csvText.split('\n');
        
        const headers = lines[0].split(',');
        const cityIdx = headers.indexOf('city');
        const addressIdx = headers.indexOf('address');
        const latIdx = headers.indexOf('geo_lat');
        const lngIdx = headers.indexOf('geo_lon');
        const tzIdx = headers.indexOf('timezone');
        const regionIdx = headers.indexOf('region');
        const popIdx = headers.indexOf('population');

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            
            let cityName = "";
            if (cityIdx !== -1 && row[cityIdx] && row[cityIdx].replace(/"/g, '').trim() !== "") {
                cityName = row[cityIdx].replace(/"/g, '').trim().toLowerCase();
            } else if (addressIdx !== -1 && row[addressIdx]) {
                let rawAddress = row[addressIdx].replace(/"/g, '').trim().toLowerCase();
                cityName = rawAddress.replace(/^г\s+/, '').trim();
            }
            
            if (!cityName) continue;
            const lat = parseFloat(row[latIdx]);
            const lng = parseFloat(row[lngIdx]);
            if (isNaN(lat) || isNaN(lng)) continue; 

            const regionName = row[regionIdx] ? row[regionIdx].replace(/"/g, '').trim().toLowerCase() : "";
            const population = row[popIdx] ? parseInt(row[popIdx].replace(/"/g, ''), 10) : 0;
            
            const tzText = row[tzIdx] ? row[tzIdx].replace(/"/g, '').trim() : "UTC+3";
            let tzOffset = 3;
            if (tzText.includes('+')) {
                const parts = tzText.split('+');
                tzOffset = parts.length > 1 ? parseInt(parts[1], 10) : 3;
            } else if (tzText.includes('-')) {
                const parts = tzText.split('-');
                tzOffset = parts.length > 1 ? -parseInt(parts[1], 10) : 3;
            }

            const geoData = { 
                lat: lat, 
                lng: lng, 
                tz: tzOffset, 
                region: regionName.replace(/область|республика|край/g, '').trim(),
                population: population 
            };

            if (!russianCitiesGeoCache[cityName]) russianCitiesGeoCache[cityName] = [];
            russianCitiesGeoCache[cityName].push(geoData);
        }
        
        if (statusText) statusText.innerHTML = originalStatus;
    } catch (err) {
        if (statusText) statusText.innerHTML = "🔴 Ошибка загрузки гео-базы";
        console.error(err);
    }
}

// ========================================================
// 🖥 ИНТЕРФЕЙС И НАВИГАЦИЯ
// ========================================================
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    document.getElementById('theme-toggle-btn').innerText = isDark ? '☀️' : '🌙';
    localStorage.setItem('app-theme', isDark ? 'dark' : 'light');
}

function setSearchMode(mode) {
    currentSearchMode = mode;
    const btnCity = document.getElementById('btn-search-city');
    const btnCode = document.getElementById('btn-search-code');
    if (mode === 'city') {
        btnCity.classList.add('active');
        btnCode.classList.remove('active');
    } else {
        btnCode.classList.add('active');
        btnCity.classList.remove('active');
    }
}

function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }
function scrollToBottom() { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }

function scrollToNearestCity() {
    if (!globalNearestCityName) return;
    const cleanTarget = globalNearestCityName.trim().toLowerCase();
    const targetRow = document.querySelector(`.result-row[data-city="${cleanTarget}"]`);
    if (targetRow) {
        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function highlightNearestCityRow(targetCityName) {
    if (!targetCityName) return;
    const cleanTarget = targetCityName.trim().toLowerCase();
    document.querySelectorAll('.result-row').forEach(row => row.classList.remove('highlight-city'));
    const targetRow = document.querySelector(`.result-row[data-city="${cleanTarget}"]`);
    if (targetRow) {
        targetRow.classList.add('highlight-city');
        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// ========================================================
// 📦 ЛОГИКА ТОВАРНЫХ СПИСКОВ
// ========================================================
function addNewList() {
    listCount++;
    const container = document.getElementById('lists-container');
    const newGroup = document.createElement('div');
    newGroup.className = 'input-group product-list-wrapper';
    newGroup.id = `group-list-${listCount}`;
    newGroup.innerHTML = `
        <div class="flex-header input-group-header">
            <label class="input-label">Товар ${listCount} (Список строк)</label>
            <div style="display: flex; gap: 8px; align-items: center;">
                <button type="button" class="mac-clear-btn" onclick="clearSpecificProductList(${listCount})" title="Очистить список">×</button>
                <button type="button" onclick="removeList(${listCount})" class="btn-delete">Удалить</button>
            </div>
        </div>
        <textarea id="list-${listCount}" class="input-textarea" placeholder="Вставьте данные для списка ${listCount}..."></textarea>
        <div class="flex-row mt-12" style="align-items: center; justify-content: flex-start; margin-bottom: 0;">
            <span class="small-label" style="margin-bottom:0;">🔢 Нужно штук:</span>
            <input type="number" id="stock-filter-${listCount}" class="input-textarea single-line" style="width: 100px; padding: 4px 10px;" placeholder=">= 1" min="1">
        </div>
    `;
    container.appendChild(newGroup);
}

function removeList(id) {
    const el = document.getElementById(`group-list-${id}`);
    if (el) el.remove();
}

function clearSpecificProductList(index) {
    const textarea = document.getElementById(`list-${index}`);
    const stockInput = document.getElementById(`stock-filter-${index}`);
    if (textarea) textarea.value = '';
    if (stockInput) stockInput.value = '';

    if (typeof refreshProductContainerOnly === 'function') {
        const minBtn = document.getElementById('btn-minimized-order');
        const modal = document.getElementById('modal-process-order');
        if ((modal && modal.style.display === 'flex') || (minBtn && minBtn.style.display === 'block')) {
            refreshProductContainerOnly();
        }
    }
}

// ========================================================
// 🔍 АНАЛИЗ И ПОИСК СОВПАДЕНИЙ
// ========================================================
function parseDirtyList(text) {
    const lines = text.split('\n');
    const storesMap = new Map();
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        const strictMatch = line.match(/^\d+\s+([A-Za-zА-Яа-я0-9_#-]+)\s+(\d+)$/);
        if (strictMatch) {
            const code = strictMatch[1].trim();
            const stock = parseInt(strictMatch[2], 10);
            if (/^\d+$/.test(code) && code.length <= 3) continue; 
            storesMap.set(code, stock);
            continue;
        }
        if (line.includes(',') || line.includes('ул.') || line.includes('г.') || line.includes('обл.')) continue; 
        const words = line.split(/\s+/);
        if (words.length >= 3) {
            const firstWordNum = parseInt(words[0], 10);
            const lastWordNum = parseInt(words[words.length - 1], 10);
            const middleWord = words[1].replace(/[,.]/g, '').trim();
            if (!isNaN(firstWordNum) && !isNaN(lastWordNum) && middleWord.length > 2 && isNaN(parseInt(middleWord, 10))) {
                storesMap.set(middleWord, lastWordNum);
            }
        }
    }
    return storesMap;
}

function startSearch() {
    activeLists = [];
    for (let i = 1; i <= 100; i++) {
        const textarea = document.getElementById(`list-${i}`);
        if (textarea && textarea.value.trim()) {
            const parsedMap = parseDirtyList(textarea.value);
            const inputFilter = document.getElementById(`stock-filter-${i}`);
            const requiredStock = (inputFilter && inputFilter.value.trim()) ? parseInt(inputFilter.value, 10) : 1;
            activeLists.push({ storesMap: parsedMap, requiredStock: requiredStock });
        }
    }

    if (activeLists.length === 0) {
        alert("Пожалуйста, заполните хотя бы Товар 1");
        return;
    }

    let finalMatches = [];
    const cityStockEvaluation = {};

    for (let code in storeDatabase) {
        const store = storeDatabase[code];
        if (!store || !store.city) continue;
        
        const cityName = store.city.trim();
        if (!cityStockEvaluation[cityName]) {
            cityStockEvaluation[cityName] = { cityName: cityName, allShopsInCity: [], itemStocksSum: Array(activeLists.length).fill(0) };
        }
        if (!cityStockEvaluation[cityName].allShopsInCity.includes(code)) cityStockEvaluation[cityName].allShopsInCity.push(code);
    }

    activeLists.forEach((item, listIdx) => {
        item.storesMap.forEach((stock, code) => {
            const store = storeDatabase[code];
            if (store && store.city) {
                const cityName = store.city.trim();
                if (cityStockEvaluation[cityName]) cityStockEvaluation[cityName].itemStocksSum[listIdx] += stock;
            }
        });
    });

    for (const cityName in cityStockEvaluation) {
        const cityData = cityStockEvaluation[cityName];
        let cityPassesFilter = true;
        for (let i = 0; i < activeLists.length; i++) {
            if (cityData.itemStocksSum[i] < activeLists[i].requiredStock) { cityPassesFilter = false; break; }
        }

        if (cityPassesFilter) {
            let cityShopsWithStock = [];
            cityData.allShopsInCity.forEach(code => {
                let maxStockInShop = 0;
                activeLists.forEach(item => {
                    if (item.storesMap.has(code)) maxStockInShop = Math.max(maxStockInShop, item.storesMap.get(code));
                });
                if (maxStockInShop > 0) cityShopsWithStock.push({ code, sortStock: maxStockInShop });
            });

            cityShopsWithStock.sort((a, b) => b.sortStock - a.sortStock);
            const top3Shops = cityShopsWithStock.slice(0, 3);

            top3Shops.forEach((shop, index) => {
                let minStockForBadge = Infinity;
                activeLists.forEach(item => {
                    if (item.storesMap.has(shop.code)) minStockForBadge = Math.min(minStockForBadge, item.storesMap.get(shop.code));
                });
                if (minStockForBadge === Infinity) minStockForBadge = shop.sortStock;

                finalMatches.push({ code: shop.code, stock: minStockForBadge, isExact: (activeLists.length === 1 || index === 0), softCityKey: cityName });
            });
        }
    }

    renderResults(finalMatches);
    const scrollNav = document.getElementById('scroll-nav');
    if (scrollNav) scrollNav.classList.add('visible');
    scrollToBottom();
}

function renderResults(storesArray) {
    const container = document.getElementById('results-rows-container');
    container.innerHTML = ''; 

    if (storesArray.length === 0) {
        container.innerHTML = `<div class="text-center small-label" style="padding:20px;">Совпадений не найдено 🤷‍♂️</div>`;
        document.getElementById('results-section').classList.remove('hide');
        return;
    }

    const exactGroups = {};
    const cityGroups = {};

    storesArray.forEach(item => {
        const dbItem = storeDatabase[item.code];
        let cityName = "Неизвестный код";
        
        if (dbItem) {
            cityName = (currentSearchMode === 'city') ? dbItem.city : item.code;
        } else if (item.softCityKey) {
            cityName = item.softCityKey;
        }

        const targetGroupMap = item.isExact ? exactGroups : cityGroups;
        if (!targetGroupMap[cityName]) targetGroupMap[cityName] = { cityName: cityName, isExact: item.isExact, stores: [] };
        targetGroupMap[cityName].stores.push(item);
    });

    function buildCityRowsHTML(groupMap) {
        let html = '';
        Object.keys(groupMap).forEach(cityName => {
            const group = groupMap[cityName];
            const cleanCityAttr = group.cityName.trim().toLowerCase();
            const cityNameEscaped = group.cityName.replace(/'/g, "\\'");
            const top3Stores = group.stores.sort((a, b) => b.stock - a.stock).slice(0, 3);

            let badgesHtml = '';
            top3Stores.forEach(store => {
                const exactClass = store.isExact ? ' exact-badge' : '';
                const isSelectedClass = (selectedStoreCode === store.code) ? ' active-selected-store' : '';
                badgesHtml += `<button class="store-badge${exactClass}${isSelectedClass}" onclick="openStoreCard('${store.code}')">${store.code} (${store.stock} шт)</button>`;
            });

            const titleHtml = (currentSearchMode === 'city')
                ? `<span class="clickable-city-title" onclick="openCityShopsModal('${cityNameEscaped}')">${group.cityName}</span>`
                : `<span class="static-code-title">${group.cityName}</span>`;

            html += `<div class="result-row" data-city="${cleanCityAttr}"><div class="result-city">${titleHtml}</div><div class="badges-container">${badgesHtml}</div></div>`;
        });
        return html;
    }

    let finalHTML = '';
    const exactKeys = Object.keys(exactGroups);
    if (exactKeys.length > 0) {
        finalHTML += `<div class="results-group-block"><div class="results-group-title exact-group-title">🎯 Точные магазины (${exactKeys.length})</div><div class="results-group-list">${buildCityRowsHTML(exactGroups)}</div></div>`;
    }

    const cityKeys = Object.keys(cityGroups);
    if (cityKeys.length > 0) {
        finalHTML += `<div class="results-group-block"><div class="results-group-title soft-group-title">🏙️ Совпадения по городу (${cityKeys.length})</div><div class="results-group-list">${buildCityRowsHTML(cityGroups)}</div></div>`;
    }

    container.innerHTML = finalHTML;
    document.getElementById('results-section').classList.remove('hide');
}

// ========================================================
// 📍 ГЕОЛОКАЦИЯ И DADATA
// ========================================================
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

async function fetchCoordinates(address) {
    if (!DADATA_API_TOKEN || DADATA_API_TOKEN === "ВАШ_ТОКЕН_DADATA") return null;

    try {
        const response = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": "Token " + DADATA_API_TOKEN },
            body: JSON.stringify({ query: address, count: 1 })
        });

        if (!response.ok) throw new Error(`Ошибка DaData HTTP: ${response.status}`);
        const result = await response.json();
        if (result.suggestions && result.suggestions.length > 0) {
            const data = result.suggestions[0].data;
            const lat = parseFloat(data.geo_lat);
            const lng = parseFloat(data.geo_lon);
            if (isNaN(lat) || isNaN(lng)) return null;

            let tz = 3;
            if (data.timezone) {
                const match = data.timezone.match(/UTC([+-]\d+)/);
                if (match && match[1]) tz = parseInt(match[1], 10);
            }
            return { lat: lat, lng: lng, tz: tz, qc: data.qc_geo };
        }
    } catch (err) {
        console.error("Ошибка гео-поиска через DaData:", err);
    }
    return null;
}

async function findNearestStore() {
    const userInput = document.getElementById('geo-search-input').value.trim();
    const output = document.getElementById('geo-result-output');
    if (!userInput) { alert("Введите адрес доставки клиента"); return; }

    const cityElements = document.querySelectorAll('.result-city');
    const citiesOnScreen = [];
    cityElements.forEach(el => {
        let pureCity = el.textContent || el.innerText;
        pureCity = pureCity.replace(/(ТОЧНЫЙ МАГАЗИН|СОВПАДЕНИЕ ПО ГОРОДУ)/g, '').replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, '').trim();
        if (pureCity && !citiesOnScreen.includes(pureCity)) citiesOnScreen.push(pureCity);
    });

    if (citiesOnScreen.length === 0) {
        output.style.color = 'var(--danger)';
        output.innerHTML = "⚠️ Сначала найдите совпадения магазинов.";
        return;
    }

    output.style.color = 'var(--text-muted)';
    output.innerHTML = `⏳ Спутник ищет локацию "${userInput}"...`;

    try {
        let clientCoords = null;
        const rawInput = userInput.trim().toLowerCase();
        const inputWords = rawInput.split(/[\s,]+/).filter(w => w.length > 0);
        
        if (inputWords.length > 0) {
            let targetCityName = inputWords[0];
            let cityArray = russianCitiesGeoCache[targetCityName];

            if (!cityArray && inputWords.length > 1) {
                const doubleWordCity = `${inputWords[0]} ${inputWords[1]}`;
                if (russianCitiesGeoCache[doubleWordCity]) {
                    targetCityName = doubleWordCity;
                    cityArray = russianCitiesGeoCache[doubleWordCity];
                }
            }

            if (cityArray && cityArray.length > 0) {
                cityArray.sort((a, b) => b.population - a.population);
                clientCoords = cityArray[0];
            }
        }

        if (!clientCoords) {
            output.innerHTML = `⏳ Спутник ищет "${userInput}" через DaData...`;
            clientCoords = await fetchCoordinates(userInput);
        }
        
        if (!clientCoords) {
            output.style.color = 'var(--danger)';
            output.innerHTML = "❌ Населенный пункт не найден.";
            return;
        }

        let minDistance = Infinity;
        let nearestCity = "";

        for (let cityName of citiesOnScreen) {
            let cleanCityName = cityName.replace(/\(.*?\)/g, '').replace(/[,.]/g, '').trim().toLowerCase();
            let cityGeoArray = russianCitiesGeoCache[cleanCityName] || russianCitiesGeoCache[cleanCityName.split(/[\s-]+/)[0]];
            
            if (cityGeoArray && cityGeoArray.length > 0) {
                cityGeoArray.sort((a, b) => b.population - a.population);
                const cityGeo = cityGeoArray[0];
                const straightDist = calculateDistance(clientCoords.lat, clientCoords.lng, cityGeo.lat, cityGeo.lng);
                if (straightDist < minDistance) {
                    minDistance = straightDist;
                    nearestCity = cityName;
                }
            }
        }

        if (nearestCity) {
            const roadDistance = Math.round(minDistance * 1.3);
            let clientTz = parseInt(clientCoords.tz, 10);
            if (isNaN(clientTz)) clientTz = 3; 

            const now = new Date();
            const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
            const localTimeOfClient = new Date(utc + (3600000 * clientTz));
            const hours = String(localTimeOfClient.getHours()).padStart(2, '0');
            const minutes = String(localTimeOfClient.getMinutes()).padStart(2, '0');
            const currentHours = localTimeOfClient.getHours();
            
            if (currentHours >= 21 || currentHours < 8) {
                output.style.color = 'var(--danger)'; 
                output.innerHTML = `⚠️ Ближайшая точка: <strong>${nearestCity}</strong> (~${roadDistance} км, местное время <strong>${hours}:${minutes}</strong>). ПОЗДНО ДЛЯ ЗВОНКА! ❌`;
            } else {
                output.style.color = '#ea580c'; 
                output.innerHTML = `💡 Ближайшая точка: <strong>${nearestCity}</strong> (~${roadDistance} км, местное время <strong>${hours}:${minutes}</strong>)`;
            }
            
            highlightNearestCityRow(nearestCity);
            globalNearestCityName = nearestCity;
            document.getElementById('btn-scroll-to-nearest').classList.remove('hide');
        } else {
            output.style.color = 'var(--danger)';
            output.innerHTML = "⚠️ Не удалось сопоставить города.";
        }

    } catch (err) {
        output.style.color = 'var(--danger)';
        output.innerHTML = "❌ Ошибка при расчете геоданных.";
        console.error(err);
    }
}

function resetAllForm() {
    document.getElementById('btn-minimized-order')?.classList.add('hide');
    selectedStoreCode = null;
    document.querySelectorAll('.store-badge').forEach(badge => badge.classList.remove('selected-active'));

    const inputsToClear = ['script-client-name', 'script-delivery-address', 'script-rec-fio', 'script-rec-phone', 'script-deliv-price', 'script-deliv-days', 'script-deliv-date', 'script-order-number', 'script-manual-store'];
    inputsToClear.forEach(id => { if (document.getElementById(id)) document.getElementById(id).value = ''; });

    const toggle = document.getElementById('script-mode-toggle');
    if (toggle) toggle.checked = false;
    handleScriptToggleChange();

    document.querySelectorAll('#lists-container .input-group').forEach((list, index) => { if (index >= 2) list.remove(); });
    listCount = 2;
    
    ['list-1', 'list-2', 'stock-filter-1', 'stock-filter-2', 'geo-search-input'].forEach(id => {
        if (document.getElementById(id)) document.getElementById(id).value = '';
    });
    
    if(document.getElementById('geo-result-output')) document.getElementById('geo-result-output').innerHTML = '';
    document.getElementById('results-section')?.classList.add('hide');
    document.getElementById('scroll-nav')?.classList.remove('visible');
    document.getElementById('btn-scroll-to-nearest')?.classList.add('hide');
    globalNearestCityName = "";
}

// ========================================================
// 🪟 УПРАВЛЕНИЕ ОКНАМИ И МОДАЛКАМИ
// ========================================================
function openFloatingModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hide');
        modal.style.display = 'flex';
        
        if (modalId === 'modal-waiting-list') loadWaitingList();
        if (modalId === 'modal-send-form') loadShablons();
        
        if (!modal.style.left || modal.style.left === "35%") {
            const modalWidth = modalId === "modal-waiting-list" ? 850 : (modal.offsetWidth || 450);
            const modalHeight = modal.offsetHeight || 300;
            const startLeft = Math.max(20, (window.innerWidth - modalWidth) / 2);
            modal.style.left = startLeft + "px";
            
            if (modalId === 'modal-process-order') {
                modal.style.top = '40px';
                modal.style.width = '';  
            } else {
                modal.style.top = Math.max(20, (window.innerHeight - modalHeight) / 2) + "px";
            }
        }
        focusModal(modal);
    }
}

function closeFloatingModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hide');
        modal.style.display = 'none';
        
        if (modalId === 'modal-process-order') {
            isConvenientToTalk = null;
            document.getElementById('btn-minimized-order')?.classList.add('hide');

            const inputsToClear = ['script-client-name', 'script-delivery-address', 'script-rec-fio', 'script-rec-phone', 'script-deliv-price', 'script-deliv-days', 'script-deliv-date', 'script-order-number', 'script-manual-store'];
            inputsToClear.forEach(id => { if (document.getElementById(id)) document.getElementById(id).value = ''; });

            const toggle = document.getElementById('script-mode-toggle');
            if (toggle) toggle.checked = false;
            handleScriptToggleChange();
        }
    }
}

function minimizeOrderModal() {
    document.getElementById('modal-process-order').style.display = 'none';
    document.getElementById('btn-minimized-order').classList.remove('hide');
}

function restoreOrderModal() {
    document.getElementById('btn-minimized-order').classList.add('hide');
    const modal = document.getElementById('modal-process-order');
    if (modal) {
        modal.classList.remove('hide');
        modal.style.display = 'flex';
        focusModal(modal);
        updateLiveScriptText();
    }
}

function focusModal(modalElement) {
    topModalZIndex++;
    modalElement.style.zIndex = topModalZIndex;
}

function initModalDrag(e, modalId) {
    if (e.target.classList.contains('floating-modal-close') || e.target.classList.contains('modal-control-btn') || e.target.classList.contains('modal-close-right')) return;
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    focusModal(modal);
    activeDraggedModal = modal;
    const rect = modal.getBoundingClientRect();
    modalXOffset = e.clientX - rect.left;
    modalYOffset = e.clientY - rect.top;
    
    document.addEventListener('mousemove', handleModalDrag);
    document.addEventListener('mouseup', stopModalDrag);
}

function handleModalDrag(e) {
    if (!activeDraggedModal) return;
    let newX = e.clientX - modalXOffset;
    let newY = e.clientY - modalYOffset;
    if (newX < 0) newX = 0;
    if (newY < 0) newY = 0;
    if (newX > window.innerWidth - 100) newX = window.innerWidth - 100;
    if (newY > window.innerHeight - 40) newY = window.innerHeight - 40;
    activeDraggedModal.style.left = newX + 'px';
    activeDraggedModal.style.top = newY + 'px';
}

function stopModalDrag() {
    activeDraggedModal = null;
    document.removeEventListener('mousemove', handleModalDrag);
    document.removeEventListener('mouseup', stopModalDrag);
}

// ========================================================
// 🛍 ОКНО МАГАЗИНА
// ========================================================
function openStoreCard(storeCode) {
    const modal = document.getElementById('store-modal'); 
    document.getElementById('modal-store-title').innerText = `🏪 Карточка: ${storeCode}`;
    const dbItem = storeDatabase[storeCode];
    document.getElementById('modal-address-text').innerText = dbItem ? (dbItem.address || "Адрес не указан") : "Данные отсутствуют"; 
    document.getElementById('modal-axapta-text').innerText = storeCode; 
    
    const selectBtn = document.getElementById('modal-btn-select-store');
    selectBtn.setAttribute('data-current-code', storeCode);
    
    if (selectedStoreCode === storeCode) {
        selectBtn.className = "btn-select-store-modal is-selected";
        selectBtn.innerText = "✅ Магазин выбран (Отменить)";
    } else {
        selectBtn.className = "btn-select-store-modal not-selected";
        selectBtn.innerText = "🛒 Выбрать этот магазин";
    }
    modal.classList.add('open');
}

function toggleStoreSelectionFromModal() {
    const selectBtn = document.getElementById('modal-btn-select-store');
    const storeCode = selectBtn.getAttribute('data-current-code');
    if (!storeCode) return;

    document.querySelectorAll('.store-badge').forEach(badge => badge.classList.remove('selected-active'));

    if (selectedStoreCode === storeCode) {
        selectedStoreCode = null;
        selectBtn.className = "btn-select-store-modal not-selected";
        selectBtn.innerText = "🛒 Выбрать этот магазин";
    } else {
        selectedStoreCode = storeCode;
        selectBtn.className = "btn-select-store-modal is-selected";
        selectBtn.innerText = "✅ Магазин выбран (Отменить)";
        document.querySelectorAll('.store-badge').forEach(badge => {
            if (badge.innerText.split('(')[0].trim() === storeCode) badge.classList.add('selected-active');
        });
    }
    setTimeout(() => document.getElementById('store-modal').classList.remove('open'), 300);
}

function closeModal(event) {
    if (event === null || event.target === document.getElementById('store-modal')) {
        document.getElementById('store-modal').classList.remove('open');
    }
}

function copyText(elementId, buttonElement) {
    navigator.clipboard.writeText(document.getElementById(elementId).innerText).then(() => {
        const oldIcon = buttonElement.innerHTML;
        buttonElement.innerHTML = '✅';
        buttonElement.style.pointerEvents = 'none';
        setTimeout(() => { buttonElement.innerHTML = oldIcon; buttonElement.style.pointerEvents = 'auto'; }, 1000);
    });
}

// ========================================================
// 📝 ГЕНЕРАТОР СКРИПТА 
// ========================================================
function buildOrderProcessingModal() {
    const container = document.getElementById('script-products-container');
    if (!container) return;

    let currentActiveLists = 0;
    for (let i = 1; i <= 100; i++) {
        if (document.getElementById(`list-${i}`)?.value.trim()) currentActiveLists++;
    }

    let existingProductRows = container.querySelectorAll('.script-product-row');
    const minBtn = document.getElementById('btn-minimized-order');

    if (minBtn && !minBtn.classList.contains('hide') && existingProductRows.length === currentActiveLists && currentActiveLists > 0) {
        restoreOrderModal();
        return;
    }

    if (!minBtn || minBtn.classList.contains('hide')) {
        container.innerHTML = ''; 
        if (document.getElementById('script-client-name')) document.getElementById('script-client-name').value = ''; 
    }

    for (let i = 1; i <= 100; i++) {
        const textarea = document.getElementById(`list-${i}`);
        if (textarea && textarea.value.trim()) {
            const lines = textarea.value.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            if (lines.length === 0) continue;

            let firstLine = lines[0].startsWith('[') ? lines[0].replace(/^\[[^\]]+\]\s*(Остатки:\s*|Лог:\s*)?/i, '').trim() : lines[0];
            const firstWord = firstLine.split(/\s+/)[0]; 
            let detectedArticle = "", detectedName = "", detectedLink = "";
            let requiredStock = parseInt(document.getElementById(`stock-filter-${i}`)?.value.trim(), 10) || 1; 

            if (/^[A-Z0-9_-]+$/.test(firstWord)) {
                detectedArticle = firstWord;
                let remainingText = firstLine.substring(firstWord.length).trim();
                const linkMatch = remainingText.match(/\((https?:\/\/[^\)]+)\)/i);
                if (linkMatch && linkMatch[1]) detectedLink = linkMatch[1].trim();
                detectedName = remainingText.replace(/\s*\(https?:\/\/[^\)]+\)/i, '').trim();
            }
            addProductRowToModal(detectedArticle, detectedName, requiredStock, detectedLink);
        }
    }

    if (container.querySelectorAll('.script-product-row').length === 0) addProductRowToModal("", "", 1, "");
    openFloatingModal('modal-process-order');
    handleScriptToggleChange();
    updateLiveScriptText();
}

function addProductRowToModal(article = "", name = "", qty = 1, link = "") {
    const container = document.getElementById('script-products-container');
    const currentCount = container.querySelectorAll('.script-product-row').length + 1;
    const prodRow = document.createElement('div');
    prodRow.className = 'script-product-row';
    prodRow.style = 'background: var(--bg-element); padding: 12px; border-radius: 10px; border: 1px solid var(--border-color); margin-bottom: 12px; position: relative;';
    
    prodRow.innerHTML = `
        <div class="flex-row" style="margin-bottom: 8px;">
            <div class="flex-2">
                <span class="product-row-title small-label" style="display:block;">АРТИКУЛ ТОВАРА ${currentCount}</span>
                <input type="text" class="input-textarea single-line script-input-art" value="${article}" placeholder="Вручную..." oninput="updateLiveScriptText()">
            </div>
            <div class="flex-1" style="max-width: 90px;">
                <span class="small-label" style="display:block;">КОЛ-ВО (ШТ)</span>
                <input type="number" class="input-textarea single-line script-input-qty" value="${qty}" min="1" oninput="updateLiveScriptText()">
            </div>
            <button type="button" onclick="removeProductRowFromModal(this)" title="Удалить" style="background:none; border:none; color:var(--danger); font-size:16px; cursor:pointer; font-weight:bold;">✕</button>
        </div>
        <div>
            <span class="small-label" style="display:block;">НАИМЕНОВАНИЕ ТОВАРА</span>
            <input type="text" class="input-textarea single-line script-input-name" data-link="${link}" value="${name}" placeholder="Например: Блеск для губ Pupa..." oninput="updateLiveScriptText()">
        </div>
    `;
    container.appendChild(prodRow);
    updateLiveScriptText();
}

function removeProductRowFromModal(btnElement) {
    const row = btnElement.closest('.script-product-row');
    if (row) {
        row.remove();
        document.querySelectorAll('#script-products-container .product-row-title').forEach((title, idx) => title.innerText = `АРТИКУЛ ТОВАРА ${idx + 1}`);
        updateLiveScriptText();
    }
}

function setDeliveryMode(mode) {
    currentDeliveryMode = mode;
    const tabPvz = document.getElementById('deliv-tab-pvz');
    const tabCourier = document.getElementById('deliv-tab-courier');
    const addressLabel = document.getElementById('script-address-label');
    const addressInput = document.getElementById('script-delivery-address');

    if (mode === 'pvz') {
        tabPvz?.classList.add('active');
        tabCourier?.classList.remove('active');
        if (addressLabel) addressLabel.innerText = "📍 АДРЕС ИЛИ НОМЕР ПУНКТА СДЭК";
        if (addressInput) addressInput.placeholder = "Город, улица, дом или код ПВЗ...";
    } else {
        tabCourier?.classList.add('active');
        tabPvz?.classList.remove('active');
        if (addressLabel) addressLabel.innerText = "📍 ТОЧНЫЙ АДРЕС ДОСТАВКИ КЛИЕНТА";
        if (addressInput) addressInput.placeholder = "Улица, дом, квартира...";
    }
    updateLiveScriptText();
}

function handleScriptToggleChange() {
    const isPinkMode = document.getElementById('script-mode-toggle')?.checked || false;
    const groupDate = document.getElementById('group-script-date');
    const groupOrder = document.getElementById('group-script-order-number');
    const groupManualStore = document.getElementById('group-script-manual-store');
    
    if (isPinkMode) {
        groupDate?.classList.add('field-muted');
        groupDate?.classList.remove('field-active');
        groupOrder?.classList.remove('field-muted');
        groupOrder?.classList.add('field-active');
        groupManualStore?.classList.remove('hide');
    } else {
        groupDate?.classList.remove('field-muted');
        groupDate?.classList.add('field-active');
        groupOrder?.classList.add('field-muted');
        groupOrder?.classList.remove('field-active');
        groupManualStore?.classList.add('hide');
    }
    updateLiveScriptText();
}

function setConvenientTalk(choice) {
    isConvenientToTalk = choice;
    updateLiveScriptText();
}

function updateLiveScriptText() {
    const liveOutput = document.getElementById('script-live-output');
    if (!liveOutput) return;

    const isPinkMode = document.getElementById('script-mode-toggle')?.checked || false;
    const clientNameInput = document.getElementById('script-client-name')?.value.trim() || '';
    const nameHtml = clientNameInput ? `<span style="color: var(--success); font-weight: 700;">${clientNameInput}</span>` : `<span style="color: var(--danger); font-weight: 700;">(Укажите данные)</span>`;
    let scriptText = `Добрый день, ${nameHtml}! Меня зовут Оператор, компания ***. Вы интересовались покупкой с индивидуальной доставкой. Вам удобно сейчас говорить?\n\n`;

    const btnYesStyle = (isConvenientToTalk === 'yes') ? 'background: var(--success); color: #fff; font-weight: 700;' : 'background: #22c55e; color: #fff; opacity: 0.85; border:none;';
    const btnNoStyle = (isConvenientToTalk === 'no') ? 'background: var(--danger); color: #fff; font-weight: 700;' : 'background: #ef4444; color: #fff; opacity: 0.85; border:none;';
    const buttonsHtml = `<div style="display: flex; gap: 10px; margin: 10px 0 16px 0;"><button type="button" onclick="setConvenientTalk('yes')" style="${btnYesStyle} padding: 6px 18px; border-radius: 6px; cursor: pointer;">🟢 Да</button><button type="button" onclick="setConvenientTalk('no')" style="${btnNoStyle} padding: 6px 18px; border-radius: 6px; cursor: pointer;">🔴 Нет</button></div>`;

    if (isConvenientToTalk === 'yes') {
        const artInputs = document.querySelectorAll('.script-input-art');
        const qtyInputs = document.querySelectorAll('.script-input-qty');
        const nameInputs = document.querySelectorAll('.script-input-name');
        let productsDetails = [];

        for (let i = 0; i < artInputs.length; i++) {
            const art = artInputs[i]?.value.trim();
            const qty = qtyInputs[i]?.value.trim() || '1';
            const name = nameInputs[i]?.value.trim();
            const link = nameInputs[i]?.getAttribute('data-link');

            let itemText = name ? (link ? `<a href="${link}" target="_blank" style="color: var(--success); font-weight: 700;">${name}</a>` : `<span style="color: var(--success); font-weight: 700;">"${name}"</span>`) : (art ? `<span style="color: var(--success); font-weight: 700;">арт. ${art}</span>` : `<span style="color: var(--danger); font-weight: 700;">товар №${i + 1} (Укажите данные)</span>`);
            itemText += ` в количестве <span style="color: var(--success); font-weight: 700;">${qty} шт.</span>`;
            productsDetails.push(itemText);
        }

        const itemsString = productsDetails.length > 0 ? productsDetails.join(', ') : `<span style="color: var(--danger); font-weight: 700;">(Укажите данные)</span>`;

        if (isPinkMode) {
            const orderNum = document.getElementById('script-order-number')?.value.trim();
            const orderHtml = orderNum ? `<span style="color: var(--success); font-weight: 700;">№${orderNum}</span>` : `<span style="color: var(--danger); font-weight: 700;">(Укажите данные)</span>`;
            scriptText += `Вы уже оформили заказ ${orderHtml}. В заказе у вас указан ${itemsString}, верно?\n\n`;
        } else {
            scriptText += `Отлично! Я звоню, чтобы согласовать детали доставки. В заказе у вас указан ${itemsString}, верно?\n\n`;
            scriptText += `Данный-(ые) товар-(ры) сейчас находятся в наличии магазина `;
            if (selectedStoreCode && storeDatabase[selectedStoreCode]) {
                const storeInfo = storeDatabase[selectedStoreCode];
                const storeCityHtml = storeInfo.city ? `<span style="color: var(--success); font-weight: 700;">${storeInfo.city}</span>` : `<span style="color: var(--danger); font-weight: 700;">(Укажите данные)</span>`;
                const storeAddressHtml = storeInfo.address ? `<span style="color: var(--success); font-weight: 700;">${storeInfo.address}</span>` : `<span style="color: var(--danger); font-weight: 700;">(Укажите данные)</span>`;
                scriptText += `в городе ${storeCityHtml} по адресу: ${storeAddressHtml}.\n\n`;
            } else {
                scriptText += `<span style="color: var(--danger); font-weight: 700;">[⚠️ ВНИМАНИЕ: ТОЧКА ОТГРУЗКИ НЕ ВЫБРАНА]</span>.\n\n`;
            }
        }

        scriptText += `На данный момент доступно 2 способа доставки: в пункт выдачи СДЭК и курьером. Уточните, какой способ Вам удобнее?\n\n`;
        const delivAddress = document.getElementById('script-delivery-address')?.value.trim() || '';
        const addressHtml = delivAddress ? `<span style="color: var(--success); font-weight: 700;">${delivAddress}</span>` : `<span style="color: var(--danger); font-weight: 700;">(Укажите данные)</span>`;
        const delivDays = document.getElementById('script-deliv-days')?.value.trim() || '';
        const daysHtml = delivDays ? `<span style="color: var(--success); font-weight: 700;">${delivDays}</span>` : `<span style="color: var(--danger); font-weight: 700;">(Укажите данные)</span>`;
        const delivPrice = document.getElementById('script-deliv-price')?.value.trim() || '';
        const priceHtml = delivPrice ? `<span style="color: var(--success); font-weight: 700;">${delivPrice} руб.</span>` : `<span style="color: var(--danger); font-weight: 700;">(Укажите данные)</span>`;
        const hintHtml = `<span class="script-hint-badge" data-tooltip="Если спросят точную стоимость: «Точная стоимость рассчитывается при оформлении отправления, можем сообщить ее позже»">ℹ️</span>`;

        scriptText += `Мы можем переместить заказ и ${currentDeliveryMode === 'pvz' ? 'отправить его в ваш город на пункт выдачи СДЭК' : 'доставить его курьером'} по адресу: ${addressHtml}. По срокам это займет ${daysHtml}, стоимость ${priceHtml} ${hintHtml}\n\n`;
        
        const recFio = document.getElementById('script-rec-fio')?.value.trim() || '';
        const fioHtml = recFio ? `<span style="color: var(--success); font-weight: 700;">${recFio}</span>` : `<span style="color: var(--danger); font-weight: 700;">(Укажите данные)</span>`;
        const recPhone = document.getElementById('script-rec-phone')?.value.trim() || '';
        const phoneHtml = recPhone ? `<span style="color: var(--success); font-weight: 700;">${recPhone}</span>` : `<span style="color: var(--danger); font-weight: 700;">(Укажите данные)</span>`;

        scriptText += `Для отправки мне потребуется зафиксировать данные. ФИО получателя: ${fioHtml}, контактный номер телефона: ${phoneHtml}.\n\n`;
        if (!isPinkMode) scriptText += `Хорошо. Уточните, пожалуйста, ориентировочную дату оформления заказа?\n\n`;
        scriptText += `Отлично! Я зафиксировал(-а) все данные. Спасибо за заказ, хорошего дня!`;

    } else if (isConvenientToTalk === 'no') {
        scriptText += `Хорошо. Уточните, пожалуйста, в какое время Вам перезвонить?\n\nЗафиксировал(-а). Всего доброго!`;
    } else {
        scriptText += `<span style="color: var(--text-muted); font-style: italic;">👉 Выберите ответ клиента, чтобы продолжить скрипт.</span>`;
    }

    const activeOperator = currentOperatorName || localStorage.getItem('auth_operator_name') || 'Оператор';
    const greetingHtml = `Добрый день, ${nameHtml}! Меня зовут ${activeOperator}, компания ***. Вы интересовались покупкой с индивидуальной доставкой. Вам удобно сейчас говорить?`;
    const restText = scriptText.substring(scriptText.indexOf('\n\n') + 2);

    liveOutput.innerHTML = greetingHtml + buttonsHtml + restText.replace(/\n/g, '<br>');
}

function copyGeneratedScript(btnElement) {
    const isPinkMode = document.getElementById('script-mode-toggle')?.checked || false;
    let cleanPhone = (document.getElementById('script-rec-phone')?.value.trim() || '').replace(/\D/g, '');
    if (cleanPhone.length > 0) cleanPhone = cleanPhone.startsWith('8') ? '7' + cleanPhone.substring(1) : (cleanPhone.length === 10 ? '7' + cleanPhone : cleanPhone.substring(0, 11));

    const recFio = document.getElementById('script-rec-fio')?.value.trim() || '';
    const deliveryAddress = document.getElementById('script-delivery-address')?.value.trim() || '';
    const delivPrice = document.getElementById('script-deliv-price')?.value.trim() || '0';
    const delivDays = document.getElementById('script-deliv-days')?.value.trim() || '';
    const delivDate = document.getElementById('script-deliv-date')?.value || '';

    const artInputs = document.querySelectorAll('.script-input-art');
    const qtyInputs = document.querySelectorAll('.script-input-qty');
    let articlesArray = [], totalQty = 0;

    for (let i = 0; i < artInputs.length; i++) {
        if (artInputs[i].value.trim()) articlesArray.push(artInputs[i].value.trim());
        const qty = parseInt(qtyInputs[i].value.trim(), 10);
        if (!isNaN(qty)) totalQty += qty;
    }

    let clientCity = deliveryAddress ? deliveryAddress.replace(/^(г\.|город\s+|обл\.|область\s+)/i, '').trim().split(/[, ]/)[0] : '';
    let storeInfoString = document.getElementById('script-manual-store')?.value.trim() || '';
    if (!isPinkMode && !storeInfoString && selectedStoreCode && storeDatabase[selectedStoreCode]) {
        const store = storeDatabase[selectedStoreCode];
        storeInfoString = store.city ? `${store.city}, ${store.address.split(';')[0].trim()}` : store.address.split(';')[0].trim();
    }

    const excelRowParts = [
        cleanPhone, recFio, articlesArray.join(', '), totalQty > 0 ? totalQty.toString() : '',
        clientCity, storeInfoString, currentDeliveryMode === 'pvz' ? delivPrice : '', currentDeliveryMode !== 'pvz' ? delivPrice : '',
        delivDays, currentDeliveryMode === 'pvz' ? 'СДЭК ПВЗ' : 'Курьер', deliveryAddress,
        isPinkMode ? '' : (delivDate ? delivDate.replace('T', ' ') : ''),
        isPinkMode ? (document.getElementById('script-order-number')?.value.trim() || '') : ''
    ];

    navigator.clipboard.writeText(excelRowParts.join('\t')).then(() => {
        const oldText = btnElement.innerHTML;
        btnElement.innerHTML = '✅ Строка Excel скопирована!';
        btnElement.style.background = 'var(--success)';
        setTimeout(() => { btnElement.innerHTML = oldText; btnElement.style.background = 'var(--primary)'; }, 1500);
    }).catch(err => alert('❌ Ошибка доступа к буферу.'));
}

function refreshProductContainerOnly() {
    const container = document.getElementById('script-products-container');
    if (!container) return;
    container.innerHTML = '';
    
    for (let i = 1; i <= 100; i++) {
        const textarea = document.getElementById(`list-${i}`);
        if (textarea && textarea.value.trim()) {
            let firstLine = textarea.value.split('\n')[0].trim();
            if (firstLine.startsWith('[')) firstLine = firstLine.replace(/^\[.*?\]\s*(Остатки:\s*)?/i, '').trim();
            const firstWord = firstLine.split(/\s+/)[0]; 
            let detectedArticle = "", detectedName = "", detectedLink = "";
            let requiredStock = parseInt(document.getElementById(`stock-filter-${i}`)?.value.trim(), 10) || 1;

            if (/^[A-Z0-9_-]+$/.test(firstWord)) {
                detectedArticle = firstWord;
                let remainingText = firstLine.substring(firstWord.length).trim();
                const linkMatch = remainingText.match(/\((https?:\/\/[^\)]+)\)/i);
                if (linkMatch && linkMatch[1]) detectedLink = linkMatch[1].trim();
                detectedName = remainingText.replace(/\s*\(https?:\/\/[^\)]+\)/i, '').trim();
            }
            addProductRowToModal(detectedArticle, detectedName, requiredStock, detectedLink);
        }
    }
}

function openCityShopsModal(cityName) {
    let modal = document.getElementById('city-shops-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'city-shops-modal';
        modal.className = 'city-modal-overlay';
        modal.addEventListener('click', (event) => { if (event.target.id === 'city-shops-modal') closeCityShopsModal(); });
        document.body.appendChild(modal);
    }

    let foundShops = [];
    const cleanTargetCity = cityName.trim().toLowerCase();

    for (let code in storeDatabase) {
        const store = storeDatabase[code];
        if (store && store.city && store.city.trim().toLowerCase() === cleanTargetCity) {
            let totalStockInThisShop = 0;
            activeLists.forEach(item => { if (item.storesMap && item.storesMap.has(code)) totalStockInThisShop += item.storesMap.get(code); });
            foundShops.push({ code: code, storeData: store, hasStock: totalStockInThisShop > 0, totalStock: totalStockInThisShop });
        }
    }

    foundShops.sort((a, b) => b.hasStock - a.hasStock || b.totalStock - a.totalStock);
    let shopsHTML = foundShops.length === 0 ? `<div class="text-center small-label">Магазины не найдены</div>` : foundShops.map(shop => `
        <div class="city-modal-store-card ${selectedStoreCode === shop.code ? 'selected-card' : ''}">
            <div style="display: flex; justify-content: space-between;"><span class="store-title">🏬 Код: ${shop.code}</span>
            <span class="city-modal-badge ${shop.hasStock ? (selectedStoreCode === shop.code ? 'selected-badge' : 'available-badge') : 'empty-badge'}">${shop.hasStock ? (selectedStoreCode === shop.code ? 'Выбран' : 'Доступен') : 'Нет'}</span></div>
            <div class="store-address">📍 Адрес: ${shop.storeData.address || 'Не указан'}</div>
            <button class="city-modal-select-btn ${shop.hasStock ? (selectedStoreCode === shop.code ? 'selected' : 'available') : 'disabled'}" ${shop.hasStock ? `onclick="selectStoreFromCityModal('${shop.code}', '${cityName}')"` : 'disabled'}>
                ${shop.hasStock ? (selectedStoreCode === shop.code ? '✅ Выбран (Отменить)' : '🛒 Выбрать магазин') : '❌ Пуст'}
            </button>
        </div>
    `).join('');

    modal.innerHTML = `<div class="city-modal-container"><div class="city-modal-header"><h3>🏙️ Магазины: ${cityName}</h3><button class="city-modal-close-btn" onclick="closeCityShopsModal()">&times;</button></div><div class="city-modal-body">${shopsHTML}</div></div>`;
    modal.style.display = 'flex';
}

function closeCityShopsModal() {
    const modal = document.getElementById('city-shops-modal');
    if (modal) modal.style.display = 'none';
}

function selectStoreFromCityModal(storeCode, cityName) {
    document.querySelectorAll('.badges-container .store-badge').forEach(badge => badge.classList.remove('selected-active'));
    if (selectedStoreCode === storeCode) {
        selectedStoreCode = null;
    } else {
        selectedStoreCode = storeCode;
        document.querySelectorAll('.badges-container .store-badge').forEach(badge => {
            if (badge.innerText.split('(')[0].trim() === storeCode) badge.classList.add('selected-active');
        });
    }
    openCityShopsModal(cityName);
}

// ========================================================
// ⏳ ЛИСТ ОЖИДАНИЯ
// ========================================================
function toggleAddForm() {
    const formBlock = document.getElementById('wl-add-form-block');
    if (!formBlock) return;
    formBlock.classList.toggle('active');
    
    const saveBtn = document.querySelector('.wl-btn-save');
    if (formBlock.classList.contains('active')) {
        resetWlFormInputsOnly();
        if (saveBtn) { saveBtn.innerText = 'Сохранить'; saveBtn.setAttribute('onclick', 'saveNewTaskToSupabase()'); saveBtn.style.background = 'var(--primary)'; }
        autoFillFormDetails();
        updateAllOperatorInputs(currentOperatorName || localStorage.getItem('auth_operator_name') || 'Оператор');
    } else {
        resetWlFormInputsOnly();
    }
}

function resetWlFormInputsOnly() {
    const idInput = document.getElementById('wl-input-id');
    if (idInput) { idInput.value = ''; idInput.readOnly = false; idInput.style.opacity = '1'; }
    ['wl-input-comment', 'wl-input-callback'].forEach(id => { if (document.getElementById(id)) document.getElementById(id).value = ''; });
    if (document.getElementById('wl-input-classifier')) document.getElementById('wl-input-classifier').selectedIndex = 0;
}

function autoFillFormDetails() {
    if (document.getElementById('wl-input-operator')) document.getElementById('wl-input-operator').value = currentOperatorName;
    const mainDelivDate = document.getElementById('script-deliv-date');
    if (mainDelivDate?.value && document.getElementById('wl-input-callback')) document.getElementById('wl-input-callback').value = mainDelivDate.value;
}

async function loadWaitingList() {
    const tbody = document.getElementById('wl-table-body');
    if (!tbody) return;

    try {
        const { data, error } = await supabaseClient.from('waiting_list').select('*').order('id', { ascending: true }); 
        if (error) throw error;
        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center small-label">⏳ Активных задач нет</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        data.forEach(task => {
            const dateObj = new Date(task.callback_at);
            const formattedDate = dateObj.toLocaleDateString('ru-RU') + ' ' + dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            
            row.onclick = function(e) {
                if (!e.target.classList.contains('wl-id-cell') && !e.target.closest('.wl-status-cell')) editTaskInForm(task.id, task.classifier, task.comment, task.callback_at);
            };

            row.innerHTML = `
                <td class="wl-id-cell" onclick="copyTaskIdToClipboard(event, '${task.id}')">${task.id}</td>
                <td><span class="wl-badge">${task.classifier}</span></td>
                <td>${task.comment || '-'}</td><td>${formattedDate}</td><td>${task.operator_name}</td>
                <td class="wl-status-cell" onclick="confirmAndDeleteTask(event, ${task.id})"><span class="wl-status-btn">● ${task.status}</span></td>
            `;
            tbody.appendChild(row);
        });
        filterWaitingList();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:var(--danger)">❌ Ошибка загрузки: ${err.message}</td></tr>`;
    }
}

function editTaskInForm(id, classifier, comment, callbackAt) {
    const formBlock = document.getElementById('wl-add-form-block');
    formBlock.classList.add('active');
    const idInput = document.getElementById('wl-input-id');
    idInput.value = id; idInput.readOnly = true; idInput.style.opacity = '0.6';
    document.getElementById('wl-input-classifier').value = classifier;
    document.getElementById('wl-input-comment').value = comment;
    
    if (callbackAt) {
        const localDate = new Date(callbackAt);
        document.getElementById('wl-input-callback').value = new Date(localDate - localDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
    
    const saveBtn = document.querySelector('.wl-btn-save');
    if (saveBtn) { saveBtn.innerText = 'Обновить задачу'; saveBtn.setAttribute('onclick', 'updateTaskInSupabase()'); saveBtn.style.background = 'var(--success)'; }
    if (document.getElementById('wl-btn-delete')) document.getElementById('wl-btn-delete').classList.remove('hide');
}

async function saveNewTaskToSupabase() {
    const taskId = document.getElementById('wl-input-id').value.trim();
    if (!taskId || !document.getElementById('wl-input-callback').value) { alert('⚠️ Заполните ID и время!'); return; }

    const saveBtn = document.querySelector('.wl-btn-save');
    saveBtn.innerText = 'Сохранение...'; saveBtn.disabled = true;

    try {
        const { error } = await supabaseClient.from('waiting_list').insert([{
            id: parseInt(taskId, 10), classifier: document.getElementById('wl-input-classifier').value,
            comment: document.getElementById('wl-input-comment').value.trim() || null,
            callback_at: document.getElementById('wl-input-callback').value, 
            operator_name: document.getElementById('wl-input-operator').value, status: 'В работе'
        }]);
        if (error) throw error;
        alert('🎉 Задача успешно сохранена!');
        resetWlFormToDefault();
    } catch (err) { alert('❌ Ошибка: ' + err.message); } 
    finally { saveBtn.innerText = 'Сохранить'; saveBtn.disabled = false; }
}

async function updateTaskInSupabase() {
    const taskId = document.getElementById('wl-input-id').value;
    const saveBtn = document.querySelector('.wl-btn-save');
    saveBtn.innerText = 'Обновление...'; saveBtn.disabled = true;

    try {
        const { error } = await supabaseClient.from('waiting_list').update({
            classifier: document.getElementById('wl-input-classifier').value,
            comment: document.getElementById('wl-input-comment').value.trim() || null,
            callback_at: document.getElementById('wl-input-callback').value,
            operator_name: document.getElementById('wl-input-operator').value
        }).eq('id', parseInt(taskId, 10));
        if (error) throw error;
        alert('🔄 Задача успешно обновлена!');
        resetWlFormToDefault();
    } catch (err) { alert('❌ Ошибка: ' + err.message); } 
    finally { saveBtn.disabled = false; }
}

function resetWlFormToDefault() {
    resetWlFormInputsOnly();
    if (document.getElementById('wl-btn-delete')) document.getElementById('wl-btn-delete').classList.add('hide');
    if (document.getElementById('wl-add-form-block')) document.getElementById('wl-add-form-block').classList.remove('active');
    const saveBtn = document.querySelector('.wl-btn-save');
    if (saveBtn) { saveBtn.innerText = 'Сохранить'; saveBtn.setAttribute('onclick', 'saveNewTaskToSupabase()'); saveBtn.style.background = 'var(--primary)'; }
    loadWaitingList();
}

async function deleteCurrentEditingTask() {
    const taskId = document.getElementById('wl-input-id')?.value;
    if (!taskId || !confirm(`Удалить задачу №${taskId}?`)) return;
    try {
        await supabaseClient.from('waiting_list').delete().eq('id', parseInt(taskId, 10));
        resetWlFormToDefault();
    } catch (err) { alert('❌ Ошибка: ' + err.message); }
}

async function confirmAndDeleteTask(event, taskId) {
    event.stopPropagation();
    if (!confirm(`Завершить задачу №${taskId}?`)) return;
    try {
        event.currentTarget.innerHTML = '<span class="small-label">Удаление...</span>';
        await supabaseClient.from('waiting_list').delete().eq('id', taskId);
        if (document.getElementById('wl-input-id')?.value == taskId) resetWlFormToDefault();
        else loadWaitingList();
    } catch (err) { alert('❌ Ошибка: ' + err.message); loadWaitingList(); }
}

function copyTaskIdToClipboard(event, idText) {
    event.stopPropagation();
    navigator.clipboard.writeText(idText.trim()).then(() => {
        const cell = event.currentTarget;
        const originalColor = cell.style.color;
        cell.style.color = 'var(--success)'; cell.innerText = 'Скопировано!';
        setTimeout(() => { cell.style.color = originalColor; cell.innerText = idText.trim(); }, 600);
    });
}

function openQuickWaitingListModal() {
    const modal = document.getElementById('modal-quick-wl');
    if (!modal) return;
    document.getElementById('quick-wl-id').value = '';
    document.getElementById('quick-wl-comment').value = '';
    if (document.getElementById('quick-wl-callback')) document.getElementById('quick-wl-callback').value = document.getElementById('script-deliv-date')?.value || '';
    if (document.getElementById('quick-wl-operator')) document.getElementById('quick-wl-operator').value = currentOperatorName;
    modal.style.display = 'flex'; modal.classList.add('open');
}
function closeQuickWaitingListModal() {
    const modal = document.getElementById('modal-quick-wl');
    if (modal) { modal.classList.remove('open'); setTimeout(() => modal.style.display = 'none', 200); }
}

async function saveQuickWaitingListTask() {
    const taskId = document.getElementById('quick-wl-id')?.value.trim();
    if (!taskId) { alert('❌ Введите ID задачи!'); return; }
    
    const saveBtn = document.getElementById('btn-save-quick-wl');
    saveBtn.innerText = 'Сохранение...'; saveBtn.disabled = true;

    try {
        const { error } = await supabaseClient.from('waiting_list').insert([{
            id: parseInt(taskId, 10), classifier: document.getElementById('quick-wl-classifier').value,
            comment: document.getElementById('quick-wl-comment').value.trim() || null,
            callback_at: document.getElementById('quick-wl-callback').value,
            operator_name: document.getElementById('quick-wl-operator').value, status: 'В работе'
        }]);
        if (error) throw error;
        closeQuickWaitingListModal();
        alert('🎉 Задача сохранена!');
        loadWaitingList();
    } catch (err) { alert('❌ Ошибка: ' + err.message); } 
    finally { saveBtn.innerText = 'Сохранить'; saveBtn.disabled = false; }
}

function filterWaitingList() {
    const query = document.getElementById('wl-search-input')?.value.trim() || "";
    if (document.getElementById('wl-search-clear')) document.getElementById('wl-search-clear').style.opacity = query.length > 0 ? '1' : '0';
    const rows = document.getElementById('wl-table-body')?.querySelectorAll('tr');
    if (!rows) return;

    let visibleCount = 0;
    rows.forEach(row => {
        if (row.querySelector('.small-label')) return;
        if (!query || row.cells[0]?.innerText.trim().startsWith(query)) { row.style.display = ''; visibleCount++; }
        else { row.style.display = 'none'; }
    });
}

function clearWaitingListSearch() {
    const searchInput = document.getElementById('wl-search-input');
    if (searchInput) { searchInput.value = ''; searchInput.focus(); }
    filterWaitingList();
}

function updateAllOperatorInputs(operatorName) {
    if (document.getElementById('wl-input-operator')) document.getElementById('wl-input-operator').value = operatorName;
    if (document.getElementById('quick-wl-operator')) document.getElementById('quick-wl-operator').value = operatorName;
}

// ========================================================
// ✉️ ШАБЛОНЫ ОТПРАВКИ
// ========================================================
async function loadShablons() {
    const container = document.getElementById('shablon-list-container');
    if (!container) return;

    try {
        const { data, error } = await supabaseClient.from('shablon').select('name, text');
        if (error) throw error;
        shablonDataList = data || [];

        if (shablonDataList.length === 0) {
            container.innerHTML = `<div class="text-center small-label" style="padding:20px;">Шаблоны не найдены</div>`;
            return;
        }

        container.innerHTML = '';
        shablonDataList.forEach((item, index) => {
            const btn = document.createElement('button');
            btn.className = 'shablon-card-btn';
            btn.innerHTML = `<div class="shablon-left-content"><div class="shablon-icon-box">📄</div><span class="shablon-title-text">${item.name}</span></div><span class="shablon-hint-tag">Скопировать</span>`;
            btn.onclick = () => copyShablonByIndex(index, btn);
            container.appendChild(btn);
        });
    } catch (err) { container.innerHTML = `<div class="text-center" style="color:var(--danger)">❌ Ошибка загрузки</div>`; }
}

function copyShablonByIndex(index, btnElement) {
    const shablon = shablonDataList[index];
    if (!shablon || !shablon.text) return;

    navigator.clipboard.writeText(shablon.text).then(() => {
        const iconBox = btnElement.querySelector('.shablon-icon-box');
        const titleText = btnElement.querySelector('.shablon-title-text');
        const origIcon = iconBox.innerText; const origTitle = titleText.innerText;
        btnElement.classList.add('copied');
        iconBox.innerText = '✅'; titleText.innerText = 'Скопировано в буфер!';
        setTimeout(() => {
            btnElement.classList.remove('copied');
            iconBox.innerText = origIcon; titleText.innerText = origTitle;
        }, 1100);
    });
}