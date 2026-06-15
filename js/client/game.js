
/*
 * Author: Jerome Renaux
 * E-mail: jerome.renaux@gmail.com
 */

"use strict";
class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'Game' });
    }
    init() {
        if (Game.init) Game.init.call(this);
    }
    preload() {
        window.Game.scene = this; // Store scene reference
        if (Game.preload) Game.preload.call(this);
    }
    create() {
        if (Game.create) Game.create.call(this);
    }
    update(time, delta) {
        if (Game.update) Game.update.call(this, time, delta);
    }
}

var Game = {
    borderPadding: 10,
    HUDheight: 32,
    achievementsHolderWidth: 850,
    barY: 0,
    nbGroundLayers: 4,
    defaultOrientation: 4,
    playerSpeed: 120,
    playerLife: 100,
    cursor: 'url(/assets/sprites/hand.png), auto',
    talkCursor: 'url(/assets/sprites/talk.png), auto',
    lootCursor: 'url(/assets/sprites/loot.png), auto',
    fightCursor: 'url(/assets/sprites/sword.png), auto',
    markerPosition: { x: 0, y: 0 },
    previousMarkerPosition: { x: 0, y: 0 },
    cameraFollowing: true,
    mapWideningY: 54,
    speechBubbleCornerSize: 5,
    healthBarWidth: 179,
    nbConnected: 0,
    playerIsInitialized: false,
    inDoor: false,
    HPdelay: 100,
    maxChatLength: 300,
    latency: 0,
    charactersPool: {},
    clickDelay: 200,
    clickEnabled: true
};

var orientationsDict = {
    1: 'left',
    2: 'up',
    3: 'right',
    4: 'down'
};

Game.init = function(){
    Game.easystar = new window.EasyStar.js();
    document.getElementById('game').style.cursor = Game.cursor;
};

Game.preload = function() {
    this.load.tilemapTiledJSON('map', 'assets/maps/minimap_client.json');
    this.load.image('tileset', 'assets/tilesets/tilesheet.png');
    this.load.atlas('atlas4', 'assets/sprites/atlas4.png', 'assets/sprites/atlas4.json');
    this.load.spritesheet('bubble', 'assets/sprites/bubble2.png', { frameWidth: 5, frameHeight: 5 });
    this.load.spritesheet('life', 'assets/sprites/lifelvl.png', { frameWidth: 5, frameHeight: 18 });
    this.load.audio('sounds', ['assets/audio/sounds.mp3', 'assets/audio/sounds.ogg']);
    this.load.json('entities', 'assets/json/entities_client.json');
};

// Makes a map mapping the numerical id's of elements of a collection to their names (their names being the keys used to fetch relevant data from JSON files)
Game.makeIDmap = function(collection,map){
    Object.keys(collection).forEach(function(key) {
        var e = collection[key];
        map[e.id] = key;
    });
};

Game.create = function() {
    Game.entities = this.add.container();
    Game.entities.setDepth(3);
    
    Game.scenery = this.add.container();
    Game.scenery.setDepth(1);
    
    Game.displayMap.call(this);

    Game.HUD = this.add.container();
    Game.HUD.setScrollFactor(0);
    Game.HUD.setDepth(5);
    
    Game.createMarker();

    // The user has initiated Phase 4, we request the initialization data from the server.
    Client.requestData();
};

Game.update = function(time, delta) {
    if(!Game.playerIsInitialized) return;
    
    var pointer = this.input.activePointer;
    var cell = Game.computeTileCoords(pointer.worldX, pointer.worldY);
    Game.markerPosition.x = cell.x * Game.map.tileWidth;
    Game.markerPosition.y = cell.y * Game.map.tileWidth;

    if(Game.chatInput && Game.chatInput.visible && !Game.chatInput.isFocused) {
        // chat input handling handled via DOM element now
    }

    if(Game.player && Game.player.hasMoved && Game.player.hasMoved()) {
        Game.checkCameraBounds();
    }

    if(Game.markerHasMoved()) {
        Game.computeView();
        Game.marker.visible = (Game.marker.canSee && Game.view.contains(Game.markerPosition.x,Game.markerPosition.y));

        if (Game.marker.visible) {
            var collide = false;
            if(Game.collisionArray[cell.y] && Game.collisionArray[cell.y][cell.x] === 1) collide = true;
            Game.updateMarker(Game.markerPosition.x, Game.markerPosition.y, collide);
            Game.previousMarkerPosition.x = Game.markerPosition.x;
            Game.previousMarkerPosition.y = Game.markerPosition.y;
        }
    }
};


// Main update function; processes the global update packages received from the server
Game.updateWorld = function(data) { // data is the update package from the server
    var createdPlayers = [];
    if(data.newplayers) {
        for (var n = 0; n < data.newplayers.length; n++) {
            Game.createPlayer(data.newplayers[n]);
            createdPlayers.push(data.newplayers[n].id);
        }
        if (data.newplayers.length > 0) Game.sortEntities(); // Sort entitites according to y coordinate to make them render properly above each other
    }

    // Create new monsters and items and store them in the appropriate maps
    if(data.newitems) Game.populateTable(Game.itemsTable,data.newitems,Game.createItem);
    if(data.newmonsters) {
        Game.populateTable(Game.monstersTable,data.newmonsters,Game.createMonster);
        Game.sortEntities();
    }

    for (var n = 0; n < createdPlayers.length; n++) {
        var player = Game.charactersPool[createdPlayers[n]];
        if(player.inFight){
            player.target = Game.monstersTable[player.targetID]; // ultimately, target is object, not ID
            player.fight();
        }
    }

    if(data.disconnected) { // data.disconnected is an array of disconnected players
        for (var i = 0; i < data.disconnected.length; i++) {
            Game.removePlayer(Game.charactersPool[data.disconnected[i]],true); // animate death
        }
    }

    // data.items, data.players and data.monsters are associative arrays mapping the id's of the entities
    // to small object indicating which properties need to be updated. The following code iterate over
    // these objects and call the relevant update functions.
    if(data.items) Game.traverseUpdateObject(data.items,Game.itemsTable,Game.updateItem);
    // "Status" updates ; used to update some properties that need to be set before taking any real action on the game objects
    if(data.players) Game.traverseUpdateObject(data.players,Game.charactersPool,Game.updatePlayerStatus);
    if(data.monsters) Game.traverseUpdateObject(data.monsters,Game.monstersTable,Game.updateMonsterStatus);
    // "Action" updates
    if(data.players) Game.traverseUpdateObject(data.players,Game.charactersPool,Game.updatePlayerAction);
    if(data.monsters) Game.traverseUpdateObject(data.monsters,Game.monstersTable,Game.updateMonsterAction);
};
// For each element in arr, call the callback on it and store the result in the map 'table'
Game.populateTable = function(table,arr,callback){
    for(var i = 0; i < arr.length; i++) {
        var data = arr[i];
        // The callback receives the object received from the server as an argument, uses the relevant factory to create
        // the proper sprite, and returns that sprite
        var object = callback(data);
        object.id = data.id;
        table[data.id] = object;
    }
};
// For each element in obj, call callback on it
Game.traverseUpdateObject = function(obj,table,callback){
    Object.keys(obj).forEach(function (key) {
        if(table[key]) callback(table[key],obj[key]);
    });
};

// CREATION CODE
Game.createMonster = function(data){
    var monster;
    if (Game.monstersTable[data.id]) {
        monster = Game.monstersTable[data.id];
    } else {
        monster = new window.Monster(data.x * Game.map.tileWidth, data.y * Game.map.tileHeight, 'atlas4');
    }
    monster.setUp(Game.monstersIDmap[data.monster]);
    Game.updateMonsterStatus(monster,data);
    Game.updateMonsterAction(monster,data);
    return monster;
};

Game.createItem = function(data) {
    var item;
    if(Game.itemsTable[data.id]) {
        item = Game.itemsTable[data.id];
    }else{
        item = new window.Item(data.x * Game.map.tileWidth, data.y * Game.map.tileHeight, 'atlas3');
        item.setUp(Game.itemsIDmap[data.itemID], data.chest, data.inChest, data.visible, data.respawn, data.loot);
    }
    Game.updateItem(item,data);
    return item;
};

