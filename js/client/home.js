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
        Home.inputElement.style.position = 'absolute';
        Home.inputElement.style.top = '250px';
        Home.inputElement.style.left = '400px';
        Home.inputElement.style.width = '200px';
        Home.inputElement.style.padding = '5px';
        document.getElementById('game').appendChild(Home.inputElement);

        buttonY = 100;
    } else {
        let playerArmor = this.add.sprite(0, 0, 'atlas3', Client.getArmor()+'_31');
        let wpn = Client.getWeapon();
        let weapon = this.add.sprite(Game.db.items[wpn].offsets.x, Game.db.items[wpn].offsets.y, 'atlas3', wpn+'_31');
        let playerContainer = this.add.container(0, 0, [playerArmor, weapon]);
        this.scroll.add(playerContainer);
        buttonY = 80;
    }

    Home.button = this.add.sprite(0, buttonY, 'atlas1', 'play_0').setInteractive();
    Home.button.on('pointerdown', () => { Home.startGame.call(this); });
    this.scroll.add(Home.button);
};

Home.startGame = function() {
    let ok = true;
    if (Game.isNewPlayer) {
        if (Home.inputElement && Home.inputElement.value.length > 0) {
            Client.setName(Home.inputElement.value);
            Home.inputElement.remove();
            Home.inputElement = null;
        } else {
            ok = false;
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