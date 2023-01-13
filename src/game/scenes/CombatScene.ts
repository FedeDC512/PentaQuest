import { Scene } from 'phaser'
import { useMainStore } from '../../stores/mainStore'
import { useCombatStore } from '../../stores/combatStore'
import { Entity } from "../../classes/Entity"
import { Player } from "../../classes/Player"
import { Enemy } from "../../classes/Enemy"
import Vector2 = Phaser.Math.Vector2

export default class CombatScene extends Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private sceneStore = useMainStore()
  private combatStore = useCombatStore()
  private players: Map<Entity, Player> = new Map()
  private enemies: Map<Entity, Enemy> = new Map()
  private map!: Phaser.Tilemaps.Tilemap
  private walkLayer!:  Phaser.Tilemaps.TilemapLayer
  private colorR: number = 0xffcc4a
  private colorC: number = 0x23ccaa
  private turn!: boolean
  private initialPos!: Vector2
  private newPos!: Vector2
  private timer = 0
  private passedData: any

  constructor() {
    super({ key: 'CombatScene' })
  }

  init(data: any) {
    this.passedData = data
    this.cursors = this.input.keyboard.createCursorKeys()
  }

  preload() {
    
  }

  randomNumber(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1) + min)
  }

  create() {
    const mainCamera = this.cameras.main
    mainCamera.fadeIn(500, 0, 0, 0)

    this.add.image(25, 275, 'combatBg').setScale(0.8)
    
    const map = this.make.tilemap({ key: 'tiles_Map' })
    this.map = map
    const tileSetBuilding = map.addTilesetImage('building', 'tiles_Building')
    const tileSetOutside = map.addTilesetImage('outside', 'tiles_Outside')
    this.walkLayer = map.createLayer('Bottom', [tileSetBuilding, tileSetOutside], 0, 0)
    map.createLayer('Walk', [tileSetBuilding, tileSetOutside], 0, -32)
    map.createLayer('Roofs', [tileSetBuilding, tileSetOutside], 0, -64)
    map.createLayer('Top', [tileSetBuilding, tileSetOutside], 0, -96)
    map.createLayer('More Top', [tileSetBuilding, tileSetOutside], 0, -128)

    this.cameras.main.setZoom(1.25).centerOn(0, 0).setOrigin(0)
    this.cameras.main.setBounds(-this.scale.gameSize.width + this.map.widthInPixels + 25, 60, this.map.widthInPixels, this.map.heightInPixels)

    this.sceneStore.$onAction(({ name, args }) => {
      if (name === 'changeScene') {
        mainCamera.fadeOut(500, 0, 0, 0)
        mainCamera.on('camerafadeoutcomplete', () => this.scene.stop().wake(args[0]))
      }
    })

    this.sceneStore.party.filter(p => p.health > 0).forEach(p => {
      let randomX = this.randomNumber(3, 10)
      let randomY = this.randomNumber(3, 10)
      if (this.players.size > 0) {
        while ([...this.enemies.keys(), ...this.players.keys()]
          .findIndex(v => v.getInitPosition().x == randomX && v.getInitPosition().y == randomY) != -1) {
          randomX = this.randomNumber(3, 10)
          randomY = this.randomNumber(3, 10)
        }
      }
      const player = new Entity(this, p.name.toLowerCase(), new Vector2(randomX, randomY))
      player.sprite.anims.play({ key: "Idle", repeat: -1 })
      this.players.set(player, p)
    })

    this.combatStore.enemies.forEach(e => {
      let randomX = this.randomNumber(3, 10)
      let randomY = this.randomNumber(3, 10)
      if (this.enemies.size > 0) {
        while ([...this.enemies.keys(), ...this.players.keys()]
          .find(v => v.getInitPosition().x == randomX && v.getInitPosition().y == randomY ) != undefined) {
          randomX = this.randomNumber(3, 10)
          randomY = this.randomNumber(3, 10)
        }
      }
      const enemy = new Entity(this, e.name.toLowerCase(), new Vector2(randomX, randomY))
      enemy.sprite.anims.play({ key: "Idle", repeat: -1 })
      this.enemies.set(enemy, e)
    })

    const gridEngineConfig = {
      characters: [
        ...Array.from(this.players.keys()).map(p => p.getCharacterConfig(["cg1"])), 
        ...Array.from(this.enemies.keys()).map(e => e.getCharacterConfig(["cg1"]))
      ]
    }

    this.gridEngine.create(this.map, gridEngineConfig)
    this.gridEngine.movementStarted().subscribe(({ direction }) => {
      this.getCurrentEntity().sprite.flipX = direction.includes("left")
      this.getCurrentEntity().sprite.anims.play({ key: "Run right", repeat: 1 , frameRate: 10 })
    })
    this.gridEngine.movementStopped().subscribe(({ direction }) => {
      this.getCurrentEntity().sprite.anims.play({ key: "Idle", repeat: -1 })
    })

    this.combatStore.$onAction(({ name, args }) => {
      if (name === 'actionAttack') {
        this.getCurrentEntity().sprite.anims.play({ key: "Attack", repeat: 1, frameRate: 10 })
          .on('animationcomplete', () => this.getCurrentEntity().sprite.anims.play({ key: 'Idle', repeat: -1, frameRate: 10 }))
      }
      if (name === 'actionMove') {
        if (args[0]) this.startMovement()
        else this.stopMovement()
      }
    })

    this.input.keyboard.on("keydown-THREE", this.startMovement)

    this.sound.stopByKey("stageSong")
    if (this.passedData.node == 10) this.sound.play('adminSong', { loop: true })
    else if (this.passedData.node == 6) this.sound.play('regitareSong', { loop: true })
    else this.sound.play('combatSong', { loop: true })
  }

  getCurrentEntity() {
    const currentEntity = Array.from(this.players.entries()).find(v => v[1].name == this.combatStore.currentEntity?.name)
    return currentEntity![0]
  }

  startMovement() {
    this.initialPos = new Vector2(this.getCurrentEntity().getPosition().x, this.getCurrentEntity().getPosition().y)
    this.tintRadius(this.map, this.initialPos.y, this.initialPos.x, 2, this.colorR)
    this.tintTile(this.walkLayer.layer, this.initialPos.x, this.initialPos.y, this.colorC)
    this.newPos = this.initialPos
    this.turn = true
  }

  stopMovement() {
    const colorbase = 16777215
    for (const arr of this.walkLayer.layer.data) {
      for (const tile of arr) {
        tile.tint = colorbase
      }
    }
    this.turn = false
  }

  update() {
    this.timer++
    if (this.timer % 3 === 0){
      this.time.paused = true
      if (this.turn) {
        if (!this.combatStore.moveMode && this.combatStore.moveDirection != "") 
          this.newPos = this.moveTile(this.newPos.x, this.newPos.y, this.combatStore.moveDirection)
        else this.newPos = this.moveTile(this.newPos.x, this.newPos.y)
        if ((this.combatStore.moveMode && this.cursors.space.isDown) || (!this.combatStore.moveMode && this.combatStore.isConfirmed)){
          this.combatStore.isConfirmed = false
          if (this.checkTile(this.newPos, this.initialPos, 3)){
            this.stopMovement()
            this.getCurrentEntity().movePlayerTo(this.newPos)
            this.combatStore.currentTurn += 1
          } else console.warn("Movimento impossibile, riprova")
        }
      }
      this.time.paused = false
    }
  }

  tintRadius(tilemap: Phaser.Tilemaps.Tilemap, posX: number, posY: number, radius: number, color: number) {
    const manhattanDist = (x1: number, y1: number, x2: number, y2: number) => Math.abs(x1 - x2) + Math.abs(y1 - y2)
    for (let i = 0; i < tilemap.layers.length; i++) {
      for (let x = 0; x <= radius; x++) {
        for (let y = 0; y <= radius; y++) {
          if (manhattanDist(posX, posY, posX + x, posY + y) <= radius) {
            tilemap.layers[i].tilemapLayer.layer.data[posX + x][posY + y].tint = color;
          }
          if (manhattanDist(posX, posY, posX - x, posY + y) <= radius) {
            tilemap.layers[i].tilemapLayer.layer.data[posX - x][posY + y].tint = color;
          }
          if (manhattanDist(posX, posY, posX + x, posY - y) <= radius) {
            tilemap.layers[i].tilemapLayer.layer.data[posX + x][posY - y].tint = color;
          }
          if (manhattanDist(posX, posY, posX - x, posY - y) <= radius) {
            tilemap.layers[i].tilemapLayer.layer.data[posX - x][posY - y].tint = color;
          }
        }
      }
    }
  }

  tintTile(layer: Phaser.Tilemaps.LayerData, posX: number, posY: number, color: number): void {
    for (const arr of layer.data){
      for (const tile of arr){
        if (tile.x === posX && tile.y === posY){
          tile.tint = color
          return;
        }
      }
    }
  }

  moveTile(x: number, y: number, direction?: string): Vector2 {
    switch (true) {
      case direction != "" ? direction == "left" : this.cursors.left.isDown:
        if (this.checkTile(new Vector2(x-1,y),new Vector2(this.initialPos.x, this.initialPos.y),2)) {
          this.tintTile(this.walkLayer.layer, x, y, this.colorR)
        } else this.tintTile(this.walkLayer.layer, x, y, 16777215)
        this.tintTile(this.walkLayer.layer, x - 1, y, this.colorC)
        this.combatStore.moveDirection = ""
        return new Vector2(x - 1, y)
      case direction != "" ? direction == "right" : this.cursors.right.isDown:
        if (this.checkTile(new Vector2(x+1,y),new Vector2(this.initialPos.x, this.initialPos.y),3)) {
          this.tintTile(this.walkLayer.layer, x, y, this.colorR)
        } else this.tintTile(this.walkLayer.layer, x, y, 16777215)
        this.tintTile(this.walkLayer.layer, x + 1, y, this.colorC)
        this.combatStore.moveDirection = ""
        return new Vector2(x + 1, y)
      case direction != "" ? direction == "up" : this.cursors.up.isDown:
        if (this.checkTile(new Vector2(x,y-1),new Vector2(this.initialPos.x, this.initialPos.y),3)) {
          this.tintTile(this.walkLayer.layer, x, y, this.colorR)
        } else this.tintTile(this.walkLayer.layer, x, y, 16777215)
        this.tintTile(this.walkLayer.layer, x, y - 1, this.colorC)
        this.combatStore.moveDirection = ""
        return new Vector2(x, y - 1)
      case direction != "" ? direction == "down" : this.cursors.down.isDown:
        if (this.checkTile(new Vector2(x,y+1),new Vector2(this.initialPos.x, this.initialPos.y),3)) {
          this.tintTile(this.walkLayer.layer, x, y, this.colorR)
        } else this.tintTile(this.walkLayer.layer, x, y, 16777215)
        this.tintTile(this.walkLayer.layer, x, y + 1, this.colorC)
        this.combatStore.moveDirection = ""
        return new Vector2(x, y + 1)
      default:
        this.combatStore.moveDirection = ""
        return new Vector2(x, y)
    }
  }

  checkTile(newPos: Phaser.Math.Vector2, initpos: Phaser.Math.Vector2, radius: number): boolean {
    const manhattanDist = (x1: number, y1: number, x2: number, y2: number) => Math.abs(x1 - x2) + Math.abs(y1 - y2)
    return manhattanDist(initpos.x, initpos.y, newPos.x, newPos.y) < radius
  }
}