Game.createPlayer = function(data){
    var player;
    if(Game.charactersPool[data.id]){
        player = Game.charactersPool[data.id];
    }else{
        player = Game.newPlayer(data.x,data.y,data.id);
    }
    if(!data.alive) player.setVisible(false);
    Game.setUpPlayer(player,data);
    Game.updatePlayerStatus(player,data);
    Game.updatePlayerAction(player,data);
    Game.displayedPlayers.add(player.id);
};

Game.newPlayer = function(x,y,id){
    var player = new window.Player(x * Game.map.tileWidth, y * Game.map.tileHeight, 'atlas3');
    player.orientation = Game.defaultOrientation;
    player.id = id;
    Game.entities.add(player);
    Game.charactersPool[id] = player;
    Game.sortEntities();
    return player;
};

Game.setUpPlayer = function(player,data){
    player.setName(data.name);
    player.speed = Game.playerSpeed;
    player.orientation = Game.defaultOrientation;
};

Game.fadeInTween = function(object){
    object.setAlpha(0);
    Game.scene.tweens.add({
        targets: object,
        alpha: 1,
        duration: 500
    });
};

// UPDATE CODE

Game.updateWorld = function(data) {
    if (data.newplayers) data.newplayers.forEach(function(p){ Game.createPlayer(p); });
    if (data.players) {
        data.players.forEach(function(p){
            var player = Game.charactersPool[p.id];
            if (player) {
                Game.updatePlayerStatus(player, p);
                Game.updatePlayerAction(player, p);
            }
        });
    }
    if (data.disconnected) {
        data.disconnected.forEach(function(id) {
            Game.removePlayer(Game.charactersPool[id], true);
        });
    }
    if (data.newmonsters) data.newmonsters.forEach(function(m) { Game.createMonster(m); });
    if (data.monsters) {
        data.monsters.forEach(function(m) {
            var monster = Game.monstersTable[m.id];
            if (monster) {
                Game.updateMonsterStatus(monster, m);
                Game.updateMonsterAction(monster, m);
            }
        });
    }
    if (data.newitems) data.newitems.forEach(function(i) { Game.createItem(i); });
    if (data.items) {
        data.items.forEach(function(i) {
            var item = Game.itemsTable[i.id];
            if (item) Game.updateItem(item, i);
        });
    }
    if (data.removeditems) {
        data.removeditems.forEach(function(id) {
            var item = Game.itemsTable[id];
            if(item) {
                item.remove();
                delete Game.itemsTable[id];
            }
        });
    }
};

Game.updatePlayerStatus = function(player,info){ // info contains the updated data from the server
    if(info.connected == false){
        Game.removePlayer(player,true);
        return;
    }
    if(info.x && info.y) player.setPosition(info.x*Game.map.tileWidth, info.y*Game.map.tileHeight);

    if(info.aoi){ // Update the id of the AOI that the player is in
        player.aoi = info.aoi;
        if(player.isPlayer) Game.updateDisplayList();
    }

    if(info.alive == false && player.alive == true) player.flagForDeath();
    if(info.weapon) Game.updateEquipment(player,info.weapon);
    if(info.armor) Game.updateEquipment(player,info.armor);
    if(info.weapon || info.armor) player.idle(false); // If an equipment change has taken place, need to resume idling animation
    if(info.targetID !== undefined) player.target = (info.targetID ? Game.monstersTable[info.targetID] : null);
};

Game.updateDisplayList = function(){
    // Whenever the player moves to a different AOI, for each player displayed in the game, check if it will still be
    // visible from the new AOI; if not, remove it
    if(!Game.displayedPlayers) return;
    var adjacent = AOIutils.listAdjacentAOIs(Game.player.aoi);
    Game.displayedPlayers.forEach(function(pid){
        var p = Game.charactersPool[pid];
        // check if the AOI of player p is in the list of the AOI's adjacent to the main player
        if(p) if(adjacent.indexOf(p.aoi) == -1) Game.removePlayer(p,false); // false: don't animate death
    });
};

Game.updateEquipment = function(player,eqID){
    var equipment = Game.itemsIDmap[eqID];
    var itemInfo = Game.itemsInfo[equipment];
    if(itemInfo.type == 1){ // weapon
        player.equipWeapon(equipment);
    }else if(itemInfo.type == 2){ // armor
        player.equipArmor(equipment);
    }
};

Game.updatePlayerAction = function(player,info){ // info contains the updated data from the server
    if(info.alive == true && player.alive == false) player.respawn();
    if(!player.alive) return;
    if(info.alive == false && player.alive == true){
        if(!player.isPlayer){ // only for other players; for self, attackAndDisplay will be used instead
            var hitter = Game.monstersTable[info.lastHitter];
            if(hitter) hitter.attack();
            player.delayedDeath(500);
        }
        return;
    }
    if (!player.isPlayer && info.route) Game.moveCharacter(player.id,info.route.end,info.route.orientation,info.route.delta);
    if(info.inFight == false && player.inFight == true){
        player.endFight();
    }else if(info.inFight == true && player.inFight == false) {
        player.fight();
    }
};

Game.updateMonsterStatus = function(monster,info){ // info contains the updated data from the server
    if(info.alive == false && monster.alive == true){
        monster.flagForDeath();
        monster.delayedDeath(500);
        return;
    }
    if(info.x && info.y) monster.setPosition(info.x*Game.map.tileWidth,info.y*Game.map.tileHeight);
    if(info.targetID !== undefined) monster.target = Game.charactersPool[info.targetID];
};

Game.updateMonsterAction = function(monster,info){ // info contains the updated data from the server
    if(info.alive == false && monster.alive == true){
        var hitter = Game.charactersPool[info.lastHitter];
        if(hitter) hitter.attack();
        return;
    }else if(info.alive == true && monster.alive == false){
        monster.respawn();
    }
    if (info.route) Game.moveMonster(monster.id,info.route.path, info.route.delta);
    if(info.inFight == false && monster.inFight == true){
        monster.endFight();
    }else if(info.inFight == true && monster.inFight == false) {
        monster.fight();
    }
};

Game.updateItem = function(item,info){ // info contains the updated data from the server
    if(info.visible == false && item.alive == true) {
        item.remove();
    }else if(info.visible == true && item.alive == false){
        item.respawn();
    }
    if(info.inChest == false && item.inChest == true) item.open();
};

Game.updateSelf = function(data){
    // Whereas updateWorld processes the global updates from the server about entities in the world, updateSelf
    // processes updates specific to the player, visible only to him
    if(data.life !== undefined){
        Game.player.life = data.life;
        Game.player.updateLife();
    }
    if(data.x != undefined && data.y != undefined){
        if(!Game.player.alive) Game.player.respawn(); // A change of position is send via personal update package only in case of respawn, so respawn is called immediately
        Game.player.setPosition(data.x*Game.map.tileWidth, data.y*Game.map.tileHeight);
        Game.followPlayer();
    }
    // data.hp is an array of "hp" objects, which contain info about hit points to display over specific targets
    if(data.hp !== undefined) {
        for (var h = 0; h < data.hp.length; h++) {
            var hp = data.hp[h];
            if (hp.target == false) { // The HP should appear above the player
                if(hp.from !== undefined){
                    var attacker = Game.monstersTable[hp.from];
                    attacker.attackAndDisplay(-(hp.hp));
                }else{
                    Game.player.displayHP(hp.hp, 0);
                }
            } else if (hp.target == true) { // The HP should appear above the target monster
                Game.player.attackAndDisplay(-(hp.hp));
            }
        }
    }
    if(data.killed){ // array of monsters killed by the player since last packet
        for(var i = 0; i < data.killed.length; i++){
            var killed = Game.monstersInfo[Game.monstersIDmap[data.killed[i]]].name;
            Game.messageIn('You killed a '+killed+'!');
            Game.handleKillAchievement(data.killed[i]);
        }
    }
    if(data.used){ // array of items used by the player since last packet
        for(var i = 0; i < data.used.length; i++){
            var used = Game.itemsInfo[Game.itemsIDmap[data.used[i]]];
            if(used.msg) Game.messageIn(used.msg);
            if(!Game.weaponAchievement || !Game.armorAchievement) Game.handleLootAchievement(data.used[i]);
        }
    }
    if(data.noPick){ // boolean indicating whether the player tried to pick an inferior item
        Game.messageIn('You already have better equipment!');
        Game.sounds.play('noloot');
    }
};

