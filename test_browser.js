const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();

        await page.goto('http://localhost:8081', { waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 2000));
        
        const info = await page.evaluate(() => {
            const getBounds = (el) => {
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { x: r.x, y: r.y, w: r.width, h: r.height, zIndex: window.getComputedStyle(el).zIndex };
            };
            
            const gameDiv = document.getElementById('game');
            const input = document.querySelector('input');
            const canvas = document.querySelector('canvas');
            
            return {
                gameDiv: getBounds(gameDiv),
                input: getBounds(input),
                canvas: getBounds(canvas),
                btnPoint: document.elementFromPoint(490, 350)?.tagName,
                btnPointID: document.elementFromPoint(490, 350)?.id,
                inputStyle: input ? {
                    display: input.style.display,
                    visibility: input.style.visibility,
                    opacity: window.getComputedStyle(input).opacity,
                    color: window.getComputedStyle(input).color,
                    bg: window.getComputedStyle(input).backgroundColor
                } : null
            };
        });
        
        console.log(JSON.stringify(info, null, 2));

        await browser.close();
    } catch (e) {
        console.error(e);
    }
})();
