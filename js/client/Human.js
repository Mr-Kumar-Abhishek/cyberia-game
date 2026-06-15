/**
 * Created by Jerome on 25-02-17.
 */

class Human extends window.Being {
    constructor(x, y, key) {
        super(x, y, key);
    }

    generateBubble() {
        this.bubble = Game.makeBubble();
        this.bubble.setAlpha(0.6);
        this.bubble.setVisible(false);
        this.bubble.setActive(false);
    }

    displayBubble(text) {
        var maxTextWidth = 200;
        if(!text){
            if(this.bubble) this.killBubble();
            return;
        }
        if(!this.bubble) this.generateBubble();
        this.bubble.setVisible(true);
        this.bubble.setActive(true);
        
        var txt = this.bubble.getAt(10); // assuming text is at index 10 in the container
        txt.setText(text);
        txt.setWordWrapWidth(maxTextWidth);
        
        var width = Phaser.Math.Clamp(txt.width, 30, maxTextWidth);
        if(width % 2 !== 0) width++;
        var height = txt.height;
        
        var ls = Game.speechBubbleCornerSize;
        var rs = ls + width;
        var ts = Game.speechBubbleCornerSize;
        var bs = ts + height;
        
        var tail_offset = (width + 2 * Game.speechBubbleCornerSize) / 2;
        var tail_y = bs + Game.speechBubbleCornerSize;
        
        // Remove old delayed destroy if it exists
        if(this.bubble.timer) this.bubble.timer.remove();
        this.bubble.timer = Game.scene.time.delayedCall(5000, () => {
            this.killBubble();
        });

        txt.setOrigin(0.5, 0);
        txt.x = width/2 + Game.speechBubbleCornerSize;
        txt.y = ts;
        
        // Adjust the parts of the bubble container (assumes standard 9-slice or specific parts order)
        if(this.bubble.list && this.bubble.list.length >= 10) {
            this.bubble.getAt(1).displayWidth = width;
            this.bubble.getAt(2).x = rs;
            this.bubble.getAt(3).displayHeight = height;
            this.bubble.getAt(4).displayWidth = width;
            this.bubble.getAt(4).displayHeight = height;
            this.bubble.getAt(5).x = rs;
            this.bubble.getAt(5).displayHeight = height;
            this.bubble.getAt(6).y = bs;
            this.bubble.getAt(7).displayWidth = width;
            this.bubble.getAt(7).y = bs;
            this.bubble.getAt(8).x = rs;
            this.bubble.getAt(8).y = bs;
            this.bubble.getAt(9).x = tail_offset;
            this.bubble.getAt(9).y = tail_y;
        }
        
        // Follow the character by adding to scene update event
        if (!this.bubbleUpdateEvent) {
            this.bubbleUpdateEvent = Game.scene.events.on('update', () => {
                if(!this.bubble || !this.bubble.active) return;
                this.bubble.x = this.x - (tail_offset - 20);
                this.bubble.y = this.y + (this === window.Game.player ? -this.sprite.displayHeight : -(this.sprite.displayHeight+13)) - txt.displayHeight + 16;
            });
        }
        
        Game.scene.sound.play('chat');
    }

    killBubble() {
        if(this.bubble) {
            this.bubble.setVisible(false);
            this.bubble.setActive(false);
        }
    }
}
window.Human = Human;