Game.revivePlayer = function(){ // Revive the player after clicking "revive"
    Client.sendRevive();
    Game.deathScroll.hideTween.start();
};

// INIT CODE

Game.setLatency = function(latency){
    Game.latency = latency;
};

Game.initWorld = function(data){
    AOIutils.nbAOIhorizontal = data.nbAOIhorizontal;
    AOIutils.lastAOIid = data.lastAOIid;

    Game.displayHero(data.player.x,data.player.y,data.player.id);

    Game.displayHUD();

    Game.setUpPlayer(Game.player,data.player);
    Game.updatePlayerStatus(Game.player,data.player);

    Game.groundMapLayers.setDepth(0);
    Game.scenery.setDepth(1);
    Game.markerGroup.setDepth(2);
    Game.entities.setDepth(3);
    Game.highMapLayers.setDepth(4);
    Game.HUD.setDepth(5);

    Game.itemsTable = {};
    Game.monstersTable = {};
    Game.displayedPlayers = new Set();
    Game.playerIsInitialized = true;

    // Remove obsolete visibility change code
    
    Game.weaponAchievement = Client.hasAchievement(0);
    Game.armorAchievement = Client.hasAchievement(4);
    Game.speakAchievement = Client.hasAchievement(3);

    Client.emptyQueue();
    Game.groundMapLayers.each(layer => layer.setVisible(true));
    Game.highMapLayers.each(layer => layer.setVisible(true));

    if(Game.loadingShade) Game.loadingShade.destroy();
    if(Game.loadingText) Game.loadingText.destroy();
    Game.messageIn((Game.isNewPlayer ? 'Welcome to Cyberia!' : 'Welcome back!' ));

    if(Game.isNewPlayer) Game.toggleHelp();
};

Game.displayHero = function(x,y,id){
    Game.player = Game.newPlayer(x,y,id);
    Game.player.setIsPlayer(true);
    Game.cameraFocus = Game.scene.add.sprite(Game.player.x, Game.player.y + 16, 'atlas1', 'marker_0'); // dummy focus
    Game.cameraFocus.setVisible(false);
    Game.player.add(Game.cameraFocus);
    Game.followPlayer();
};

// MOVE CODE

Game.moveCharacter = function(id,end,orientation,delta){ // Move character according to information from the server
    // end is a small object containing the x and y coordinates to move to
    // orientation, between 1 and 4, indicates the orientation the character should face at the end of the movement
    // delta is the latency of the player, to adjust the speed of the movements (movements go faster as the latency increase, to make sure they don't get increasingly out of sync)
    var character = Game.charactersPool[id];
    character.prepareMovement(end,orientation,{action:0},delta+Game.latency,false); // false : don't send path to server
};
Game.moveMonster = function(id,path,delta){ // Move monster according to information from the server
    // path is an array of 2-tuples of coordinates, representing the path to follow
    // delta is the latency of the player, to adjust the speed of the movements (movements go faster as the latency increase, to make sure they don't get increasingly out of sync)
    var monster = Game.monstersTable[id];
    if(monster) monster.prepareMovement(path, {action: 0}, delta+Game.latency);
};

// REMOVAL CODE

Game.removePlayer = function(player,animate){
    // animate is a boolean to indicate if the death animation should be played or not (if the player to be removed is not visible on screen, it's useless to play the animation)
    if(!player) return;
    player.die(animate);
    delete Game.charactersPool[player.id];
};

// ======================

// SCREENS CODE : Code about displaying screens of any kind

Game.makeAchievementsScroll = function(){
    // Not fully converting achievements scroll as it is complex and out of scope of immediate death/help screens
    // But we need a stub or a basic container so it doesn't crash
    Game.achievementsBg = Game.scene.add.container(Game.scene.scale.width/2, Game.scene.scale.height/2);
    Game.achievementsBg.setVisible(false);
};

Game.makeDeathScroll = function(){
    Game.deathScroll = Game.scene.add.container(Game.scene.scale.width/2, Game.scene.scale.height/2);
    Game.deathScroll.setAlpha(0);
    Game.deathScroll.setVisible(false);
    Game.deathScroll.setScrollFactor(0);
    Game.deathScroll.setDepth(100);

    let bg = Game.scene.add.sprite(0, 0, 'atlas1', 'scroll_1').setOrigin(0.5);
    let scroll_2 = Game.scene.add.sprite(bg.width/2, 0, 'atlas1', 'scroll_2').setOrigin(0, 0.5);
    let scroll_3 = Game.scene.add.sprite(-bg.width/2, 0, 'atlas1', 'scroll_3').setOrigin(1, 0.5);
    Game.deathScroll.add([bg, scroll_2, scroll_3]);

    var title = Game.scene.add.text(0, -20, 'You died...',{
        fontFamily: 'pixel',
        fontSize: '30px',
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3
    }).setOrigin(0.5);
    Game.deathScroll.add(title);

    var button = Game.scene.add.sprite(0, 65, 'atlas1', 'revive_0').setOrigin(0.5).setInteractive();
    button.on('pointerup', function() {
        Game.revivePlayer();
        Game.scene.tweens.add({
            targets: Game.deathScroll,
            alpha: 0,
            duration: 200,
            onComplete: () => { Game.deathScroll.setVisible(false); }
        });
    }, Game);
    Game.deathScroll.add(button);
};

Game.makeFlatScroll = function(callback){
    var scroll = Game.scene.add.container(Game.scene.scale.width/2, Game.scene.scale.height/2);
    scroll.setScrollFactor(0);
    scroll.setAlpha(0);
    scroll.setVisible(false);
    scroll.setDepth(100);
    
    var bg = Game.scene.add.sprite(0, 0, 'atlas1','achievements').setOrigin(0.5);
    scroll.add(bg);

    var closeBtn = Game.scene.add.sprite(bg.width/2 - 10, -bg.height/2 + 10, 'atlas1', 'close_0').setOrigin(0.5).setInteractive();
    closeBtn.on('pointerup', callback, Game);
    scroll.add(closeBtn);

    return scroll;
};

Game.makeHelpScroll = function(){
    Game.helpScroll = Game.makeFlatScroll(Game.toggleHelp);
    
    var titleText = Game.scene.add.text(0, -120, 'How to play',{
        fontFamily: 'pixel',
        fontSize: '24px',
        color: "#f4d442",
        stroke: "#000000",
        strokeThickness: 3
    }).setOrigin(0.5);
    Game.helpScroll.add(titleText);
    
    var mouseY = -50;
    var enterY = 20;
    var charY = 90;
    var style = {fontFamily: 'pixel', fontSize: '18px', color: '#fff'};
    
    var mouse = Game.scene.add.sprite(-100, mouseY, 'atlas1', 'mouse').setOrigin(0.5);
    Game.helpScroll.add(mouse);
    var mouseText = Game.scene.add.text(-50, mouseY, Game.db.texts.help_move, style).setOrigin(0, 0.5);
    Game.helpScroll.add(mouseText);
    
    var enter = Game.scene.add.sprite(-100, enterY, 'atlas1', 'enter').setOrigin(0.5);
    Game.helpScroll.add(enter);
    var enterText = Game.scene.add.text(-50, enterY, Game.db.texts.help_chat, style).setOrigin(0, 0.5);
    Game.helpScroll.add(enterText);
    
    var char = Game.scene.add.sprite(-100, charY, 'atlas3', 'clotharmor_31').setOrigin(0.5);
    Game.helpScroll.add(char);
    var charText = Game.scene.add.text(-50, charY, Game.db.texts.help_save, style).setOrigin(0, 0.5);
    Game.helpScroll.add(charText);
};

