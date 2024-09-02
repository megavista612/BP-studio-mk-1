const API_BASE_URL = 'https://rt.data.gov.hk/';
let lastReloadTime = null;
let countdownIntervals = [];
let etaUpdateInterval;
const UPDATE_INTERVAL = 20000; // 20 seconds

// Add this at the top of the file with other global variables
let etaHistory = [];
const MAX_HISTORY_LENGTH = 9;

async function findBusInfo() {
    const resultsDiv = document.getElementById('results');
    if (!resultsDiv) {
        console.error('Results div not found');
        return;
    }
    resultsDiv.innerHTML = '<p style="text-align: center;">Loading...</p>';

    try {
        console.log('Starting bus info search for route 720');
        
        // Clear any existing interval
        clearInterval(etaUpdateInterval);
        
        // Initial fetch and display
        await fetchAndDisplayETA();
        
        // Set up interval to fetch and display ETA every 20 seconds
        etaUpdateInterval = setInterval(fetchAndDisplayETA, UPDATE_INTERVAL);
        
        updateReloadInfo();
    } catch (error) {
        console.error('Error in findBusInfo:', error);
        resultsDiv.innerHTML = `<p style="color: red; text-align: center;">Error: ${error.message}</p>`;
    }
}

async function fetchAndDisplayETA() {
    const resultsDiv = document.getElementById('results');
    
    try {
        // Fetch ETA for outbound stop (Cityplaza, towards Central) and its previous stop
        const outboundETA = await fetchETA('CTB', '001379', '720', 'O');
        const outboundPreviousETA = await fetchETA('CTB', '002791', '720', 'O');
        
        // Fetch ETA for inbound stop (Jardine House, towards Taikoo Shing) and its previous stop
        const inboundETA = await fetchETA('CTB', '001030', '720', 'I');
        const inboundPreviousETA = await fetchETA('CTB', '001049', '720', 'I');

        // Fetch ETA for Wan Chai Ferry Pier stop (towards Taikoo Shing) and its previous stop
        const wanChaiETA = await fetchETA('CTB', '002559', '720', 'I');
        const wanChaiPreviousETA = await fetchETA('CTB', '002423', '720', 'I');

        const currentHour = new Date().getHours();
        const currentDay = new Date().getDay();
        const isWeekend = (currentDay === 6 || currentDay === 0); // Saturday or Sunday
        const isAfternoonOrEvening = (currentHour >= 15 && currentHour <= 23);

        const isWorkTime = !isWeekend || (isWeekend && isAfternoonOrEvening);

        // Remove duplicates from ETAs
        const uniqueOutboundETA = removeDuplicateETAs(outboundETA);
        const uniqueInboundETA = removeDuplicateETAs(inboundETA);
        const uniqueWanChaiETA = removeDuplicateETAs(wanChaiETA);

        // Log ETA information
        logETAInfo({
            outbound: uniqueOutboundETA,
            inbound: uniqueInboundETA,
            wanChai: uniqueWanChaiETA
        });

        const sections = [
            {
                title: "Route 720 Outbound (towards Central)",
                subtitle: "Cityplaza, Taikoo Shing Road",
                icon: "fas fa-building",
                etaData: uniqueOutboundETA,
                previousStopETA: outboundPreviousETA,
                previousStopName: "Kao Shan Terrace, Taikoo Shing Road",
                isOutbound: true
            },
            {
                title: "Route 720 Inbound (towards Taikoo Shing)",
                subtitle: "Jardine House, Connaught Road Central",
                icon: "fas fa-landmark",
                etaData: uniqueInboundETA,
                previousStopETA: inboundPreviousETA,
                previousStopName: "Douglas Street, Des Voeux Road Central",
                isOutbound: false
            },
            {
                title: "Route 720 From Wan Chai Ferry Pier (towards Taikoo Shing)",
                subtitle: "Wan Chai Ferry Pier",
                icon: "fas fa-ferry",
                etaData: uniqueWanChaiETA,
                previousStopETA: wanChaiPreviousETA,
                previousStopName: "Convention Avenue",
                isOutbound: false
            }
        ];

        const sectionsHtml = sections.map(section => `
            <div class="card">
                <div class="card-header">
                    <h2>${section.title}</h2>
                    <h3><i class="${section.icon}"></i> ${section.subtitle}</h3>
                </div>
                <div class="card-body">
                    ${formatETAList(section.etaData, checkPreviousStop(section.previousStopETA, section.etaData, section.previousStopName), section.isOutbound)}
                </div>
            </div>
        `).join('');

        // Display results
        resultsDiv.innerHTML = `
            <div class="eta-wrapper">
                ${sectionsHtml}
            </div>
        `;

        // Add last updated time
        const lastUpdated = new Date().toLocaleTimeString();
        resultsDiv.innerHTML += `<p class="last-updated">Last updated: ${lastUpdated}</p>`;

        console.log("ETA information displayed and updated");
    } catch (error) {
        console.error('Error in fetchAndDisplayETA:', error);
        resultsDiv.innerHTML = `<p style="color: red; text-align: center;">Error updating ETA: ${error.message}</p>`;
    }
}

