console.log("find_route.js loaded");

// Add this variable at the top of the file
let etaUpdateInterval;

async function getRouteInfo() {
    console.log("getRouteInfo function called");
    const routeNumber = document.getElementById('busRoute').value;
    console.log("Route number entered:", routeNumber);

    if (!routeNumber) {
        console.log("No route number entered");
        alert("Please enter a route number");
        return;
    }

    try {
        const response = await fetch(`https://rt.data.gov.hk/v1/transport/citybus-nwfb/route/CTB/${routeNumber}`);
        console.log("API response received");

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log("API data:", data);
        
        if (data.data) {
            const directionSelect = document.getElementById('direction');
            directionSelect.innerHTML = '';
            directionSelect.style.display = 'block';
            document.getElementById('directionAnnotation').style.display = 'block';
            
            // Create options for both directions
            const option1 = document.createElement('option');
            option1.value = 'outbound';
            option1.textContent = `To: ${data.data.dest_en}`;
            directionSelect.appendChild(option1);

            const option2 = document.createElement('option');
            option2.value = 'inbound';
            option2.textContent = `To: ${data.data.orig_en}`;
            directionSelect.appendChild(option2);
            
            // Show confirm destination button
            document.getElementById('confirmDestination').style.display = 'block';
            
            // Hide stops select and its annotation
            document.getElementById('stops').style.display = 'none';
            document.getElementById('stopsAnnotation').style.display = 'none';
            document.querySelector('#routeInput button:last-child').style.display = 'none';
            
            updateSelectedInfo();
            console.log("Route info displayed successfully");
        } else {
            console.log("No route data found");
            alert('Route not found');
        }
    } catch (error) {
        console.error("Error in getRouteInfo:", error);
        alert(`Error fetching route info: ${error.message}`);
    }
}

async function confirmDestination() {
    document.getElementById('showAllStops').style.display = 'none'; // Hide this button as we'll show stops automatically
    await getStops();
    displayAllStops();
    updateSelectedInfo();
}

async function getStops() {
    const routeNumber = document.getElementById('busRoute').value;
    const direction = document.getElementById('direction').value;
    const response = await fetch(`https://rt.data.gov.hk/v1/transport/citybus-nwfb/route-stop/CTB/${routeNumber}/${direction}`);
    const data = await response.json();
    
    const stopsSelect = document.getElementById('stops');
    stopsSelect.innerHTML = '';
    stopsSelect.style.display = 'block';
    document.getElementById('stopsAnnotation').style.display = 'block';
    
    window.allStops = []; // Store all stops for later use

    for (const stop of data.data) {
        const stopResponse = await fetch(`https://rt.data.gov.hk/v1/transport/citybus-nwfb/stop/${stop.stop}`);
        const stopData = await stopResponse.json();
        const stopInfo = {
            id: stop.stop,
            name: stopData.data.name_en
        };
        window.allStops.push(stopInfo);
        
        const option = document.createElement('option');
        option.value = stop.stop;
        option.textContent = `${stopData.data.name_en} (Stop ID: ${stop.stop})`;
        stopsSelect.appendChild(option);
    }
    
    // Show the "Get ETA" button
    document.getElementById('getETAButton').style.display = 'block';
}

function displayAllStops() {
    const allStopsList = document.getElementById('allStopsList');
    allStopsList.innerHTML = '<h3>All Stops for Selected Direction:</h3>';
    const ol = document.createElement('ol');
    
    window.allStops.forEach((stop) => {
        const li = document.createElement('li');
        li.textContent = `${stop.name} (Stop ID: ${stop.id})`;
        ol.appendChild(li);
    });
    
    allStopsList.appendChild(ol);
    allStopsList.style.display = 'block';
}

function showAllStops() {
    displayAllStops();
}