Game.makeOrientationScreen = function(){
    Game.orientationContainer = Game.scene.add.container(0,0);
    Game.orientationContainer.setScrollFactor(0);
    Game.orientationContainer.setDepth(200);

    Game.orientationShade = Game.scene.add.graphics();
    Game.orientationShade.fillStyle(0x000000,1);
    Game.orientationShade.fillRect(0,0,Game.scene.scale.width,Game.scene.scale.height);
    Game.orientationContainer.add(Game.orientationShade);

    Game.deviceImage = Game.scene.add.sprite(Game.scene.scale.width/2,Game.scene.scale.height/2,'atlas1','device').setOrigin(0.5);
    Game.orientationContainer.add(Game.deviceImage);

    Game.rotateText = Game.scene.add.text(Game.scene.scale.width/2, Game.deviceImage.y + Game.deviceImage.height + 20, Game.db.texts.orient,{
        fontFamily: 'pixel',
        fontSize: '40px',
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
        wordWrap: { width: 400 }
    }).setOrigin(0.5, 0);
    Game.orientationContainer.add(Game.rotateText);
    Game.orientationContainer.setVisible(false);
};

Game.displayDeathScroll = function(){
    if(!Game.deathScroll) Game.makeDeathScroll();
    Game.deathScroll.setVisible(true);
    Game.scene.tweens.add({ targets: Game.deathScroll, alpha: 1, duration: 200 });
};

Game.displayError = function(){
    if(Game.loadingText) {
        Game.loadingText.setText(Game.db.texts.db_error);
        Game.loadingText.setOrigin(0.5);
        Game.loadingText.setPosition(Game.scene.scale.width/2, Game.scene.scale.height/2);
    }
};

Game.displayLoadingScreen = function(){
    Game.loadingShade = Game.scene.add.graphics();
    Game.loadingShade.fillStyle(0x000000,1);
    Game.loadingShade.fillRect(Game.borderPadding,Game.borderPadding,Game.scene.scale.width-(Game.borderPadding*2),Game.scene.scale.height-(Game.borderPadding*2));
    Game.loadingShade.setScrollFactor(0);
    Game.loadingShade.setDepth(100);

    Game.loadingText = Game.scene.add.text(Game.scene.scale.width/2, Game.scene.scale.height/2, Game.db.texts.create,{
        fontFamily: 'pixel',
        fontSize: '18px',
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
        wordWrap: { width: 400 }
    }).setOrigin(0.5);
    Game.loadingText.setScrollFactor(0);
    Game.loadingText.setDepth(101);
};

Game.displayOrientationScreen = function(){
    if(!Game.orientationContainer) Game.makeOrientationScreen();
    if(Game.helpScroll && Game.helpScroll.visible) Game.toggleHelp();
    if(Game.achievementsBg && Game.achievementsBg.visible) Game.toggleAchievements();
    Game.orientationContainer.setVisible(true);
};

Game.removeOrientationScreen = function(){
    if(Game.orientationContainer) Game.orientationContainer.setVisible(false);
};

Game.toggleHelp = function(){
    if(!Game.helpScroll) Game.makeHelpScroll();
    if(Game.helpScroll.visible){
        Game.helpButton.setFrame('helpicon_0');
        Game.scene.tweens.add({
            targets: Game.helpScroll, alpha: 0, duration: 200, 
            onComplete: () => { Game.helpScroll.setVisible(false); }
        });
    }else{
        Game.helpScroll.setVisible(true);
        Game.helpButton.setFrame('helpicon_1');
        Game.scene.tweens.add({ targets: Game.helpScroll, alpha: 1, duration: 200 });
    }
};

Game.toggleAchievements = function(){
    if(!Game.achievementsBg) Game.makeAchievementsScroll();
    if(Game.achievementsBg.visible){
        Game.achButton.setFrame('achievementicon_0');
        Game.achievementsBg.setVisible(false);
    }else{
        Game.achButton.setFrame('achievementicon_1');
        Game.achievementsBg.setVisible(true);
        if(Game.achTween.isPlaying()) Game.achTween.pause();
    }
};

Game.updateAchievements = function(){
    // Not converting fully for phase 4 unless requested
};

Game.changeAchievementsPage = function(dir){
    // Not converting fully for phase 4 unless requested
};

Game.updateAchievementsArrows = function(){
    // Not converting fully for phase 4 unless requested
};

// ==============

// ACHIEVEMENTS CODE : Code about handling achievements

Game.handleLootAchievement = function(id){ // item id
    var item = Game.itemsInfo[Game.itemsIDmap[id]];
    if(item.type !== undefined){
        if(item.type == 1 && !Game.weaponAchievement){
            Game.getAchievement(0);
            Game.weaponAchievement = true;
        }else if(item.type == 2 && !Game.armorAchievement){
            Game.getAchievement(4);
            Game.armorAchievement = true;
        }
    }
};

Game.handleSpeakAchievement = function() {
    Game.getAchievement(3);
    Game.speakAchievement = true;
};

Game.handleKillAchievement = function(id){ // monster id
    var nbKilled =  localStorage.getItem('killed_'+id);
    if(nbKilled === undefined) nbKilled = 0;
    nbKilled++;
    localStorage.setItem('killed_'+id,nbKilled);
    var aid = Game.monstersInfo[Game.monstersIDmap[id]].achievement;
    if(Game.db.achievements[aid] && nbKilled >= Game.db.achievements[aid].nb && !Client.hasAchievement(aid)) Game.getAchievement(aid);
};

Game.handleLocationAchievements = function(){
    if(Game.inDoor || !Game.locationAchievements.length) return;
    var pos = Game.computeTileCoords(Game.player.x,Game.player.y);
    for(var i = Game.locationAchievements.length-1; i >= 0 ; i--){
        var area = Game.locationAchievements[i];
        if((area.criterion == "in" && area.contains(pos.x,pos.y)) || (area.criterion == "out" && !area.contains(pos.x,pos.y))){
            Game.getAchievement(area.achID);
            Game.locationAchievements.splice(i,1);
        }
    }
};

Game.getAchievement = function(id){
    Client.setAchievement(id);
    Game.scene.sound.play('achievement');
    
    if(Game.achTween && !Game.achTween.isPlaying()) Game.achTween.resume();
    Game.achBarContainer.setVisible(true);
    
    Game.achBar.achName.text = Game.db.achievements[id].name;
    
    Game.scene.tweens.add({
        targets: Game.achBarContainer,
        y: Game.barY - 68,
        duration: 200,
        yoyo: true,
        hold: 5000,
        onComplete: () => { Game.achBarContainer.setVisible(false); }
    });
};

Game.findLocationAchievements = function(){
    Game.locationAchievements = [];
    Object.keys(Game.db.achievements).forEach(function(achID){
        if(Client.hasAchievement(achID)) return;
        var ach = Game.db.achievements[achID];
        if(ach.locationAchievement) {
            var area = new Phaser.Rectangle(ach.rect.x,ach.rect.y,ach.rect.w,ach.rect.h);
            area.criterion = ach.criterion;
            area.achID = achID;
            Game.locationAchievements.push(area);
        }
    });
};

// =======================
// POS CODE : Code for position and camera-related computations

// Determines if two entities (a and b) are on the same cell (returns -1), on adjacent (non-diagonal) cells (returns a value between
// 1 and 4 corresponding to the orientation of a with respect to b) or further apart (returns 0)
Game.adjacent = function(a,b){
    if(!a || !b) return 0;
    var posA = Game.computeTileCoords(a.x, a.y);
    var posB = Game.computeTileCoords(b.x, b.y);
    var Xdiff = posA.x-posB.x;
    var Ydiff = posA.y-posB.y;
    if(Xdiff == 1 && Ydiff == 0){
        return 1;
    }else if(Xdiff == 0 && Ydiff == 1) {
        return 2;
    }else if(Xdiff == -1 && Ydiff == 0){
        return 3;
    }else if(Xdiff == 0 && Ydiff == -1) {
        return 4;
    }else if(Xdiff == 0 && Ydiff == 0){ // The two entities are on the same cell
        return -1;
    }else{ // The two entities are not on adjacent cells, nor on the same one
        return 0;
    }
};