// Add this new function to remove duplicate ETAs
function removeDuplicateETAs(etaData) {
    const uniqueETAs = [];
    const seenSequences = new Set();

    for (const eta of etaData) {
        if (!seenSequences.has(eta.eta_seq)) {
            uniqueETAs.push(eta);
            seenSequences.add(eta.eta_seq);
        }
    }

    return uniqueETAs;
}

function formatETAList(etaData, previousStopInfo, isOutbound) {
    if (etaData.length === 0) {
        return '<p>No ETA information available.</p>';
    }

    const now = new Date();
    let etaHtml = '<div class="eta-container">';

    // Sort ETAs by sequence
    etaData.sort((a, b) => a.eta_seq - b.eta_seq);

    // Process ETA 1 (next bus) first
    const nextBus = etaData.find(eta => eta.eta_seq === 1);
    if (nextBus) {
        const etaTime = new Date(nextBus.eta);
        const etaId = `eta-${nextBus.eta_seq}-${etaTime.getTime()}`;
        const timeDiff = etaTime - now;
        
        let statusHtml;
        if (timeDiff < 0) {
            statusHtml = `<p class="next-bus-eta">Bus has left <span id="${etaId}-ago">${formatTimeDifference(-timeDiff)}</span> ago</p>`;
            countdownIntervals.push(setInterval(() => updateTimeSinceBusLeft(etaId, etaTime), 1000));
        } else {
            statusHtml = `
                <p class="next-bus-eta" style="font-size: 1.5em;"><span id="${etaId}"></span></p>
                <p style="font-size: 0.9em;">@ ${formatTime12H(etaTime)}</p>
            `;
            updateCountdown(etaId, etaTime);
            countdownIntervals.push(setInterval(() => updateCountdown(etaId, etaTime), 1000));
        }

        const delayInfo = checkDelay(nextBus, 1, isOutbound ? 'outbound' : 'inbound');

        // Determine the correct destination based on the route direction
        const destination = isOutbound ? "Central" : "Taikoo Shing";

        etaHtml += `
            <div class="next-bus">
                <h4>Next Bus</h4>
                ${statusHtml}
                <p>To: ${destination}</p>
                ${delayInfo}
                <div class="previous-stop-info">
                    ${previousStopInfo}
                </div>
            </div>
        `;
    }

    // Process remaining ETAs (up to 3 total)
    etaHtml += '<div class="other-buses">';
    etaData.filter(eta => eta.eta_seq > 1 && eta.eta_seq <= 3).forEach(eta => {
        const etaTime = new Date(eta.eta);
        const etaId = `eta-${eta.eta_seq}-${etaTime.getTime()}`;
        const timeDiff = etaTime - now;
        
        let statusHtml;
        if (timeDiff < 0) {
            statusHtml = `<p>Bus has left <span id="${etaId}-ago">${formatTimeDifference(-timeDiff)}</span> ago</p>`;
            countdownIntervals.push(setInterval(() => updateTimeSinceBusLeft(etaId, etaTime), 1000));
        } else {
            statusHtml = `
                <p><span id="${etaId}"></span></p>
                <p style="font-size: 0.9em;">@ ${formatTime12H(etaTime)}</p>
            `;
            updateCountdown(etaId, etaTime);
            countdownIntervals.push(setInterval(() => updateCountdown(etaId, etaTime), 1000));
        }

        const delayInfo = checkDelay(eta, eta.eta_seq, isOutbound ? 'outbound' : 'inbound');

        // Determine the correct destination based on the route direction
        const destination = isOutbound ? "Central" : "Taikoo Shing";

        etaHtml += `
            <div class="eta-item">
                <h4>ETA ${eta.eta_seq}</h4>
                ${statusHtml}
                <p>To: ${destination}</p>
                ${delayInfo}
            </div>
        `;
    });
    etaHtml += '</div></div>';

    return etaHtml;
}

