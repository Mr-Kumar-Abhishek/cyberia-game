/**
 * Created by Jerome on 25-02-17.
 */

class Player extends window.Human {
    constructor(x, y, key) {
        super(x, y, key);
        this.sprite.setOrigin(0.25, 0.35); // replace anchor.set
        this.orientation = 4;
        this.speed = Game.playerSpeed;
        this.dialoguesMemory = {};
        this.maxLife = Game.playerLife;
        this.life = this.maxLife;
        this.inFight = false;
        this.defaultFrames = {
            "attack_right": [0,4,9],
            "right": [5, 8],
            "idle_right": [9, 10],
            "attack_up": [11,15,20],
            "up": [16, 19],
            "idle_up": [20, 21],
            "attack_down": [22,26,31],
            "down": [27, 30],
            "idle_down": [31, 32],
            "attack_left": [33,37,42],
            "left": [38, 41],
            "idle_left": [42, 43]
        };
        
        this.weapon = Game.scene.add.sprite(0, 0, 'atlas3');
        this.weapon.absorbProperties = window.Being.prototype.absorbProperties;
        this.add(this.weapon);
        
        this.shadow = Game.scene.add.sprite(0, 5, 'atlas1', 'shadow');
        this.add(this.shadow);
        this.sendToBack(this.shadow); // Ensure shadow is below sprite
        
        this.nameHolder = Game.scene.add.text(0, -30, '', {
            font: '14px pixel',
            fill: "#ffffff",
            stroke: "#000000",
            strokeThickness: 2
        });
        this.add(this.nameHolder);
        
        // Phaser 3 doesn't have onKilled event by default. Handled in destroy()
        this.on('destroy', () => {
            Game.displayedPlayers.delete(this.id);
        });
    }

    setIsPlayer(flag) {
        this.isPlayer = flag;
        if(this.isPlayer) this.nameHolder.setColor("#f4d442");
    }

    setName(name) {
        this.nameHolder.setText(name);
        this.nameHolder.x = Math.floor(16 - (this.nameHolder.width/2));
    }

    prepareMovement(end, finalOrientation, action, delta, sendToServer) {
        if(!this.active) return;
        if(!end) return;
        var start = Game.computeTileCoords(this.x, this.y);
        if (start.x === end.x && start.y === end.y) {
            if(action.action === 1) this.finishMovement(finalOrientation, action);
            return;
        }
        if(this.isPlayer) {
            Game.manageMoveTarget(end.x, end.y);
        }
        if(this.tween){
            this.stopMovement(false);
            start = this.adjustStartPosition(start);
        }
        if(this.isPlayer && this.inFight && action.action !== 3) this.endFight();
        Game.easystar.findPath(start.x, start.y, end.x, end.y, this.pathfindingCallback.bind(this, finalOrientation, action, delta, sendToServer));
        Game.easystar.calculate();
    }

    equipWeapon(key) {
        this.weapon.name = key;
        this.weapon.setFrame(key + '_0');
        this.weapon.absorbProperties(Game.itemsInfo[key]);
        this.atk = this.weapon.atk;
        this.adjustWeapon();
        this.setAnimations(this.weapon);
        if(this.isPlayer){
            Game.weaponIcon.setFrame(this.weapon.icon + '_0');
            window.Client.setWeapon(key);
        }
        return true;
    }

    adjustWeapon() {
        this.weapon.setPosition(this.weapon.offsets.x, this.weapon.offsets.y);
    }

    equipArmor(key) {
        var armorInfo = Game.itemsInfo[key];
        this.def = armorInfo.def;
        this.armorName = key;
        this.sprite.setFrame(key + '_0');
        if(this.isPlayer) {
            Game.armorIcon.setFrame(armorInfo.icon + '_0');
            window.Client.setArmor(key);
            Game.armorIcon.setOrigin(0, 0);
            if(armorInfo.iconAnchor) Game.armorIcon.setOrigin(armorInfo.iconAnchor.x, armorInfo.iconAnchor.y);
        }
        this.frames = (armorInfo.hasOwnProperty('frames') ? armorInfo.frames : null);
        this.setAnimations(this.sprite);
        return true;
    }

    updateLife() {
        if(this.life < 0) this.life = 0;
        var width = Game.computeLifeBarWidth();
        
        Game.scene.tweens.add({
            targets: Game.health.getAt(0),
            displayWidth: width,
            duration: 200,
            delay: 200
        });
        Game.scene.tweens.add({
            targets: Game.health.getAt(1),
            x: width,
            duration: 200,
            delay: 200
        });
    }

    teleport() {
        var cell = Game.computeTileCoords(this.x, this.y);
        var door = Game.doors.getFirst(cell.x, cell.y);
        if(door){
            this.setPosition(door.to.x, door.to.y);
            if(this.isPlayer) {
                if (door.camera && !door.follow) {
                    Game.unfollowPlayer();
                    Game.scene.cameras.main.scrollX = door.camera.x;
                    Game.scene.cameras.main.scrollY = door.camera.y;
                } else if(door.follow) {
                    Game.followPlayerIndoors(door.min_cx, door.min_cy, door.max_cx, door.max_cy);
                } else {
                    Game.followPlayer();
                }
            }
            var orientationMap = { l: 1, u: 2, r: 3, d: 4 };
            return orientationMap[door.orientation];
        }
        return null;
    }

    fight() {
        if(!this.target) return;
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
        if(this.isPlayer) return;
        var direction = Game.adjacent(this, this.target);
        if(direction > 0){
            if(this.tween){
                this.tween.stop();
                this.tween = null;
            }
            this.orientation = direction;
            this.attack();
        }
    }

    die(animate) {
        if(this.tween) this.stopMovement(false);
        this.endFight();
        this.target = null;
        this.life = 0;
        if(this.isPlayer) {
            Game.moveTarget.setVisible(false);
            this.updateLife();
            setTimeout(Game.displayDeathScroll, 2000);
        }
        if(animate) {
            this.sprite.setFrame('death_0');
            this.animate('death', false);
            Game.scene.sound.play('death');
        }
        this.delayedKill(750);
    }

    respawn() {
        this.setActive(true).setVisible(true);
        this.orientation = Phaser.Math.Between(1, 4);
        if(this.isPlayer) {
            this.life = this.maxLife;
            this.updateLife();
        }
        this.idle(true);
    }
}
window.Player = Player;