// Fetches the first element from the space map at the proived coordinates
Game.detectElement = function(map,x,y){
    // map is the spaceMap in which to look
    var cell = Game.computeTileCoords(x,y);
    return map.getFirst(cell.x,cell.y);
};

// Compute the orientation that the player must have to go to the last cell of its path (used when the last cell is occupied by something and the past has to be "shortened" by one cell)
Game.computeFinalOrientation = function(path){ // path is a list of cells
    // path is an array of 2-tuples of coordinates
    var last = path[path.length-1];
    var beforeLast =  path[path.length-2];
    if(last.x < beforeLast.x){
        return 1;
    }else if(last.y < beforeLast.y){
        return 2;
    }else if(last.x > beforeLast.x){
        return 3;
    }else if(last.y > beforeLast.y){
        return 4;
    }
};

// Convert pixel coordinates into tiles coordinates (e.g. 96, 32 becomes 3, 1)
Game.computeTileCoords = function(x,y){
    var layer = Game.map.gameLayers[0];
    return new Phaser.Point(layer.getTileX(x),layer.getTileY(y));
};

// Returns the rectangle corresponding to the view of the camera (not counting HUD, the actual view of the world)
Game.computeView = function(){
    Game.view = new Phaser.Rectangle(game.camera.x + Game.borderPadding, game.camera.y + Game.borderPadding,
        game.camera.width - Game.borderPadding*2, game.camera.height - Game.borderPadding*2 - Game.HUDheight);
};

Game.checkCameraBounds = function(){
    // Due to the shape of the map, the bounds of the camera cannot always be the same; north of some Y coordinate (Game.mapWideningY),
    // the width of the bounds has to increase, from 92 to 113.
    var pos = Game.computeTileCoords(Game.player.x,Game.player.y);
    if(Game.cameraFollowing && pos.y <= Game.mapWideningY && game.camera.bounds.width == 92*Game.map.tileWidth){
        Game.tweenCameraBounds(113);
    }else if(Game.cameraFollowing && pos.y > Game.mapWideningY && game.camera.bounds.width == 113*Game.map.tileWidth){
        Game.tweenCameraBounds(92);
    }
};

Game.tweenCameraBounds = function(width){
    // width is the width in pixels of the camera bounds that should be tweened to
    var tween = game.add.tween(Game.camera.bounds);
    tween.to({width: width*Game.map.tileWidth}, 1500,null, false, 0);
    tween.start();
};

Game.followPlayer = function(){ // Make the camera follow the player, within the appropriate bounds
    Game.inDoor = false;
    // Rectangle to which the camera is bound, cannot move outside it
    var width = (Game.player.x >= 92 ? 113 : 92);
    game.camera.bounds = new Phaser.Rectangle(Game.map.tileWidth-Game.borderPadding,Game.map.tileWidth-Game.borderPadding,width*Game.map.tileWidth,311*Game.map.tileWidth);
    game.camera.follow(Game.cameraFocus);
    Game.cameraFollowing = true;
};

Game.followPlayerIndoors = function(x,y,mx,my){ // Follow player but with extra constraints due to being indoors
    // x and y are the coordinates in tiles of the top left corner of the rectangle in which the camera can move
    // mx and my are the coordinates in tiles of the bottom right corner of that same rectangle
    Game.inDoor = true;
    game.camera.follow(Game.cameraFocus);
    if(x && y && mx && my) {
        var w = Math.max((mx - x)*Game.map.tileWidth,game.width);
        var h = (my - y)*Game.map.tileHeight;
        game.camera.bounds = new Phaser.Rectangle(x*Game.map.tileWidth,y*Game.map.tileHeight,w,h);
    }else{
        game.camera.bounds = new Phaser.Rectangle(Game.map.tileWidth - Game.borderPadding, Game.map.tileWidth - Game.borderPadding, 170 * Game.map.tileWidth, 311 * Game.map.tileWidth);
    }
    Game.cameraFollowing = true;
};

Game.unfollowPlayer = function(){ // Make the camera stop following player, typically because he is in a small indoors area
    Game.inDoor = true;
    game.camera.unfollow();
    game.camera.bounds = null;
    Game.cameraFollowing = false;
};

// =============
// Sounds-related code

Game.addSounds = function(){
    // Slices the audio sprite based on the markers positions fetched from the JSON
    var markers = Game.db.sounds;
    Game.sounds = game.add.audio('sounds');
    Game.sounds.allowMultiple = true;
    Object.keys(markers.spritemap).forEach(function(sound){
        var sfx = markers.spritemap[sound];
        Game.sounds.addMarker(sound, sfx.start, sfx.end-sfx.start);
    });
};

//===================
// Animations-related code

// Sets up basic, single-orientation animations for scenic animated sprites
Game.basicAnimation = function(sprite){ // sprite is the sprite to which the animation should be applied
    var frames = [];
    for(var m = 0; m < sprite.nbFrames; m++){ // Generate the list of frames of the animations based on the initial frame and the total number of frames
        frames.push(sprite.frame+m);
    }
    sprite.animations.add('idle', frames, sprite.rate, true);
    sprite.animations.play('idle');
};

// Same but using atlas frames
Game.basicAtlasAnimation = function(sprite){ // sprite is the sprite to which the animation should be applied
    // sprite, nbFrames, ... are absorbed from npc.json when a new NPC() is created
    sprite.animations.add('idle', Phaser.Animation.generateFrameNames(sprite.atlasKey+'_', 0, 0+sprite.nbFrames-1), sprite.rate, true);
    sprite.animations.play('idle');
};

//======================
// HUD CODE: HUD-related code

Game.displayHUD = function() {
    var lifeX = Game.borderPadding;
    var lifeY = Game.scene.scale.height - Game.borderPadding - Game.HUDheight + 6;
    Game.barY = Game.scene.scale.height - Game.borderPadding - Game.HUDheight;

    Game.HUDbuttons = Game.scene.add.container();

    Game.displayChatBar();
    Game.displayAchievementDock();

    Game.HUD.add(Game.scene.add.sprite(Game.borderPadding, Game.barY, 'atlas1','bar').setOrigin(0));
    Game.weaponIcon = Game.scene.add.sprite(Game.borderPadding + 210, Game.barY, 'atlas3').setOrigin(0);
    Game.HUD.add(Game.weaponIcon);
    Game.armorIcon = Game.scene.add.sprite(Game.borderPadding + 244, Game.barY + 3,'atlas3').setOrigin(0);
    Game.HUD.add(Game.armorIcon);

    Game.HUDmessage = null;
    Game.messages = [];
    for(var m = 0; m < 4; m++){
        var msg = Game.scene.add.text(490, Game.barY+5, '', {
            fontFamily: 'pixel',
            fontSize: '16px',
            color: "#eeeeee"
        }).setOrigin(0.5, 0);
        msg.setVisible(false);
        msg.activeMsg = false;
        Game.messages.push(msg);
        Game.HUD.add(msg);
    }

    Game.nbConnectedText = Game.scene.add.text(745, Game.barY+8, '0 players', {
        fontFamily: 'pixel',
        fontSize: '16px',
        color: "#eeeeee"
    }).setOrigin(0);
    Game.HUD.add(Game.nbConnectedText);

    Game.chatButton = Game.scene.add.image(850, Game.barY + 2, 'atlas1', 'talkicon_0').setOrigin(0).setInteractive({useHandCursor: false});
    Game.chatButton.on('pointerup', Game.toggleChat, this);
    Game.HUDbuttons.add(Game.chatButton);

    Game.achButton = Game.scene.add.image(880, Game.barY + 2, 'atlas1', 'achievementicon_0').setOrigin(0).setInteractive({useHandCursor: false});
    Game.achButton.on('pointerup', Game.toggleAchievements, this);
    Game.HUDbuttons.add(Game.achButton);

    Game.helpButton = Game.scene.add.image(910, Game.barY + 2, 'atlas1', 'helpicon_0').setOrigin(0).setInteractive({useHandCursor: false});
    Game.helpButton.on('pointerup', Game.toggleHelp, this);
    Game.HUDbuttons.add(Game.helpButton);

    var soundButton = Game.scene.add.image(940, Game.barY + 2, 'atlas1', 'soundicon_2').setOrigin(0).setInteractive({useHandCursor: false});
    soundButton.on('pointerup', function () {
        if(!Game.scene.sound.mute){
            soundButton.setFrame('soundicon_1');
        }else{
            soundButton.setFrame('soundicon_2');
        }
        Game.scene.sound.mute = !Game.scene.sound.mute;
    }, this);
    Game.HUDbuttons.add(soundButton);

    // Set up the blinking tween that triggers when a new achievement is unlocked
    Game.achTween = Game.scene.tweens.add({
        targets: Game.achButton,
        alpha: 0.5, // simulate blinking
        duration: 500,
        yoyo: true,
        repeat: -1,
        paused: true
    });

    Game.createLifeBar(lifeX, lifeY);
    Game.HUD.add(Game.health);
    Game.HUD.add(Game.scene.add.sprite(lifeX, lifeY, 'atlas1','life').setOrigin(0));
    Game.HUD.add(Game.HUDbuttons);
    
    var chatKey = Game.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    chatKey.on('down', Game.toggleChat, this);
};