function updateCountdown(etaId, etaTime) {
    const countdownElement = document.getElementById(etaId);
    if (countdownElement) {
        const now = new Date();
        const timeDiff = etaTime - now;
        
        if (timeDiff < 0) {
            countdownElement.textContent = `Bus has left ${formatTimeDifference(-timeDiff)} ago`;
            // Switch to updating time since bus left
            clearInterval(countdownIntervals.find(interval => interval._id === etaId));
            countdownIntervals.push(setInterval(() => updateTimeSinceBusLeft(etaId, etaTime), 1000));
        } else {
            const minutes = Math.floor(timeDiff / 60000);
            const seconds = Math.floor((timeDiff % 60000) / 1000);
            countdownElement.textContent = `${minutes} min ${seconds} sec`;
        }
    }
}

function updateTimeSinceBusLeft(etaId, etaTime) {
    const countdownElement = document.getElementById(`${etaId}-ago`);
    if (countdownElement) {
        const now = new Date();
        const timeDiff = now - etaTime;
        countdownElement.textContent = formatTimeDifference(timeDiff);
    }
}

function checkPreviousStop(previousStopETA, currentStopETA, stopName) {
    if (currentStopETA.length === 0) {
        return `<p>Cannot determine if the bus has left the previous stop (${stopName}).</p>`;
    }

    const currentETA = new Date(currentStopETA.find(eta => eta.eta_seq === 1)?.eta);
    const now = new Date();

    // Check if ETA seq 1 is unavailable for the previous stop
    const previousETA = previousStopETA.find(eta => eta.eta_seq === 1)?.eta
        ? new Date(previousStopETA.find(eta => eta.eta_seq === 1).eta)
        : null;

    let status;
    if (currentETA < now) {
        // If the current ETA is in the past, the bus has already left
        status = `<p style="font-size: 0.9em; color: #666;">Bus has already left this stop.</p>`;
    } else if (!previousETA && previousStopETA.find(eta => eta.eta_seq === 2)) {
        // If ETA seq 1 is unavailable but seq 2 is available, the bus has left the previous stop
        status = `
            <div class="bus-on-way-alert">
                <i class="fas fa-bus"></i>
                <p class="bus-status highlight" style="font-size: 0.9em;">Bus has left the previous stop (${stopName}) and is on its way!</p>
            </div>
        `;
        // Optionally play a sound
        // playAlertSound();
    } else if (previousETA && previousETA < currentETA) {
        status = `<p class="bus-status" style="font-size: 0.9em; color: #666;">Bus has not yet left the previous stop: ${stopName}.</p>`;
    } else {
        status = `
            <div class="bus-on-way-alert">
                <i class="fas fa-bus"></i>
                <p class="bus-status highlight" style="font-size: 0.9em;">Bus is likely on its way from the previous stop: ${stopName}!</p>
            </div>
        `;
        // Optionally play a sound
        // playAlertSound();
    }

    const estimatedTravelTime = calculateEstimatedTravelTime(previousStopETA, currentStopETA);
    const etaInfo = JSON.stringify({ previous: previousStopETA, current: currentStopETA, stopName: stopName });
    
    return `
        ${status}
        <p style="font-size: 0.9em; color: #666;">
            <span class="estimated-travel-time" onmouseover="showETAInfo(this)" onmouseout="hideETAInfo()" data-eta-info='${etaInfo}'>
                Estimated travel time from previous stop: ${estimatedTravelTime}
            </span>
        </p>
    `;
}

// Optional: Add this function if you want to play a sound
function playAlertSound() {
    const audio = new Audio('path/to/your/alert-sound.mp3');
    audio.play();
}

function calculateEstimatedTravelTime(previousStopETA, currentStopETA) {
    const travelTimes = [];

    for (let seq = 1; seq <= 3; seq++) {
        const prevETA = previousStopETA.find(eta => eta.eta_seq === seq);
        const currETA = currentStopETA.find(eta => eta.eta_seq === seq);

        if (prevETA && currETA) {
            const prevTime = new Date(prevETA.eta);
            const currTime = new Date(currETA.eta);
            const diffSeconds = (currTime - prevTime) / 1000;
            
            // Only consider positive time differences
            if (diffSeconds > 0) {
                travelTimes.push(diffSeconds);
            }
        }
    }

    if (travelTimes.length === 0) {
        return "Unable to estimate";
    }

    // Calculate the average, excluding any outliers
    const averageTravelTime = calculateAverageExcludingOutliers(travelTimes);
    
    return formatDuration(Math.round(averageTravelTime));
}

