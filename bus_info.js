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

        // Check if it's after 18:00 from Monday to Friday
        const now = new Date();
        const isWeekday = now.getDay() >= 1 && now.getDay() <= 5;
        const isAfter1800 = now.getHours() >= 18;

        if (isWeekday && isAfter1800) {
            // Move the inbound route to the first position
            const inboundSection = sections.splice(1, 1)[0];
            sections.unshift(inboundSection);
        }

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
    let nextBus = etaData.find(eta => eta.eta_seq === 1);
    const routeType = isOutbound ? 'outbound' : 'inbound';

    let lastAvailableETA = null;
    if (!nextBus && etaHistory.length > 0) {
        // Search for the last available ETA seq 1 in the history
        for (let i = etaHistory.length - 1; i >= 0; i--) {
            const historyEntry = etaHistory[i].data[routeType];
            const historicalETA = historyEntry.find(eta => eta.eta_seq === 1);
            if (historicalETA) {
                lastAvailableETA = historicalETA;
                break;
            }
        }
    }

    if (nextBus || lastAvailableETA) {
        const busData = nextBus || lastAvailableETA;
        const etaTime = new Date(busData.eta);
        const etaId = `eta-${busData.eta_seq}-${etaTime.getTime()}`;
        const timeDiff = etaTime - now;

        let statusHtml;
        if (!nextBus || timeDiff < 0) {
            // If there's no current ETA seq 1 or the time difference is negative, the bus has left
            const timeSinceLeft = nextBus ? -timeDiff : now - etaTime;
            statusHtml = `<p class="next-bus-eta">Bus has left <span id="${etaId}-ago">${formatTimeDifference(timeSinceLeft)}</span> ago</p>`;
            countdownIntervals.push(setInterval(() => updateTimeSinceBusLeft(etaId, etaTime), 1000));
        } else {
            statusHtml = `
                <div class="flex items-center justify-start w-full gap-1.5 count-down-main">
                    <div class="timer">
                        <div id="${etaId}-minutes" class="countdown-element minutes font-manrope font-semibold text-lg text-0066cc text-center"></div>
                        <div class="countdown-label">Minutes</div>
                    </div>
                    <div class="separator">:</div>
                    <div class="timer">
                        <div id="${etaId}-seconds" class="countdown-element seconds sec font-manrope font-semibold text-lg text-0066cc text-center"></div>
                        <div class="countdown-label">Seconds</div>
                    </div>
                </div>
                <p>@${formatTime12H(etaTime)}</p>
            `;
            updateCountdown(etaId, etaTime);
            countdownIntervals.push(setInterval(() => updateCountdown(etaId, etaTime), 1000));
        }

        const delayInfo = checkDelay(busData, 1, routeType);

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
                ${isOutbound ? '' : '<button onclick="showDrivingTime()" class="button-50 small-button">Show est. driving time</button>'}
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
                <p><span id="${etaId}" class="other-bus-countdown"></span></p>
                <p style="font-size: 0.9em;">@ ${formatTime12H(etaTime)}</p>
            `;
            updateOtherBusCountdown(etaId, etaTime);
            countdownIntervals.push(setInterval(() => updateOtherBusCountdown(etaId, etaTime), 1000));
        }

        const delayInfo = checkDelay(eta, eta.eta_seq, routeType);

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
    const now = new Date();
    const timeDiff = etaTime - now;

    if (timeDiff < 0) {
        clearInterval(countdownIntervals.find(interval => interval._id === etaId));
        countdownIntervals.push(setInterval(() => updateTimeSinceBusLeft(etaId, etaTime), 1000));
        return;
    }

    const minutes = Math.floor(timeDiff / 60000);
    const seconds = Math.floor((timeDiff % 60000) / 1000);

    const minutesElement = document.getElementById(`${etaId}-minutes`);
    const secondsElement = document.getElementById(`${etaId}-seconds`);

    if (minutesElement && secondsElement) {
        minutesElement.innerHTML = minutes < 10 ? `0${minutes}` : minutes;
        secondsElement.innerHTML = seconds < 10 ? `0${seconds}` : seconds;
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
        // If the current ETA is in the past, we don't output anything
        status = '';
    } else if (!previousETA && previousStopETA.find(eta => eta.eta_seq === 2)) {
        // If ETA seq 1 is unavailable but seq 2 is available, the bus has left the previous stop
        status = `
            <div class="bus-on-way-alert">
                <i class="fas fa-bus"></i>
                <p class="bus-status highlight" style="font-size: 0.9em;">Bus has left the previous stop (${stopName}) and is on its way!</p>
            </div>
        `;
    } else if (previousETA && previousETA < currentETA) {
        status = `<p class="bus-status" style="font-size: 0.9em; color: #666;">Bus has not yet left the previous stop: ${stopName}.</p>`;
    } else {
        status = `
            <div class="bus-on-way-alert">
                <i class="fas fa-bus"></i>
                <p class="bus-status highlight" style="font-size: 0.9em;">Bus is likely on its way from the previous stop: ${stopName}!</p>
            </div>
        `;
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
    let lastDelayDiff = null;
    let lastDelayText = '';

    // Check delays for 3, 2, and 1 minutes ago
    for (let minutesAgo = 3; minutesAgo >= 1; minutesAgo--) {
        if (etaHistory.length < 3 * minutesAgo) {
            continue; // Not enough history to compare for this time point
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

        // If this delay is different from the last one we recorded
        if (delayDiff !== lastDelayDiff) {
            const delayMinutes = Math.floor(Math.abs(delayDiff) / 60000);
            const delaySeconds = Math.floor((Math.abs(delayDiff) % 60000) / 1000);
            let delayString = '';
            if (delayMinutes > 0) {
                delayString = `${delayMinutes} min ${delaySeconds} seconds`;
            } else {
                delayString = `${delaySeconds} seconds`;
            }

            if (delayDiff > 0) {
                lastDelayText = `<p class="delay-info" style="color: red; font-size: 0.8em;">Delayed ${delayString} (compared to ${minutesAgo} minute${minutesAgo > 1 ? 's' : ''} ago)</p>`;
            } else if (delayDiff < 0) {
                lastDelayText = `<p class="delay-info" style="color: green; font-size: 0.8em;">Earlier by ${delayString} (compared to ${minutesAgo} minute${minutesAgo > 1 ? 's' : ''} ago)</p>`;
            }

            // Only add to delayInfo if there's actually a delay
            if (delayDiff !== 0) {
                delayInfo.push(lastDelayText);
            }
            
            lastDelayDiff = delayDiff;
        }
        // If the delay is the same as the previous one, we skip it
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
            padding: 5px;
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
            border: none; /* Remove border */
            border-radius: 8px;
            margin: 5px 0; /* Reduce spacing between cards */
            overflow: hidden;
            background-color: #fff;
            width: 100%;
        }

        .card-header {
            padding: 5px; /* Changed from 10px to 5px */
            border-bottom: 1px solid #ddd;
            background-color: transparent; /* Remove background color */
        }

        .card-body {
            padding: 5px; /* Changed from 15px to 5px */
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
            margin-bottom: 2px;
        }

        .card-header h3 {
            font-size: 1em;
            line-height: 1.2;
            margin-top: 2px;
            color: #0066cc; /* Same color as "Cityplaza, Taikoo Shing Road" */
        }

        .eta-container {
            display: flex;
            justify-content: space-between;
            width: 100%;
        }

        .next-bus {
            width: 65%;
            background-color: white;
            padding: 10px;
            border-radius: 5px;
            margin-right: 5px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            border: 1px solid black;
        }

        .other-buses {
            width: 30%;
            display: flex;
            flex-direction: column;
            margin-left: 10px; /* Add margin instead of padding */
        }

        .eta-item {
            background-color: white;
            padding: 5px;
            border-radius: 5px;
            margin-bottom: 5px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        }

        .count-down-main {
            display: flex;
            align-items: center;
            justify-content: flex-start; /* Align to the left */
        }

        .timer {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            border: 2px solid #0066cc; /* Same color as "Cityplaza, Taikoo Shing Road" */
            border-radius: 12px; /* Rounded corners */
            padding: 5px; /* Smaller padding */
            margin: 0 5px; /* Margin between timers */
        }

        .countdown-element {
            font-size: 1.5em; /* Smaller font size */
            color: #0066cc; /* Same color as "Cityplaza, Taikoo Shing Road" */
        }

        .countdown-label {
            font-size: 0.8em; /* Smaller font size */
            color: #0066cc; /* Same color as "Cityplaza, Taikoo Shing Road" */
        }

        .separator {
            font-size: 1.5em; /* Smaller font size */
            color: #0066cc; /* Same color as "Cityplaza, Taikoo Shing Road" */
            margin: 0 5px; /* Margin around separator */
        }

        .button-50 {
            background-color: #0066cc; /* Change to blue color */
            border: 1px solid #0066cc;
            color: #fff;
            font-size: 12px; /* Make the font smaller */
            padding: 8px 16px; /* Make the button smaller */
        }

        .button-50:hover {
            background-color: #0056b3; /* Darker blue on hover */
        }

        .button-50:active {
            background-color: #004c99; /* Even darker blue when active */
        }

        .small-button {
            font-size: 10px; /* Even smaller font for 'Show Details' and 'Close' buttons */
            padding: 6px 12px; /* Smaller padding for these buttons */
        }
    `;
    document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded', () => {
    addButtonStyles();
    initializePage();
});

