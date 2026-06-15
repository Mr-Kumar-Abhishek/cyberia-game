class Monster extends window.Being {
    constructor(x, y, key) {
        super(x, y, key);
        this.isPlayer = false;
        
        this.shadow = Game.scene.add.sprite(0, 0, 'atlas1', 'shadow');
        this.add(this.shadow);
        this.sendToBack(this.shadow);
        
        this.sprite.setInteractive({ cursor: Game.fightCursor });
        this.sprite.on('pointerup', () => Game.handleMonsterClick(this));
        
        this.inFight = false;
        this.orientation = Phaser.Math.Between(1, 4);
        this.initialPosition = { x: x, y: y };
    }

    setUp(key) {
        this.sprite.setFrame(key + '_0');
        this.monsterName = key;
        this.sprite.setOrigin(0.25, 0.2);
        this.absorbProperties(Game.monstersInfo[key]);
        if(this.customAnchor){
            this.sprite.setOrigin(this.customAnchor.x, this.customAnchor.y);
        }
        this.maxLife = this.life;
        Game.entities.add(this);
        this.setAnimations(this.sprite);
        this.idle(false);
    }

    prepareMovement(path, action, delta) {
        if(!path) return;
        if(this.tween){
            this.stopMovement(false);
        }
        this.pathfindingCallback(0, action, delta, false, path);
    }

    fight() {
        this.inFight = true;
        this.fightTween = Game.scene.time.addEvent({
            delay: 1000,
            callback: this.fightAction,
            callbackScope: this,
            loop: true
        });
        this.fightAction();
    }

    fightAction() {
        if(Date.now() - this.lastAttack < 900) return;
        this.lastAttack = Date.now();
        if(!this.target) return;
        if(this.target.isPlayer) return;
        var direction = Game.adjacent(this, this.target);
        if(direction > 0) {
            if(this.tween){
                this.stopMovement(false);
            }
            this.orientation = direction;
            this.attack();
        }
    }

    die(animate) {
        this.endFight();
        this.target = null;
        this.setActive(false).setVisible(false);
        if(animate) {
            this.animate('death', false);
            Game.scene.sound.play('kill2');
        }
        this.delayedKill(500);
    }

    respawn() {
        this.setActive(true).setVisible(true);
        this.orientation = Phaser.Math.Between(1, 4);
        this.setPosition(this.initialPosition.x / Game.map.tileWidth, this.initialPosition.y / Game.map.tileHeight);
        this.life = this.maxLife;
        this.idle(true);
        if(Game.fadeInTween) Game.fadeInTween(this);
    }
}
window.Monster = Monster;