function calculateAverageExcludingOutliers(numbers) {
    if (numbers.length < 3) {
        return numbers.reduce((a, b) => a + b, 0) / numbers.length;
    }

    // Sort the numbers
    numbers.sort((a, b) => a - b);

    // Calculate Q1 and Q3
    const q1 = numbers[Math.floor(numbers.length / 4)];
    const q3 = numbers[Math.floor(3 * numbers.length / 4)];

    // Calculate IQR
    const iqr = q3 - q1;

    // Define bounds for outliers
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    // Filter out outliers and calculate average
    const filteredNumbers = numbers.filter(num => num >= lowerBound && num <= upperBound);
    return filteredNumbers.reduce((a, b) => a + b, 0) / filteredNumbers.length;
}

function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

async function fetchETA(companyId, stopId, routeNumber, direction) {
    const url = `${API_BASE_URL}v2/transport/citybus/eta/${companyId}/${stopId}/${routeNumber}`;
    console.log(`Fetching ETA from:`, url);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log(`ETA data:`, data);
    
    // Filter the data based on the direction
    const filteredData = data.data.filter(eta => eta.dir === direction);
    return filteredData;
}

function updateReloadInfo() {
    const reloadInfoDiv = document.getElementById('reloadInfo');
    if (!reloadInfoDiv) {
        console.warn('Reload info div not found');
        return;
    }
    lastReloadTime = new Date();
    reloadInfoDiv.innerHTML = `
        <p>Last reload: ${lastReloadTime.toLocaleTimeString()}</p>
        <p>Time since last reload: <span id="elapsedTime">0</span> seconds</p>
    `;
    
    // Update elapsed time every second
    setInterval(() => {
        const elapsedTimeSpan = document.getElementById('elapsedTime');
        if (elapsedTimeSpan) {
            const elapsedSeconds = Math.floor((new Date() - lastReloadTime) / 1000);
            elapsedTimeSpan.textContent = elapsedSeconds;
        }
    }, 1000);
}

function formatTime12H(date) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatTimeDifference(timeDiff) {
    const minutes = Math.floor(timeDiff / 60000);
    const seconds = Math.floor((timeDiff % 60000) / 1000);
    return `${minutes} min ${seconds} seconds`;
}

// Add an event listener to clear the interval when the user leaves the page
window.addEventListener('beforeunload', () => {
    clearInterval(etaUpdateInterval);
    // Clear all countdown intervals
    countdownIntervals.forEach(interval => clearInterval(interval));
    countdownIntervals = [];
});

function showETAInfo(element) {
    const etaInfo = JSON.parse(element.getAttribute('data-eta-info'));
    let infoHtml = '<div id="etaInfoPopup" style="position: absolute; background: white; border: 1px solid black; padding: 5px; z-index: 1000; font-size: 0.8em; max-width: 250px;">';
    infoHtml += `<h4 style="margin: 0 0 5px 0;">ETA Information Used:</h4>`;
    infoHtml += `<h5 style="margin: 0 0 3px 0;">Previous Stop: ${etaInfo.stopName}</h5>`;
    infoHtml += formatETAInfoList(etaInfo.previous);
    infoHtml += `<h5 style="margin: 5px 0 3px 0;">Current Stop:</h5>`;
    infoHtml += formatETAInfoList(etaInfo.current);
    infoHtml += '</div>';

    document.body.insertAdjacentHTML('beforeend', infoHtml);
    positionPopup(element);
}

function hideETAInfo() {
    const popup = document.getElementById('etaInfoPopup');
    if (popup) {
        popup.remove();
    }
}

function formatETAInfoList(etaList) {
    if (!etaList || etaList.length === 0) return '<p>No ETA data available</p>';
    return '<ul>' + etaList.map(eta => `<li>ETA ${eta.eta_seq}: ${new Date(eta.eta).toLocaleTimeString()}</li>`).join('') + '</ul>';
}

function positionPopup(element) {
    const popup = document.getElementById('etaInfoPopup');
    const rect = element.getBoundingClientRect();
    popup.style.left = `${rect.left}px`;
    popup.style.top = `${rect.bottom + window.scrollY}px`;
}

// Add this new function at the end of the file
function initializePage() {
   

    // Call findBusInfo to initialize the page content
    findBusInfo();
}

// Add an event listener for when the DOM content is loaded
document.addEventListener('DOMContentLoaded', () => {
    addButtonStyles();
    initializePage();
});

function logETAInfo(etaData) {
    etaHistory.push({
        timestamp: new Date(),
        data: etaData
    });

    if (etaHistory.length > MAX_HISTORY_LENGTH) {
        etaHistory.shift(); // Remove the oldest entry
    }

    console.log('ETA History:', etaHistory);
}

