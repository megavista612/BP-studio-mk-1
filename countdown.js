document.addEventListener('DOMContentLoaded', function() {
    const countdownElements = document.querySelectorAll('.count-down-main');

    countdownElements.forEach((countdownElement, index) => {
        const minutesElement = countdownElement.querySelector('.countdown-element.minutes');
        const secondsElement = countdownElement.querySelector('.countdown-element.seconds');

        let countdownTime = (5 - index) * 60; // Different times for each card

        function updateCountdown() {
            const minutes = Math.floor(countdownTime / 60);
            const seconds = countdownTime % 60;

            minutesElement.textContent = minutes.toString().padStart(2, '0');
            secondsElement.textContent = seconds.toString().padStart(2, '0');

            if (countdownTime > 0) {
                countdownTime--;
            } else {
                clearInterval(countdownInterval);
            }
        }

        const countdownInterval = setInterval(updateCountdown, 1000);
        updateCountdown(); // Initial call to set the countdown immediately
    });
});