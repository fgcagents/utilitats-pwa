// Funció per obtenir l'hora actual en format HH:MM
function getCurrentTime() {
    const currentDate = new Date();
    return currentDate.toTimeString().slice(0, 5); // Retornem només HH:MM
}

// Funció per obtenir la data actual en format YYYY-MM-DD
function getCurrentDate() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

// Funció per corregir hores com 24:25 a 00:25
function corregirHora(horaStr) {
    let [hores, minuts] = horaStr.split(':').map(Number);
    if (hores >= 24) {
        hores -= 24;
        return `${hores.toString().padStart(2, '0')}:${minuts.toString().padStart(2, '0')}`;
    }
    return horaStr;
}

// Funció per obtenir dades del cache o de l'API
async function getStationData(stationCode) {
    const cacheKey = `fgc_station_${stationCode}`;
    const cacheDateKey = `fgc_station_${stationCode}_date`;
    const currentDate = getCurrentDate();

    // Comprovar si tenim cache vàlid
    const cachedDate = localStorage.getItem(cacheDateKey);
    const cachedData = localStorage.getItem(cacheKey);

    if (cachedDate === currentDate && cachedData) {
        console.log(`✓ Dades carregades des del cache (${stationCode})`);
        return JSON.parse(cachedData);
    }

    // Si no hi ha cache vàlid, carregar de l'API
    console.log(`⟳ Carregant dades des de l'API (${stationCode})...`);
    const allResults = await fetchAllRecordsFromAPI(stationCode);

    // Guardar al cache amb la data actual
    try {
        localStorage.setItem(cacheKey, JSON.stringify(allResults));
        localStorage.setItem(cacheDateKey, currentDate);
        console.log(`✓ Dades guardades al cache (${allResults.length} registres)`);
    } catch (e) {
        console.warn('No s\'ha pogut guardar al cache:', e);
    }

    return allResults;
}

// Funció per obtenir TOTS els registres de l'API amb paginació
async function fetchAllRecordsFromAPI(stationCode) {
    const baseUrl = 'https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/viajes-de-hoy/records';
    let allResults = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    // Cerquem per prefix de stop_id (p.ex. "SR" trobarà "SR1", "SR2"...) en comptes
    // de parent_station, que per algunes estacions (com Nacions Unides) ve buit/erroni.
    while (hasMore) {
        const url = `${baseUrl}?limit=${limit}&offset=${offset}&where=startswith(stop_id,"${stationCode}")`;
        
        try {
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
                allResults = allResults.concat(data.results);
                offset += limit;
                
                // Si hem rebut menys resultats que el límit, ja no n'hi ha més
                if (data.results.length < limit) {
                    hasMore = false;
                }
                
                // Seguretat: màxim 1000 registres (10 pàgines)
                if (offset >= 1000) {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        } catch (error) {
            console.error('Error en la petició:', error);
            hasMore = false;
        }
    }
    
    return allResults;
}

// Funció per netejar cache antic (opcional, per manteniment)
function cleanOldCache() {
    const currentDate = getCurrentDate();
    const keysToRemove = [];

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('fgc_station_') && key.endsWith('_date')) {
            const cachedDate = localStorage.getItem(key);
            if (cachedDate !== currentDate) {
                // Marcar per esborrar
                const stationKey = key.replace('_date', '');
                keysToRemove.push(key);
                keysToRemove.push(stationKey);
            }
        }
    }

    // Esborrar cache antic
    keysToRemove.forEach(key => localStorage.removeItem(key));
    if (keysToRemove.length > 0) {
        console.log(`🗑️ Cache antic netejat (${keysToRemove.length / 2} estacions)`);
    }
}