function checkDelay(currentETA, seqNumber, routeType) {
    // Only check delay for ETA1
    if (seqNumber !== 1) {
        return '';
    }

    const delayInfo = [];

    // Check delays for 1, 2, and 3 minutes ago
    for (let minutesAgo = 1; minutesAgo <= 3; minutesAgo++) {
        if (etaHistory.length < 3 * minutesAgo) {
            break; // Not enough history to compare for this time point
        }

        const historicalEntry = etaHistory[etaHistory.length - (3 * minutesAgo)];
        if (!historicalEntry || !historicalEntry.data || !historicalEntry.data[routeType]) {
            continue; // Skip if no matching data found
        }

        const historicalETA = historicalEntry.data[routeType].find(eta => eta.eta_seq === seqNumber);
        if (!historicalETA) {
            continue; // Skip if no matching ETA found
        }

        const currentETATime = new Date(currentETA.eta);
        const historicalETATime = new Date(historicalETA.eta);
        const delayDiff = currentETATime - historicalETATime;

        let delayText = '';
        if (delayDiff > 0) {
            delayText = `<p class="delay-info" style="color: red; font-size: 0.8em;">Bus is delayed by ${formatTimeDifference(delayDiff)} compared to ${minutesAgo} minute${minutesAgo > 1 ? 's' : ''} ago</p>`;
        } else if (delayDiff < 0) {
            delayText = `<p class="delay-info" style="color: green; font-size: 0.8em;">Bus is ${formatTimeDifference(-delayDiff)} earlier compared to ${minutesAgo} minute${minutesAgo > 1 ? 's' : ''} ago</p>`;
        }
        // If delayDiff is 0, we don't add any text

        if (delayText) {
            delayInfo.push(delayText);
        }
    }

    return delayInfo.join('');
}

function addButtonStyles() {
    const style = document.createElement('style');
    style.textContent = `
        body {
            background-color: white;
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
        }

        .button-50 {
            appearance: button;
            background-color: #000;
            background-image: none;
            border: 1px solid #000;
            border-radius: 4px;
            box-shadow: #fff 4px 4px 0 0,#000 4px 4px 0 1px;
            box-sizing: border-box;
            color: #fff;
            cursor: pointer;
            display: inline-block;
            font-family: ITCAvantGardeStd-Bk,Arial,sans-serif;
            font-size: 14px;
            font-weight: 400;
            line-height: 20px;
            margin: 0 5px 10px 0;
            overflow: visible;
            padding: 12px 40px;
            text-align: center;
            text-transform: none;
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;
            vertical-align: middle;
            white-space: nowrap;
        }

        .button-50:focus {
            text-decoration: none;
        }

        .button-50:hover {
            text-decoration: none;
        }

        .button-50:active {
            box-shadow: rgba(0, 0, 0, .125) 0 3px 5px inset;
            outline: 0;
        }

        .button-50:not([disabled]):active {
            box-shadow: #fff 2px 2px 0 0, #000 2px 2px 0 1px;
            transform: translate(2px, 2px);
        }

        @media (min-width: 768px) {
            .button-50 {
                padding: 12px 50px;
            }
        }

        .card {
            border: 1px solid #ddd;
            border-radius: 8px;
            margin: 20px 0;
            overflow: hidden;
            background-color: #fff;
            width: 100%;
        }

        .card-header {
            background-color: #f5f5f5;
            padding: 15px;
            border-bottom: 1px solid #ddd;
        }

        .card-body {
            padding: 15px;
        }

        .eta-wrapper {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            width: 100%;
        }

        .time-message {
            font-size: 1.2em;
            margin-bottom: 20px;
        }

        .last-updated {
            margin-top: 20px;
            font-size: 0.9em;
            color: #666;
        }

        #reloadInfo {
            margin-top: 20px;
            font-size: 0.9em;
            color: #666;
        }

        .card-header h2 {
            font-size: 1.2em;
            line-height: 1.2;
            margin-bottom: 5px;
        }

        .card-header h3 {
            font-size: 1em;
            line-height: 1.2;
        }

        .eta-container {
            display: flex;
            justify-content: space-between;
            width: 100%;
        }

        .next-bus {
            width: 65%;
            background-color: white;
            padding: 15px;
            border-radius: 5px;
            margin-right: 10px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            border: 1px solid black;
        }

        .other-buses {
            width: 30%;
            display: flex;
            flex-direction: column;
        }

        .eta-item {
            background-color: white;
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 10px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        }
    `;
    document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded', () => {
    addButtonStyles();
    initializePage();
});