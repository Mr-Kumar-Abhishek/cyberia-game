class Item extends Phaser.GameObjects.Container {
    constructor(x, y, key) {
        super(Game.scene, x, y);
        this.sprite = Game.scene.add.sprite(0, 0, key);
        this.add(this.sprite);
        Game.scene.add.existing(this);
        
        this.on('destroy', () => {
            this.recycle();
        });
    }

    absorbProperties(object) {
        for (var key in object) {
            if (!object.hasOwnProperty(key)) continue;
            this[key] = object[key];
        }
    }

    setUp(content, chest, inChest, visible, respawn, loot) {
        Game.entities.add(this);
        this.chest = chest;
        this.inChest = inChest;
        this.content = content;
        this.canRespawn = respawn;
        this.loot = loot;
        this.setVisible(visible);
        this.display();
        if(!visible) this.setActive(false);
    }

    display() {
        this.absorbProperties(Game.itemsInfo[this.content]);
        if(!this.shadow) {
            this.shadow = Game.scene.add.sprite(1, 0, 'atlas1', 'shadow');
            this.add(this.shadow);
            this.sendToBack(this.shadow);
        }
        if(!this.sparks) {
            this.sparks = Game.scene.add.sprite(0, 0, 'atlas1', 'sparks_0');
            this.add(this.sparks);
            if (!Game.scene.anims.exists('glitter')) {
                Game.scene.anims.create({
                    key: 'glitter',
                    frames: Game.scene.anims.generateFrameNames('atlas1', { prefix: 'sparks_', start: 0, end: 5 }),
                    frameRate: 10,
                    repeat: -1
                });
            }
        }
        this.sparks.anims.play('glitter', true);
        this.rate = 6;
        this.atlasKey = this.content;
        
        try {
            this.sprite.setInteractive({ cursor: Game.lootCursor });
        } catch(e) {
            console.log(e);
        }
        
        if(this.chest) {
            if(!Game.scene.anims.exists('chest_open')) {
                Game.scene.anims.create({
                    key: 'chest_open',
                    frames: Game.scene.anims.generateFrameNames('atlas1', { prefix: 'death_', start: 0, end: 5 }),
                    frameRate: 8,
                    repeat: 0
                });
            }
            this.sprite.on('animationcomplete', (anim) => {
                if(anim.key === 'chest_open') this.swapToItem();
            });
            this.swapToChest();
        } else {
            this.swapToItem();
        }
    }

    setBlinkingTween() {
        this.blinkingTween = Game.scene.tweens.add({
            targets: this,
            alpha: 0,
            yoyo: true,
            duration: 200,
            repeat: 20,
            delay: 5000,
            onComplete: () => {
                this.setActive(false).setVisible(false);
            }
        });
    }

    swapToChest() {
        this.sprite.setFrame('chest');
        this.sprite.setOrigin(0);
        this.inChest = true;
        this.shadow.setVisible(false);
        this.sparks.setVisible(false);
        this.sprite.off('pointerup');
        this.sprite.on('pointerup', () => Game.handleChestClick(this));
        if(Game.fadeInTween) Game.fadeInTween(this);
    }

    swapToItem() {
        if(this.sprite.frame.name !== this.content + '_0') this.sprite.setFrame(this.content + '_0');
        if(this.customAnchor){
            this.sprite.setOrigin(this.customAnchor.x, this.customAnchor.y);
        } else {
            this.sprite.setOrigin(0, 0.25);
        }
        this.inChest = false;
        this.shadow.setVisible(true);
        this.sparks.setVisible(true);
        if(this.chest || this.loot) this.setBlinkingTween();
        
        if(Game.basicAtlasAnimation) Game.basicAtlasAnimation(this.sprite);
        
        this.sprite.off('pointerup');
        this.sprite.on('pointerup', () => Game.handleLootClick(this));
    }

    remove() {
        if(this.canRespawn) {
            this.setActive(false).setVisible(false);
        } else {
            this.destroy();
            delete Game.itemsTable[this.id];
        }
    }

    recycle() {
        if(this.blinkingTween) {
            this.blinkingTween.stop();
            this.alpha = 1;
        }
    }

    open() {
        this.sprite.anims.play('chest_open');
        Game.scene.sound.play('chest');
    }

    respawn() {
        this.setActive(true).setVisible(true);
        if(this.chest){
            this.swapToChest();
        } else {
            this.swapToItem();
            if(Game.fadeInTween) Game.fadeInTween(this);
        }
    }
}
window.Item = Item;