class HomeScene extends Phaser.Scene {
    constructor() {
        super({ key: 'Home' });
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

class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'Game' });
    }
    preload() {
        if (Game.preload) Game.preload.call(this);
    }
    create() {
        if (Game.create) Game.create.call(this);
    }
    update() {
        if (Game.update) Game.update.call(this);
    }
}

const config = {
    type: (navigator.userAgent.toLowerCase().indexOf('firefox') > -1 ? Phaser.CANVAS : Phaser.AUTO),
    width: 980,
    height: 500,
    parent: 'game',
    pixelArt: true,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    dom: {
        createContainer: true
    },
    scene: [HomeScene, GameScene]
};

const game = new Phaser.Game(config);