Game.displayChatBar = function(){
    Game.chatBar = Game.scene.add.sprite(96, Game.barY+1, 'atlas1', 'chatbar').setOrigin(0);
    Game.HUD.add(Game.chatBar);
    Game.chatBar.setVisible(false);
    
    // We will use DOM element for input in Phaser 3
    if(!document.getElementById('chatInput')) {
        Game.chatInputElement = document.createElement('input');
        Game.chatInputElement.id = 'chatInput';
        Game.chatInputElement.type = 'text';
        Game.chatInputElement.maxLength = Game.maxChatLength;
        Game.chatInputElement.style.position = 'absolute';
        Game.chatInputElement.style.left = '115px';
        Game.chatInputElement.style.top = (Game.barY - 20) + 'px';
        Game.chatInputElement.style.width = '750px';
        Game.chatInputElement.style.height = '18px';
        Game.chatInputElement.style.background = 'transparent';
        Game.chatInputElement.style.border = 'none';
        Game.chatInputElement.style.color = '#fff';
        Game.chatInputElement.style.fontFamily = 'pixel';
        Game.chatInputElement.style.fontSize = '14px';
        Game.chatInputElement.style.outline = 'none';
        Game.chatInputElement.style.display = 'none';
        document.body.appendChild(Game.chatInputElement);
    }
};

Game.displayAchievementDock = function(){
    Game.achBar = Game.scene.add.sprite(274, Game.barY+1, 'atlas1', 'newach').setOrigin(0);
    Game.HUD.add(Game.achBar);
    Game.achBar.setVisible(false);
    
    // We handle the up/down animation dynamically
    
    var token = Game.scene.add.sprite(192, -35, 'atlas1', 'tokens_0').setOrigin(0);
    Game.achBar.tokenSprite = token;
    
    var sparks = Game.scene.add.sprite(192, -35, 'atlas1', 'achsparks_0').setOrigin(0);
    if (!Game.scene.anims.exists('glitter')) {
        Game.scene.anims.create({
            key: 'glitter',
            frames: Game.scene.anims.generateFrameNames('atlas1', { prefix: 'achsparks_', start: 0, end: 5 }),
            frameRate: 7,
            repeat: -1
        });
    }
    sparks.play('glitter');
    
    var titleStyle = {
        fontFamily: 'pixel',
        fontSize: '14px',
        color: "#f4d442",
        stroke: "#000000",
        strokeThickness: 3
    };
    var nameStyle = {
        fontFamily: 'pixel',
        fontSize: '16px',
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3
    };
    
    var titleText = Game.scene.add.text(133, 20, 'New Achievement Unlocked!', titleStyle).setOrigin(0);
    Game.achBar.achName = Game.scene.add.text(133, 40, 'A true Warrior!', nameStyle).setOrigin(0);
    
    // Using Container would have been better, but we can't easily add children to Sprites in Phaser 3.
    // Let's create a temporary container instead of sprite for achBar
    var achBarContainer = Game.scene.add.container(274, Game.barY+1);
    achBarContainer.add([Game.achBar, token, sparks, titleText, Game.achBar.achName]);
    Game.HUD.add(achBarContainer);
    
    Game.achBarContainer = achBarContainer;
    Game.achBarContainer.setVisible(false);
};

Game.computeLifeBarWidth = function(){
    // Based on the amount of life the player has, compute how many pixels wide the health bar should be
    return Math.max(Game.healthBarWidth*(Game.player.life/Game.player.maxLife),1);
};

Game.createLifeBar = function(lifeX,lifeY){
    var width = Game.computeLifeBarWidth();
    Game.health = Game.scene.add.container(lifeX+20, lifeY+4);
    Game.health.add(Game.scene.add.tileSprite(0, 0, width, 18, 'life', 0).setOrigin(0));
    Game.health.add(Game.scene.add.sprite(width, 0, 'life', 1).setOrigin(0));
};

Game.createMarker = function(){
    Game.markerGroup = Game.scene.add.container();
    Game.markerGroup.setDepth(2);
    Game.marker = Game.scene.add.sprite(0,0, 'atlas1', 'marker_0').setOrigin(0);
    Game.markerGroup.add(Game.marker);
    Game.marker.setAlpha(0.5);
    Game.marker.canSee = true;
    Game.marker.collide = false;
    document.getElementById('game').style.cursor = Game.cursor;
};

Game.updateMarker = function(x,y,collide) {
    Game.marker.setPosition(x,y);
    Game.marker.setFrame(collide ? 'marker_1' : 'marker_0');
    Game.marker.collide = collide;
};

Game.messageIn = function(txt){
    var msg = Game.messages.find(m => !m.activeMsg);
    if(!msg) return;
    msg.activeMsg = true;
    msg.setVisible(true);
    msg.setAlpha(0);
    msg.text = txt;
    msg.y = Game.barY+20;
    
    Game.scene.tweens.add({
        targets: msg,
        y: Game.barY+8,
        alpha: 1,
        duration: 200
    });
    
    if(Game.HUDmessage) Game.messageOut(Game.HUDmessage);
    Game.HUDmessage = msg;
    
    Game.scene.time.delayedCall(3000, () => {
        if(Game.HUDmessage === msg) Game.HUDmessage = null;
        Game.messageOut(msg);
    });
};

Game.messageOut = function(msg){
    Game.scene.tweens.add({
        targets: msg,
        y: Game.barY,
        alpha: 0,
        duration: 200,
        onComplete: () => {
            msg.activeMsg = false;
            msg.setVisible(false);
        }
    });
};

Game.toggleChat = function(){
    if(Game.chatBar.visible){
        Game.chatButton.setFrame('talkicon_0');
        Game.chatInputElement.style.display = 'none';
        Game.chatBar.setVisible(false);
        if (Game.chatInputElement.value) {
            var txt = Game.chatInputElement.value;
            Game.player.displayBubble(txt);
            Client.sendChat(txt);
        }
        Game.chatInputElement.value = '';
    } else {
        Game.chatButton.setFrame('talkicon_2');
        Game.chatBar.setVisible(true);
        Game.chatInputElement.style.display = 'block';
        Game.chatInputElement.focus();
        
        Game.chatInputElement.onkeydown = function(e) {
            if(e.key === 'Enter') {
                Game.toggleChat();
            }
        };
    }
};

Game.updateNbConnected = function(nb){
    if(!Game.nbConnectedText) return;
    Game.nbConnected = nb;
    Game.nbConnectedText.text = Game.nbConnected+' player'+(Game.nbConnected > 1 ? 's' : '');
};

