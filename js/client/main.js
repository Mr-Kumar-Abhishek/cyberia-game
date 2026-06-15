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