function updateOtherBusCountdown(etaId, etaTime) {
    const now = new Date();
    const timeDiff = etaTime - now;

    if (timeDiff < 0) {
        clearInterval(countdownIntervals.find(interval => interval._id === etaId));
        countdownIntervals.push(setInterval(() => updateTimeSinceBusLeft(etaId, etaTime), 1000));
        return;
    }

    const minutes = Math.floor(timeDiff / 60000);
    const seconds = Math.floor((timeDiff % 60000) / 1000);

    const countdownElement = document.getElementById(etaId);
    if (countdownElement) {
        countdownElement.textContent = `${minutes} min ${seconds} sec`;
    }
}

// Add this new function at the end of the file
function showDrivingTime() {
    const popupHtml = `
        <div id="drivingTimePopup" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border: 1px solid black; z-index: 1000; max-width: 80%; max-height: 80%; overflow: auto;">
            <h2>Estimated Journey Time</h2>
            <div id="eta"></div>
            <div id="note"></div>
            <button id="showDetailsBtn" onclick="toggleDetails()" class="button-50 small-button" style="display: none;">Show Details</button>
            <div id="map" style="height: 400px; width: 100%; display: none;"></div>
            <div id="directions-panel" style="display: none;"></div>
            <button onclick="closeDrivingTimePopup()" class="button-50 small-button">Close</button>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', popupHtml);

    // Load Google Maps API script
    const script = document.createElement('script');
    script.src = 'https://maps.googleapis.com/maps/api/js?key=AIzaSyAgpnrFQijZWaCb3cf-5NJ5RFu7umLKxW8&callback=initMap';
    script.async = true;
    document.head.appendChild(script);
}

function closeDrivingTimePopup() {
    const popup = document.getElementById('drivingTimePopup');
    if (popup) {
        popup.remove();
    }
}

let map, directionsService, directionsRenderer;

function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 22.3193, lng: 114.1694 }, // Hong Kong
        zoom: 12
    });
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        map: map,
        panel: document.getElementById('directions-panel')
    });
    
    // Automatically calculate route after initializing the map
    calculateRoute();
}

function calculateRoute() {
    const request = {
        origin: 'Jardine House, 1 Connaught Pl, Central, Hong Kong',
        destination: 'Cityplaza, Taikoo Shing Road, Quarry Bay, Hong Kong',
        waypoints: [
            {
                location: 'Golden Star Building, 20-24 Lockhart Rd, Wan Chai, Hong Kong',
                stopover: false
            },
            {
                location: 'Immigration Tower, 7 Gloucester Rd, Wan Chai, Hong Kong',
                stopover: false
            },
            {
                location: 'Wan Chai Ferry Pier, 2/F Wan Chai Ferry Pier, Hung Hing Rd, Wan Chai, Hong Kong',
                stopover: false
            }
        ],
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: true,
        drivingOptions: {
            departureTime: new Date(),
            trafficModel: google.maps.TrafficModel.BEST_GUESS
        }
    };

    directionsService.route(request, (response, status) => {
        if (status === google.maps.DirectionsStatus.OK) {
            directionsRenderer.setDirections(response);
            
            // Calculate and display ETA using duration_in_traffic
            const route = response.routes[0];
            let totalDuration = 0;
            for (let i = 0; i < route.legs.length; i++) {
                // Use duration_in_traffic if available, otherwise fall back to duration
                totalDuration += route.legs[i].duration_in_traffic ? route.legs[i].duration_in_traffic.value : route.legs[i].duration.value;
            }
            const minutes = Math.ceil(totalDuration / 60);
            
            const etaElement = document.getElementById('eta');
            etaElement.textContent = `Estimated Journey Time: ${minutes} min (Driving only, with traffic)`;

            const noteElement = document.getElementById('note');
            noteElement.textContent = '(Note: Bus time may take longer.)';

            document.getElementById('showDetailsBtn').style.display = 'inline-block';

            // Log the estimated travel time with traffic
            console.log('Estimated travel time with traffic:', `${minutes} minutes`);
        } else {
            console.error('Directions request failed due to ' + status);
        }
    });
}

function toggleDetails() {
    const mapElement = document.getElementById('map');
    const directionsPanel = document.getElementById('directions-panel');
    const showDetailsBtn = document.getElementById('showDetailsBtn');

    if (mapElement.style.display === 'none') {
        mapElement.style.display = 'block';
        directionsPanel.style.display = 'block';
        showDetailsBtn.textContent = 'Hide Details';
    } else {
        mapElement.style.display = 'none';
        directionsPanel.style.display = 'none';
        showDetailsBtn.textContent = 'Show Details';
    }
}