// ===========================
// MAP CODE : Map & NPC-related code

Game.displayMap = function(){
    Game.groundMapLayers = this.add.container();
    Game.highMapLayers = this.add.container();
    Game.map = this.make.tilemap({ key: 'map' });
    var tileset = Game.map.addTilesetImage('tilesheet', 'tileset');
    Game.map.gameLayers = [];
    for(var i = 0; i < Game.map.layers.length; i++) {
        var layer = Game.map.createLayer(Game.map.layers[i].name, tileset, 0, 0);
        layer.setVisible(true); // temporary true to test
        if (i <= Game.nbGroundLayers - 1) {
            Game.groundMapLayers.add(layer);
        } else {
            Game.highMapLayers.add(layer);
        }
        Game.map.gameLayers[i] = layer;
    }
    
    this.input.on('pointerup', Game.handleMapClick, this);
    Game.createDoorsMap();

    this.cameras.main.setBounds(0, 0, Game.map.widthInPixels, Game.map.heightInPixels);
    this.physics.world.setBounds(0, 0, Game.map.widthInPixels, Game.map.heightInPixels);

    Game.map.tileset = {
        gid: 1,
        tileProperties: Game.map.tilesets[0].tileProperties || {}
    };

    Game.createCollisionArray();
};

Game.createCollisionArray = function(){
    Game.collisionArray = [];
    for(var y = 0; y < Game.map.height; y++){
        var col = [];
        for (var x = 0; x < Game.map.width; x++) {
            var collide = false;
            for (var l = 0; l < Game.map.gameLayers.length; l++) {
                var tile = Game.map.getTileAt(x, y, true, Game.map.gameLayers[l]);
                if (tile && tile.index > 0) {
                    var tileProperties = Game.map.tileset.tileProperties[tile.index - Game.map.tileset.gid];
                    if (tileProperties && tileProperties.hasOwnProperty('c')) {
                        collide = true;
                        break;
                    }
                }
            }
            col.push(+collide);
        }
        Game.collisionArray.push(col);
    }
    if (Game.easystar) {
        Game.easystar.setGrid(Game.collisionArray);
        Game.easystar.setAcceptableTiles([0]);
    }
};

Game.createDoorsMap = function(){ // Create the associative array mapping coordinates to doors/teleports
    Game.doors = new spaceMap();
    for (var d = 0; d < Game.map.objects.doors.length; d++) {
        var door = Game.map.objects.doors[d];
        var position = Game.computeTileCoords(door.x, door.y);
        Game.doors.add(position.x, position.y, {
            to: new Phaser.Point(door.properties.x * Game.map.tileWidth, door.properties.y * Game.map.tileWidth), // Where does the door teleports to
            camera: (door.properties.hasOwnProperty('cx') ? new Phaser.Point(door.properties.cx * Game.map.tileWidth, door.properties.cy * Game.map.tileWidth): null), // If set, will lock the camera at these coordinates (use for indoors locations)
            orientation: door.properties.o, // What should be the orientation of the player after teleport
            follow: door.properties.hasOwnProperty('follow'), // Should the camera keep following the player, even if indoors (automatically yes if outdoors)
            // Below are the camera bounds in case of indoors following
            min_cx: door.properties.min_cx,
            min_cy: door.properties.min_cy,
            max_cx: door.properties.max_cx,
            max_cy: door.properties.max_cy
        });
    }
};

Game.displayScenery = function(){
    var scenery = Game.db.scenery.scenery;
    Game.groundMapLayers.forEach(function(layer){
        for(var k = 0; k < scenery.length; k++) {
            Game.map.createFromTiles(Game.map.tileset.gid+scenery[k].id, -1, // tile id, replacemet
                'tileset',layer,// key of new sprite, layer
                Game.scenery, // group added to
                {
                    frame: scenery[k].frame,
                    nbFrames: scenery[k].nbFrames,
                    rate: 2
                });
        }
    });
    Game.scenery.setAll('visible',false);
    Game.scenery.forEach(Game.basicAnimation,this);
};

Game.displayNPC = function() {
    var entities = game.cache.getJSON('entities'); // mapping from object IDs to sprites, the sprites being keys for the appropriate json file
    for (var e = 0; e < Game.map.objects.entities.length; e++) {
        var object = Game.map.objects.entities[e];
        if (!entities.hasOwnProperty(object.gid - 1961)) continue; // 1961 is the starting ID of the npc tiles in the map ; this follows from how the map was made in the original BrowserQuest
        var entityInfo = entities[object.gid - 1961];
        if(entityInfo.npc) Game.basicAtlasAnimation(Game.entities.add(new NPC(object.x, object.y, entityInfo.sprite)));
    }
};

// ===========================
// Mouse and click-related code

Game.enableClick = function(){
    this.clickEnabled = true;
};

Game.disableClick = function() {
    this.clickEnabled = false;
};

Game.handleClick = function(){
    // If click is enabled, return true to the calling function to allow player to click,
    // then disable any clicking for time clickDelay
    if (this.clickEnabled){
        // re-enable the click after time clickDelay has passed
        game.time.events.add(this.clickDelay, this.enableClick, this);
        Game.disableClick();
        return true;
    }
    return false;
};

Game.handleCharClick = function(character){ // Handles what happens when clicking on an NPC
    if (Game.handleClick()) {
        // character is the sprite that was clicked
        var end = Game.computeTileCoords(character.x, character.y);
        end.y++; // So that the player walks to place himself in front of the NPC
        // NPC id to keep track of the last line said to the player by each NPC; since there can be multiple identical NPC
        // (e.g. the guards), the NPC ids won't do ; however, since there can be only one NPC at a given location, some
        // basic "hash" of its coordinates makes for a unique id, as follow
        var cid = character.x + '_' + character.y;
        // Game.player.dialoguesMemory keeps track of the last line (out of the multiple an NPC can say) that a given NPC has
        // said to the player; the following finds which one it is, and increment it to display the next one
        var lastline;
        if (Game.player.dialoguesMemory.hasOwnProperty(cid)) {
            // character.dialogue is an array of all the lines that an NPC can say. If the last line said is the last
            // of the array, then assign -1, so that no line will be displayed at the next click (and then it will resume from the first line)
            if (Game.player.dialoguesMemory[cid] >= character.dialogue.length) Game.player.dialoguesMemory[cid] = -1;
        } else {
            // If the player has never talked to the NPC, start at the first line
            Game.player.dialoguesMemory[cid] = 0;
        }
        lastline = Game.player.dialoguesMemory[cid]++; // assigns to lastline, then increment
        var action = {
            action: 1, // talk
            id: cid,
            text: (lastline >= 0 ? character.dialogue[lastline] : ''), // if -1, don't display a bubble
            character: character
        };
        Game.player.prepareMovement(end, 2, action, 0, true); // true : send path to server
    };
};

Game.handleChestClick = function(chest){ // Handles what happens when clicking on a chest
    if (Game.handleClick()) {
        // chest is the sprite that was clicked
        var end = Game.computeTileCoords(chest.x, chest.y);
        var action = {
            action: 4, // chest
            x: end.x,
            y: end.y
        };
        Game.player.prepareMovement(end, 0, action, 0, true); // true : send path to server
    }
};

Game.handleLootClick = function(loot){ // Handles what happens when clicking on an item
    if (Game.handleClick()) {
        // loot is the sprite that was clicked
        Game.player.prepareMovement(Game.computeTileCoords(loot.x, loot.y), 0, {action: 0}, 0, true); // true : send path to server
    }
};

Game.handleMapClick = function(layer,pointer){ // Handles what happens when clicking on an empty tile to move
    if (Game.handleClick()) {
        // layer is the layer object that was clicked on, pointer is the mouse
        if (!Game.marker.collide && Game.view.contains(pointer.worldX, pointer.worldY)) { // To avoid trigger movement to collision cells or cells below the HUD
            var end = Game.computeTileCoords(Game.marker.x, Game.marker.y);
            Game.player.prepareMovement(end, 0, {action: 0}, 0, true); // true : send path to server
        }
    }
};

