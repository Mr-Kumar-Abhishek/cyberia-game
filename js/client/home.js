class HomeScene extends Phaser.Scene {
    constructor() {
        super({ key: 'Home' });
    }
    init() {
        if (Home.init) Home.init.call(this);
    }
    preload() {
        if (Home.preload) Home.preload.call(this);
    }
    create() {
        if (Home.create) Home.create.call(this);
    }
    update() {
        if (Home.update) Home.update.call(this);
    }
}

window.Home = {
    maxNameLength: 20
};

Home.init = function() {
    Game.isNewPlayer = Client.isNewPlayer();
};

Home.preload = function() {
    this.load.atlas('atlas1', 'assets/sprites/atlas1.png', 'assets/sprites/atlas1.json');
    this.load.atlas('atlas3', 'assets/sprites/atlas3.png', 'assets/sprites/atlas3.json');
    this.load.json('db', 'assets/json/db.json');
    this.load.audio('intro', ['assets/music/phaser-quest-intro.ogg']);
};

Home.create = function() {
    Game.db = this.cache.json.get('db');
    Game.itemsInfo = Game.db.items;
    Game.itemsIDmap = {};
    Object.keys(Game.itemsInfo).forEach(function(key) {
        Game.itemsIDmap[Game.itemsInfo[key].id] = key;
    });
    Game.monstersInfo = Game.db.monsters;
    Game.monstersIDmap = {};
    Object.keys(Game.monstersInfo).forEach(function(key) {
        Game.monstersIDmap[Game.monstersInfo[key].id] = key;
    });
    this.music = this.sound.add('intro');
    this.music.play();

    this.displayHomeScroll = function() {
        if (!this.scroll) Home.makeHomeScroll.call(this);
        this.scroll.setVisible(true);
        this.tweens.add({ targets: this.scroll, alpha: 1, duration: 200 });
    };

    this.displayLogo = function() {
        this.logo = this.add.text(this.scale.width / 2, 20, 'CYBERIA', { font: "80px Impact", fill: "#f1c40f", stroke: "#c0392b", strokeThickness: 10, shadowOffsetX: 5, shadowOffsetY: 5, shadowColor: "rgba(0,0,0,0.5)", shadowBlur: 5 });
        this.logo.setOrigin(0.5, 0);
        this.tweens.add({ targets: this.logo, alpha: 0, duration: 200, delay: 2000, onComplete: () => { this.logo.setVisible(false); } });
    };

    this.displayHomeScroll();
    this.displayLogo();

    this.input.keyboard.on('keydown-ENTER', () => {
        Home.startGame.call(this);
    });
};

Home.makeHomeScroll = function() {
    Game.isNewPlayer = Client.isNewPlayer();
    this.scroll = this.add.container(this.scale.width / 2, this.scale.height / 2);
    this.scroll.setAlpha(0);

    let bg = this.add.sprite(0, 0, 'atlas1', 'scroll_1');
    let scroll_2 = this.add.sprite(bg.width, 0, 'atlas1', 'scroll_2');
    let scroll_3 = this.add.sprite(-78, 0, 'atlas1', 'scroll_3');
    this.scroll.add([bg, scroll_2, scroll_3]);

    let titleText = Game.isNewPlayer ? 'Create a new character' : 'Load existing character';
    let title = this.add.text(0, -bg.height/2 + 20, titleText, { font: '18px pixel', fill: "#f4d442", stroke: "#000000", strokeThickness: 3 }).setOrigin(0.5);
    this.scroll.add(title);

    let buttonY;
    if (Game.isNewPlayer) {
        let player = this.add.sprite(-50, 0, 'atlas3', 'clotharmor_31');
        player.setAlpha(0.5);
        this.scroll.add(player);

        Home.inputElement = document.createElement('input');
        Home.inputElement.type = 'text';
        Home.inputElement.placeholder = 'Name your character';
        Home.inputElement.maxLength = Home.maxNameLength;
        Home.inputElement.style.width = '200px';
        Home.inputElement.style.padding = '5px';
        Home.inputElement.style.fontSize = '16px';
        Home.inputElement.style.fontFamily = 'pixel';
        Home.inputElement.style.outline = 'none';
        
        Home.domElement = this.add.dom(0, 50, Home.inputElement);
        this.scroll.add(Home.domElement);

        buttonY = 100;
    } else {
        let playerArmor = this.add.sprite(0, 0, 'atlas3', Client.getArmor()+'_31');
        let wpn = Client.getWeapon();
        let weapon = this.add.sprite(Game.db.items[wpn].offsets.x, Game.db.items[wpn].offsets.y, 'atlas3', wpn+'_31');
        let playerContainer = this.add.container(0, 0, [playerArmor, weapon]);
        this.scroll.add(playerContainer);
        buttonY = 80;
    }

    Home.button = this.add.sprite(0, buttonY, 'atlas1', 'play_0').setInteractive({ useHandCursor: true });
    Home.button.on('pointerdown', () => { Home.startGame.call(this); });
    this.scroll.add(Home.button);
    
    if (Game.isNewPlayer) {
        Home.warningText = this.add.text(0, buttonY + 30, 'Please enter a name!', { font: '14px pixel', fill: '#ff0000' }).setOrigin(0.5);
        Home.warningText.setVisible(false);
        this.scroll.add(Home.warningText);
    }
};

Home.startGame = function() {
    let ok = true;
    if (Game.isNewPlayer) {
        if (Home.inputElement && Home.inputElement.value.trim().length > 0) {
            Client.setName(Home.inputElement.value.trim());
            if(Home.domElement) {
                Home.domElement.destroy();
                Home.domElement = null;
            }
            Home.inputElement = null;
            if(Home.warningText) Home.warningText.setVisible(false);
        } else {
            ok = false;
            if(Home.warningText) {
                Home.warningText.setVisible(true);
                this.tweens.add({ targets: Home.warningText, alpha: 0, duration: 100, yoyo: true, repeat: 3 });
            }
        }
    }
    if (ok) {
        if (this.music) this.music.stop();
        this.tweens.add({
            targets: this.scroll,
            alpha: 0,
            duration: 200,
            onComplete: () => {
                this.scene.start('Game');
            }
        });
    }
};

Home.update = function() {};