const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();

        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', error => console.log('PAGE ERROR STACK:', error.stack));

        console.log("Navigating to http://localhost:8081 ...");
        await page.goto('http://localhost:8081', { waitUntil: 'networkidle0' });
        
        await new Promise(r => setTimeout(r, 1000));
        
        console.log("Typing name...");
        await page.evaluate(() => {
            const btn = window.Home.button;
            if (window.Home.inputElement) window.Home.inputElement.value = 'TestPlayer';
            if (btn) btn.emit('pointerdown');
        });

        console.log("Waiting 3 seconds for game to load...");
        await new Promise(r => setTimeout(r, 3000));
        
        const screenshotPath = 'C:\\Users\\conta\\.gemini\\antigravity-ide\\brain\\49fd1d67-b6ee-446e-be48-5d67bda41a25\\game_initial_state_' + Date.now() + '.png';
        await page.screenshot({ path: screenshotPath });
        console.log("Saved screenshot to " + screenshotPath);

        await browser.close();
        console.log("Done.");
    } catch (e) {
        console.error("Puppeteer Script Error:", e);
    }
})();