Game.handleMonsterClick = function(monster){ // Handles what happens when clicking on a monster
    if (Game.handleClick()) {
        // monster is the sprite that was clicked on
        var end = Game.computeTileCoords(monster.x, monster.y);
        var action = {
            action: 3, // fight
            id: monster.id
        };
        Game.player.prepareMovement(end, 0, action, 0, true); // true : send path to server
    }
};

Game.manageMoveTarget = function(x,y){
    // The move target is the green animated square that appears where the player is walking to.
    // This function takes care of displaying it or hiding it.
    var targetX = x * Game.map.tileWidth;
    var targetY = y * Game.map.tileWidth;
    if(Game.moveTarget) {
        Game.moveTarget.visible = true;
        Game.moveTarget.x = targetX;
        Game.moveTarget.y = targetY;
    }else{
        Game.moveTarget = Game.markerGroup.add(game.add.sprite(targetX, targetY, 'atlas1'));
        Game.moveTarget.animations.add('rotate', Phaser.Animation.generateFrameNames('target_', 0, 3), 15, true);
        Game.moveTarget.animations.play('rotate');
    }
    Game.marker.visible = false;
};

Game.setHoverCursors = function(sprite,cursor){ // Sets the appearance of the mouse cursor when hovering a specific sprite
    // sprite is the sprite that to apply the hover to
    // cursor is the url of the image to use as a cursor
    sprite.inputEnabled = true;
    sprite.events.onInputOver.add(function () {
        game.canvas.style.cursor = cursor;
        Game.marker.canSee = false; // Make the white position marker invisible
    }, this);
    sprite.events.onInputOut.add(function () {
        game.canvas.style.cursor = Game.cursor;
        Game.marker.canSee = true;
    }, this);
    sprite.events.onDestroy.add(function(){ // otheriwse, if sprite is destroyed while the cursor is above it, it'll never fire onInputOut!
        game.canvas.style.cursor = Game.cursor;
        Game.marker.canSee = true;
    },this);
};

Game.resetHoverCursors = function(sprite){
    // sprite is the sprite whose hover events have to be purged
    sprite.events.onInputOver.removeAll();
    sprite.events.onInputOut.removeAll();
};

// ===================
// Speech bubbles and HP code (stuff that appears above players)

// dictionary of the fill and stroke colors to use to display different kind of HP
var colorsDict = {
    'heal': {
        fill: "#00ad00",
        stroke: "#005200"
    },
    'hurt':{
        fill: '#ad0000',
        stroke: '#520000'
    },
    'hit':{
        fill: '#ffffff',
        stroke: '#000000'
    }
};

Game.makeHPtexts = function(){ // Create a pool of HP texts to (re)use when needed during the game
    Game.HPGroup = game.add.group();
    for(var b = 0; b < 60; b++){
        Game.HPGroup.add(game.add.text(0, 0, '', {
            font: '20px pixel',
            strokeThickness: 2
        }));
    }
    Game.HPGroup.setAll('exists',false);
};

Game.displayHP = function(txt,color,target,delay){ // Display hit points above a sprite
    // txt is the value to display
    // target is the sprite above which the hp should be displayed
    // delay is the amount of ms to wait before tweening the hp
    var hp = Game.HPGroup.getFirstExists(false); // Get HP from a pool instead of creating a new object
    hp.text = txt;
    hp.fill = colorsDict[color].fill;
    hp.stroke = colorsDict[color].stroke;
    hp.lifespan = Phaser.Timer.SECOND * 2; // Disappears after 2sec
    hp.alpha = 1;
    hp.x = target.x + 10;
    hp.y = target.y-30;
    var tween = game.add.tween(hp);
    tween.to({y:hp.y-25,alpha: 0}, Phaser.Timer.SECOND * 2,null, false, delay);
    tween.start();
    hp.exists = true;
};

Game.playerSays = function(id,txt){
    // Display the chat messages received from the server above the players
    // txt is the string to display in the bubble
    var player = Game.charactersPool[id];
    player.displayBubble(txt);
};

Game.makeBubble = function(){ // Create a speech bubble
    var bubble = game.add.sprite(0,0);
    bubble.addChild(game.add.sprite(0,0, 'bubble',0)); // Top left corner
    bubble.addChild(game.add.tileSprite(Game.speechBubbleCornerSize,0,0,Game.speechBubbleCornerSize, 'bubble',1)); // top side
    bubble.addChild(game.add.sprite(0,0, 'bubble',2)); // top right corner

    bubble.addChild(game.add.tileSprite(0,Game.speechBubbleCornerSize,Game.speechBubbleCornerSize,0, 'bubble',3)); // left side
    bubble.addChild(game.add.tileSprite(Game.speechBubbleCornerSize,Game.speechBubbleCornerSize,0,0, 'bubble',4)); // center
    bubble.addChild(game.add.tileSprite(0,Game.speechBubbleCornerSize,Game.speechBubbleCornerSize,0, 'bubble',5)); // right side

    bubble.addChild(game.add.sprite(0,0, 'bubble',6)); // bottom left corner
    bubble.addChild(game.add.tileSprite(Game.speechBubbleCornerSize,0,0,Game.speechBubbleCornerSize, 'bubble',7)); // bottom side
    bubble.addChild(game.add.sprite(0,0, 'bubble',8)); // bottom right corner
    bubble.addChild(game.add.sprite(0,0, 'atlas1','tail')); // tail
    var txt = bubble.addChild(game.add.text(0,0, '', {
        font: '14px pixel',
        fill: "#ffffff",
        stroke: "#000000",
        strokeThickness: 2
    }));
    txt.maxWidth = 200;
    txt.alpha = 1.5;
    return bubble;
};

// ================================
// Main update code

Game.markerHasMoved = function(){
    return (Game.previousMarkerPosition.x != Game.markerPosition.x || Game.previousMarkerPosition.y != Game.markerPosition.y);
};

Game.sortEntities = function(){ // Sort the members of the "entities" group according to their y value, so that they overlap nicely
    Game.entities.sort('y', Phaser.Group.SORT_ASCENDING);
};

Game.update = function(){ // Main update loop of the client
    if(!Game.playerIsInitialized) return;
    var cell = Game.computeTileCoords(game.input.activePointer.worldX, game.input.activePointer.worldY);
    Game.markerPosition.x = cell.x * Game.map.tileWidth;
    Game.markerPosition.y = cell.y * Game.map.tileWidth;

    if(Game.chatInput.visible && !Game.chatInput.focus) Game.toggleChat(); // Trick to make the chat react to pressing "enter"

    if(Game.player.hasMoved()) Game.checkCameraBounds();

    if(Game.markerHasMoved()) {
        Game.computeView();
        Game.marker.visible = (Game.marker.canSee && Game.view.contains(Game.markerPosition.x,Game.markerPosition.y));

        if (Game.marker.visible) { // Check if the tile below the marker is collidable or not, and updae the marker accordingly
            //var tiles = [];
            var collide = false;
            for (var l = 0; l < Game.map.gameLayers.length; l++) {
                var tile = Game.map.getTile(cell.x, cell.y, Game.map.gameLayers[l]);
                if (tile) {
                    //tiles.push(tile.index);
                    var tileProperties = Game.map.tileset.tileProperties[tile.index - Game.map.tileset.gid];
                    if (tileProperties) {
                        if (tileProperties.hasOwnProperty('c')) {
                            collide = true;
                            break;
                        }
                    }
                }
            }
            //console.log(tiles);

            Game.updateMarker(Game.markerPosition.x, Game.markerPosition.y, collide);
            Game.previousMarkerPosition.set(Game.markerPosition.x, Game.markerPosition.y);
        }
    }
};

Game.render = function(){ // Use to display debug information, not used in production
    /*game.debug.cameraInfo(game.camera, 32, 32);
    Game.entities.forEach(function(sprite){
        game.debug.spriteBounds(sprite);
    },this);
    game.debug.spriteBounds(Game.player);
    game.debug.text(game.time.fps || '--', 2, 14, "#00ff00");*/
};