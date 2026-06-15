/**
 * Created by Jerome on 14-10-16.
 */
/*
 * Author: Jerome Renaux
 * E-mail: jerome.renaux@gmail.com
 */
class Being extends Phaser.GameObjects.Container {
    constructor(x, y, key) {
        super(Game.scene, x, y);
        this.sprite = Game.scene.add.sprite(0, 0, key);
        this.add(this.sprite);
        this.speed = 0;
        this.destination = null;
        this.orientation = 4; // down
        this.previousPosition = { x: x, y: y };
        Game.scene.add.existing(this);
    }

    absorbProperties(object) {
        for (var key in object) {
            if (!object.hasOwnProperty(key)) continue;
            this[key] = object[key];
        }
    }

    setAnimations(object) {
        var frames = this.frames || this.defaultFrames;
        var framePrefix;
        var isWeapon = (object === this.weapon);
        
        if(isWeapon) {
            frames = this.defaultFrames;
            framePrefix = this.weapon.name;
        } else {
            framePrefix = (this instanceof window.Monster ? this.monsterName : this.armorName);
        }

        var rates = {
            "": 8,
            "idle_": (frames.hasOwnProperty('idle_rate') ? frames.idle_rate : 2),
            "attack_": 14
        };

        var globalAnimPrefix = framePrefix + "_";
        var scene = Game.scene;

        // Helper to safely create animation
        var createAnim = function(key, generateConfig, rate, repeat) {
            if (!scene.anims.exists(key)) {
                scene.anims.create({
                    key: key,
                    frames: scene.anims.generateFrameNames(object.texture.key, generateConfig),
                    frameRate: rate,
                    repeat: repeat ? -1 : 0
                });
            }
        };

        // Death animation
        var deathKey = globalAnimPrefix + 'death';
        if(frames.hasOwnProperty('death')) {
            createAnim(deathKey, { prefix: framePrefix+'_', start: frames.death[0], end: frames.death[1] }, 8, false);
        } else {
            createAnim('death', { prefix: 'death_', start: 0, end: 5 }, 8, false);
            deathKey = 'death';
        }
        if(!object.animKeys) object.animKeys = {};
        object.animKeys['death'] = deathKey;

        var prefixes = ['','idle_','attack_'];
        var directions = ['down','up','left','right'];
        for(var p =0; p < prefixes.length; p++) {
            for (var d = 0; d < directions.length; d++) {
                var animation = prefixes[p]+directions[d];
                if(frames.hasOwnProperty(animation)) {
                    var animKey = globalAnimPrefix + animation;
                    var fmsConfig = { prefix: framePrefix+'_', start: frames[animation][0], end: frames[animation][1] };
                    createAnim(animKey, fmsConfig, rates[prefixes[p]], (prefixes[p] !== 'attack_'));
                    object.animKeys[animation] = animKey;
                }
            }
        }
    }

    idle(force) {
        this.animate('idle_' + window.orientationsDict[this.orientation], force);
    }

    attackAndDisplay(hp) {
        if(!this.target) return;
        this.attack();
        this.target.displayHP(hp);
    }

    attack() {
        if(!this.target) return;
        var direction = Game.adjacent(this, this.target);
        if(direction > 0) this.orientation = direction;
        this.animate('attack_' + window.orientationsDict[this.orientation], false);
        
        // In Phaser 3, checking if in camera view is different, assuming roughly always visible for now
        var sound = (this instanceof window.Player ? 'hit1' : 'hurt');
        Game.scene.sound.play(sound);
        
        if(this.target.deathmark) {
            setTimeout((_target) => { _target.die(true); }, 500, this.target);
        }
        this.idle();
    }

    flagForDeath() {
        this.deathmark = true;
    }

    displayHP(hp) {
        var color = (this.isPlayer ? (hp >= 0 ? 'heal' : 'hurt') : 'hit');
        Game.displayHP(hp, color, this, Game.HPdelay);
        if(this.isPlayer && hp > 0) Game.scene.sound.play('heal');
    }

    endFight() {
        if(this.fightTween) this.fightTween.stop();
        this.fightTween = null;
        this.inFight = false;
        this.deathmark = false;
        this.idle(false);
    }

    adjustStartPosition(start) {
        switch(this.orientation){
            case 3: if(this.x % 32 !== 0) start.x++; break;
            case 4: if(this.y % 32 !== 0) start.y++; break;
        }
        return start;
    }