// Modify the getETAInfo function
async function getETAInfo() {
    console.log("getETAInfo function called");
    const routeNumber = document.getElementById('busRoute').value;
    const stopId = document.getElementById('stops').value;
    const resultsDiv = document.getElementById('results');
    
    console.log(`Route Number: ${routeNumber}, Stop ID: ${stopId}`);
    
    // Clear any existing interval
    clearInterval(etaUpdateInterval);
    
    // Function to fetch and display ETA
    async function fetchAndDisplayETA() {
        resultsDiv.innerHTML = '<p>Loading ETA information...</p>';
        
        try {
            console.log("Fetching ETA data...");
            const response = await fetch(`https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${stopId}/${routeNumber}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            console.log("ETA data received:", data);
            
            if (!data.data || data.data.length === 0) {
                console.log("No ETA data available");
                resultsDiv.innerHTML = '<p>No ETA information available for this stop.</p>';
                return;
            }
            
            const direction = document.createElement('div');
            direction.className = 'direction';
            const h2 = document.createElement('h2');
            h2.textContent = `Route ${routeNumber} - ${document.getElementById('direction').options[document.getElementById('direction').selectedIndex].text}`;
            direction.appendChild(h2);
            
            const stopName = document.getElementById('stops').options[document.getElementById('stops').selectedIndex].text;
            const h3 = document.createElement('h3');
            h3.textContent = `Current Stop: ${stopName}`;
            direction.appendChild(h3);
            
            // Format ETA list
            const etaList = formatETAList(data.data);
            direction.innerHTML += etaList;
            
            // Check previous stop
            const previousStopInfo = await getPreviousStopInfo(routeNumber, stopId);
            if (previousStopInfo) {
                const previousStopStatus = checkPreviousStop(previousStopInfo.eta, data.data, previousStopInfo.name);
                direction.innerHTML += previousStopStatus;
            }
            
            // Add last updated time
            const lastUpdated = new Date().toLocaleTimeString();
            resultsDiv.innerHTML += `<p>Last updated: ${lastUpdated}</p>`;
            
            resultsDiv.innerHTML = '';
            resultsDiv.appendChild(direction);
            console.log("ETA information displayed");
        } catch (error) {
            console.error('Error fetching ETA:', error);
            resultsDiv.innerHTML = `<p>Error fetching ETA information: ${error.message}</p>`;
        }
        
        updateSelectedInfo();
    }
    
    // Initial fetch and display
    await fetchAndDisplayETA();
    
    // Set up interval to fetch and display ETA every 20 seconds
    etaUpdateInterval = setInterval(fetchAndDisplayETA, 20000);
}

function formatETAList(etaData) {
    const now = new Date();
    return `
        <ul>
            ${etaData.filter(eta => eta.eta_seq <= 3).map(eta => {
                const etaTime = new Date(eta.eta);
                const etaId = `eta-${eta.eta_seq}-${etaTime.getTime()}`;
                const countdown = Math.max(0, Math.floor((etaTime - now) / 1000));
                
                return `
                    <li>
                        <strong>ETA ${eta.eta_seq}:</strong> ${formatTime(etaTime)} 
                        (<span id="${etaId}">${formatCountdownMinSec(countdown)}</span>)<br>
                        <strong>Destination:</strong> ${eta.dest_tc}<br>
                        <strong>Remarks:</strong> ${eta.rmk_en || 'N/A'}
                    </li>
                `;
            }).join('')}
        </ul>
    `;
}

function formatTime(date) {
    return date.toTimeString().split(' ')[0];
}

function formatCountdownMinSec(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatCountdown(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

async function getPreviousStopInfo(routeNumber, currentStopId) {
    const direction = document.getElementById('direction').value;
    const response = await fetch(`https://rt.data.gov.hk/v1/transport/citybus-nwfb/route-stop/CTB/${routeNumber}/${direction}`);
    const data = await response.json();
    
    const currentStopIndex = data.data.findIndex(stop => stop.stop === currentStopId);
    if (currentStopIndex > 0) {
        const previousStop = data.data[currentStopIndex - 1];
        const stopResponse = await fetch(`https://rt.data.gov.hk/v1/transport/citybus-nwfb/stop/${previousStop.stop}`);
        const stopData = await stopResponse.json();
        const etaResponse = await fetch(`https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${previousStop.stop}/${routeNumber}`);
        const etaData = await etaResponse.json();
        return {
            id: previousStop.stop,
            name: stopData.data.name_en,
            eta: etaData.data
        };
    }
    return null;
}

function checkPreviousStop(previousStopETA, currentStopETA, previousStopName) {
    if (!previousStopETA || !previousStopETA.length || !currentStopETA.length) {
        return `<p>Cannot determine if the bus has left the previous stop.</p>`;
    }

    const previousETA = new Date(previousStopETA.find(eta => eta.eta_seq === 1)?.eta);
    const currentETA = new Date(currentStopETA.find(eta => eta.eta_seq === 1)?.eta);
    const now = new Date();

    let status;
    if (previousETA < currentETA) {
        status = `<p style="color: orange;">Bus has not yet departed from the previous stop: ${previousStopName} (Stop ID: ${previousStopETA[0].stop}).</p>`;
    } else {
        const timeDiff = Math.max(0, (now - previousETA) / 60000); // difference in minutes
        status = `<p style="color: green;">Bus is likely on its way from the previous stop: ${previousStopName} (Stop ID: ${previousStopETA[0].stop}). It may have left approximately ${Math.round(timeDiff)} minutes ago.</p>`;
    }

    const estimatedTravelTime = calculateEstimatedTravelTime(previousStopETA, currentStopETA);
    
    return `
        ${status}
        <p>Estimated travel time from previous stop: ${estimatedTravelTime}</p>
    `;
}

function calculateEstimatedTravelTime(previousStopETA, currentStopETA) {
    const travelTimes = [];

    for (let seq = 1; seq <= 3; seq++) {
        const prevETA = previousStopETA.find(eta => eta.eta_seq === seq);
        const currETA = currentStopETA.find(eta => eta.eta_seq === seq);

        if (prevETA && currETA) {
            const prevTime = new Date(prevETA.eta);
            const currTime = new Date(currETA.eta);
            const diffSeconds = Math.max(0, (currTime - prevTime) / 1000);
            travelTimes.push(diffSeconds);
        }
    }

    if (travelTimes.length === 0) {
        return "Unable to estimate";
    }

    const averageTravelTime = Math.round(travelTimes.reduce((a, b) => a + b, 0) / travelTimes.length);
    return formatDuration(averageTravelTime);
}

function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function updateSelectedInfo() {
    const selectedInfo = document.getElementById('selectedInfo');
    const routeNumber = document.getElementById('busRoute').value;
    const directionSelect = document.getElementById('direction');
    const stopsSelect = document.getElementById('stops');
    
    let infoText = `Route: ${routeNumber}<br>`;
    
    if (directionSelect.selectedIndex !== -1) {
        infoText += `Destination: ${directionSelect.options[directionSelect.selectedIndex].text}<br>`;
    }
    
    if (stopsSelect.selectedIndex !== -1) {
        infoText += `Current Stop: ${stopsSelect.options[stopsSelect.selectedIndex].text}`;
    }
    
    selectedInfo.innerHTML = infoText;
    selectedInfo.style.display = 'block';
}

// Add an event listener to clear the interval when the user leaves the page
window.addEventListener('beforeunload', () => {
    clearInterval(etaUpdateInterval);
});

document.addEventListener('DOMContentLoaded', (event) => {
    console.log('DOM fully loaded and parsed');
    const getRouteInfoButton = document.getElementById('getRouteInfoButton');
    if (getRouteInfoButton) {
        console.log('Get Route Info button found');
        getRouteInfoButton.addEventListener('click', getRouteInfo);
    } else {
        console.error('Get Route Info button not found');
    }
});