CityBus 720 ETA Tracker
=======================

Description:
This web application provides real-time Estimated Time of Arrival (ETA) information for CityBus route 720 in Hong Kong. It displays ETAs for three key stops: Cityplaza (outbound towards Central), Jardine House (inbound towards Taikoo Shing), and Wan Chai Ferry Pier (towards Taikoo Shing).

Features:
- Real-time ETA updates every 20 seconds
- Displays next bus and upcoming buses for each stop
- Shows estimated travel time from previous stops
- Indicates if a bus has left the previous stop
- Highlights delays or early arrivals compared to previous ETAs
- Responsive design for various screen sizes

Files:
- index.html: Main HTML file for the web app
- bus_info.js: JavaScript file containing the core functionality
- find_route.html: Additional page for finding custom routes (not included in this snippet)

Usage:
1. Open index.html in a web browser
2. The app will automatically start fetching and displaying ETA information
3. ETAs will update every 20 seconds
4. Click on "Find Your Own Route" to navigate to the custom route finder (if implemented)

Dependencies:
- Font Awesome 5.15.3 (loaded via CDN for icons)

API:
This app uses the Hong Kong government's real-time data API for bus ETAs. The base URL is:
https://rt.data.gov.hk/

Note:
Ensure you have an active internet connection for the app to function properly and fetch real-time data.

Customization:
To add more routes or stops, modify the fetchAndDisplayETA function in bus_info.js.

Author:
[Your Name or Organization]

Last Updated:
[Current Date]