    pathfindingCallback(finalOrientation, action, delta, sendToServer, path) {
        if(path === null && this.isPlayer) {
            if(Game.moveTarget) Game.moveTarget.setVisible(false);
            if(Game.marker) Game.marker.setVisible(true);
        } else if(path !== null){
            if(action.action === 3 || action.action === 4){
                finalOrientation = Game.computeFinalOrientation(path);
                path.pop();
            }
            var actionToSend = (action.action !== 1 ? action : {action:0});
            if(this.isPlayer && sendToServer && path.length) window.Client.sendPath(path, actionToSend, finalOrientation);
            this.move(path, finalOrientation, action, delta);
        }
    }

    move(path, finalOrientation, action, delta) {
        if(!path.length ){
            this.finishMovement(finalOrientation,action);
            return;
        }
        var x_steps = [];
        var y_steps = [];
        for(var q = 0; q < path.length; q++){
            x_steps.push(path[q].x * Game.map.tileWidth);
            y_steps.push(path[q].y * Game.map.tileWidth);
        }
        
        this.lastOrientationCheck = 0;
        var duration = Math.ceil(Math.max(1, path.length * this.speed - delta));
        
        var checkRate = (this instanceof window.Player ? 0.7 : 0.4);
        this.tween = Game.scene.tweens.add({
            targets: this,
            x: { value: x_steps },
            y: { value: y_steps },
            duration: duration,
            onUpdate: () => {
                if(Date.now() - this.lastOrientationCheck < this.speed * checkRate) return;
                this.lastOrientationCheck = Date.now();
                if(this.x > this.previousPosition.x) this.orient(3);
                else if(this.x < this.previousPosition.x) this.orient(1);
                else if(this.y > this.previousPosition.y) this.orient(4);
                else if(this.y < this.previousPosition.y) this.orient(2);
                
                this.animate(window.orientationsDict[this.orientation], false);
                this.previousPosition.x = this.x;
                this.previousPosition.y = this.y;
            },
            onComplete: () => {
                this.finishMovement(finalOrientation, action);
            }
        });
    }

    orient(orientation) {
        if(this.orientation !== orientation) this.orientation = orientation;
    }

    stopMovement(complete) {
        if(this.tween) this.tween.stop();
        this.tween = null;
    }

    setPosition(x, y) {
        this.x = x * Game.map.tileWidth;
        this.y = y * Game.map.tileHeight;
        this.previousPosition = {x: this.x, y: this.y};
    }

    finishMovement(finalOrientation, action) {
        if(this.isPlayer) {
            if (action.action === 1) {
                action.character.displayBubble(action.text);
                if(!Game.speakAchievement) Game.handleSpeakAchievement();
            }
            if(Game.moveTarget) Game.moveTarget.setVisible(false);
            Game.handleLocationAchievements();
        }
        if(this instanceof window.Player) {
            var door = Game.detectElement(Game.doors, this.x, this.y);
            if(door) finalOrientation = this.teleport(door);
        }
        if(finalOrientation) this.orient(finalOrientation);
        this.tween = null;
        this.idle(false);
        Game.sortEntities();
    }

    hasMoved() {
        return (this.x !== this.previousPosition.x) || (this.y !== this.previousPosition.y);
    }

    animate(animation, force) {
        if(animation === 'death' || force) {
            this.sprite.anims.stop();
            if (this.sprite.animKeys && this.sprite.animKeys[animation]) {
                this.sprite.anims.play(this.sprite.animKeys[animation], true);
            }
            if(this.weapon && this.weapon.animKeys && this.weapon.animKeys[animation]) {
                this.weapon.anims.play(this.weapon.animKeys[animation], true);
            }
            return;
        }
        var currentAnim = this.sprite.anims.currentAnim;
        if(currentAnim && currentAnim.key.includes('death')) return;
        
        if(this.sprite.animKeys && this.sprite.animKeys[animation]) {
            this.sprite.anims.play(this.sprite.animKeys[animation], true);
        }
        if (this.weapon && this.weapon.animKeys && this.weapon.animKeys[animation]) {
            this.weapon.anims.play(this.weapon.animKeys[animation], true);
        }
    }

    delayedDeath(delay) {
        setTimeout((_being) => { _being.die(true); }, delay, this);
    }

    delayedKill(delay) {
        setTimeout((_being) => { _being.destroy(); }, delay, this);
    }
}
window.Being = Being;