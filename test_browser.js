const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();

        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
        page.on('response', response => {
            if (!response.ok()) {
                console.log(`[404] ${response.url()}`);
            }
        });

        console.log("Navigating to http://localhost:8081 ...");
        await page.goto('http://localhost:8081', { waitUntil: 'networkidle0' });
        
        console.log("Waiting 2 seconds to capture any delayed logs...");
        await new Promise(r => setTimeout(r, 2000));
        
        // Also capture the HTML to see if canvas exists
        const canvasHtml = await page.evaluate(() => {
            const canvas = document.querySelector('canvas');
            return canvas ? canvas.outerHTML : 'NO CANVAS FOUND';
        });
        console.log("Canvas check:", canvasHtml);

        await browser.close();
        console.log("Done.");
    } catch (e) {
        console.error("Puppeteer Script Error:", e);
    }
})();