// Funció per obtenir les dades i mostrar-les
async function fetchTrainData(stationCode, trainCount, selectedTime, lineName) {
    // Convertir el codi d'estació a majúscules
    stationCode = stationCode.toUpperCase();
    
    // Mostrar indicador de càrrega
    const scheduleDiv = document.getElementById('train-schedule');
    const cachedDate = localStorage.getItem(`fgc_station_${stationCode}_date`);
    const currentDate = getCurrentDate();
    const isFromCache = cachedDate === currentDate;
    
    scheduleDiv.innerHTML = `<div class="loading">${isFromCache ? '⚡ Carregant des del cache...' : '⟳ Carregant dades de l\'API...'}</div>`;

    try {
        // Obtenir dades (cache o API)
        let allTrains = await getStationData(stationCode);

        console.log('Total trens obtinguts:', allTrains.length);

        // Si no s'ha seleccionat cap hora, fem servir l'hora actual
        let current_time = selectedTime || getCurrentTime();

        // Convertir hora seleccionada a minuts
        const [h, m] = current_time.split(':').map(Number);
        let horaIniciMin = h * 60 + m;

        // Ajustar si és després de mitjanit
        if (horaIniciMin < 240) horaIniciMin += 1440;

        // Funció auxiliar per convertir HH:MM a minuts
        const timeToMinutes = (timeStr) => {
            const [hh, mm] = timeStr.split(':').map(Number);
            let total = hh * 60 + mm;
            return total < 240 ? total + 1440 : total;
        };

        if (allTrains.length > 0) {
            // Filtrar i ordenar els trens
            const upcoming_trains = allTrains
                .filter(train => {
                    const trainMin = timeToMinutes(train.departure_time);
                    return trainMin >= horaIniciMin;
                })
                .filter(train => lineName === '' || train.route_short_name.toLowerCase() === lineName.toLowerCase())
                .sort((a, b) => timeToMinutes(a.departure_time) - timeToMinutes(b.departure_time));

            console.log(`Trens després de les ${current_time}: ${upcoming_trains.length}`);
            displayTrains(upcoming_trains, trainCount, isFromCache);
        } else {
            console.log('No s\'han trobat trens.');
            scheduleDiv.innerHTML = '<div class="no-trains">No s\'han trobat trens disponibles per aquesta estació</div>';
        }
    } catch (error) {
        console.error('Error obtenint dades de l\'API:', error);
        scheduleDiv.innerHTML = '<div class="error">Error en obtenir les dades. Verifica el codi d\'estació.</div>';
    }
}

// Funció per mostrar els trens a la pantalla
function displayTrains(trains, trainCount, isFromCache) {
    const scheduleDiv = document.getElementById('train-schedule');
    scheduleDiv.innerHTML = '';  // Esborrem el contingut anterior

    if (trains.length === 0) {
        scheduleDiv.innerHTML = '<div class="no-trains">No hi ha trens disponibles a partir d\'aquesta hora</div>';
        return;
    }

    // Afegir indicador de cache (opcional)
    if (isFromCache) {
        const cacheIndicator = document.createElement('div');
        cacheIndicator.style.cssText = 'font-size: 11px; color: #28a745; margin-bottom: 10px; text-align: center;';
        cacheIndicator.textContent = '⚡ Dades del cache (actualitzades avui)';
        scheduleDiv.appendChild(cacheIndicator);
    }

    trains.slice(0, trainCount).forEach(train => {
        const trainDiv = document.createElement('div');
        trainDiv.className = 'train';

        const lineIcon = document.createElement('div');
        lineIcon.className = `line-icon ${train.route_short_name.toLowerCase()}`;
        lineIcon.textContent = train.route_short_name;

        const destination = document.createElement('div');
        destination.className = 'destination';
        destination.textContent = train.trip_headsign;

        const time = document.createElement('div');
        time.className = 'time';
        time.textContent = corregirHora(train.departure_time);

        trainDiv.appendChild(lineIcon);
        trainDiv.appendChild(destination);
        trainDiv.appendChild(time);

        scheduleDiv.appendChild(trainDiv);
    });
}

// Funció per forçar actualització (esborrar cache)
function forceRefresh() {
    const stationCode = document.getElementById('station-code').value.trim().toUpperCase();
    if (stationCode) {
        localStorage.removeItem(`fgc_station_${stationCode}`);
        localStorage.removeItem(`fgc_station_${stationCode}_date`);
        console.log('🔄 Cache esborrat. Carregant dades fresques...');
        document.getElementById('station-form').dispatchEvent(new Event('submit'));
    }
}

// Auto-convertir el codi d'estació a majúscules
document.getElementById('station-code').addEventListener('input', function(e) {
    this.value = this.value.toUpperCase();
});

// Llistar trens inicialment amb valors per defecte
document.getElementById('station-form').addEventListener('submit', function(event) {
    event.preventDefault();

    // Obtenir valors del formulari
    const stationCode = document.getElementById('station-code').value.trim();
    const trainCount = document.getElementById('train-count').value || 8;
    const lineName = document.getElementById('line-name').value.trim();
    let selectedTime = document.getElementById('selected-time').value;

    // Si no s'ha seleccionat cap hora, agafem l'hora actual
    if (!selectedTime) {
        selectedTime = getCurrentTime();
    }

    // Actualitzar el nom de l'estació
    document.getElementById('station-name').textContent = `Estació: ${stationCode.toUpperCase()}`;

    // Obtenir i mostrar els trens
    fetchTrainData(stationCode, trainCount, selectedTime, lineName);
});

// Netejar cache antic al carregar la pàgina
cleanOldCache();

// Actualitzar any al footer
document.getElementById('current-year').textContent = new Date().getFullYear();