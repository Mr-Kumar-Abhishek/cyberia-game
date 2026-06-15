class NPC extends window.Human {
    constructor(x, y, key) {
        super(x, y, 'atlas1');
        this.rate = 2;
        this.absorbProperties(Game.npcInfo[key]);
        
        // Use setFrame since key inside atlas1 determines the specific NPC graphic
        this.sprite.setFrame(key + '_0');

        if(this.customAnchor){
            this.sprite.setOrigin(this.customAnchor.x, this.customAnchor.y);
        } else {
            this.sprite.setOrigin(0, 0.25);
        }
        this.shadow = Game.scene.add.sprite(0, 4, 'atlas1', 'shadow');
        this.add(this.shadow);
        this.sendToBack(this.shadow);
        
        this.sprite.setInteractive({ cursor: Game.talkCursor });
        
        var tile = Game.computeTileCoords(this.x, this.y);
        if(Game.collisionArray && Game.collisionArray[tile.y] && Game.collisionArray[tile.y][tile.x] !== undefined) {
            Game.collisionArray[tile.y][tile.x] = 1;
        }
        
        this.sprite.on('pointerup', () => Game.handleCharClick(this));
    }
}
window.NPC = NPC;