import { UIContainerBase, UITextBox, UITextInputNode, type InnerLineData } from 'ascii-game-engine'
import type { ServerConnection } from '../net/ServerConnection'

export class UIChatNode extends UIContainerBase {
  private _conn: ServerConnection
  private _inputNode: UITextInputNode
  private _msgBox: UITextBox

  constructor(conn: ServerConnection) {
    super()
    this._conn = conn
    this._inputNode = new UITextInputNode('msg:')
    this._msgBox = new UITextBox([])
    this.addChild(this._msgBox, {})
    this.addChild(this._inputNode, { y: 1 })
  }

  loaded(): void {
    this.listen(
      this._conn.on('message', (msg) => {
        switch (msg.type) {
          case 'playerJoined':
            /*this._players.push(msg.player)
          this._rebuildPlayerList()
          this._appendChat(`  ${msg.player.name} joined`)*/
            break
          case 'playerLeft':
            /*this._players = this._players.filter((p) => p.id !== msg.player.id)
          this._rebuildPlayerList()
          this._appendChat(`  ${msg.player.name} left`)*/
            break
          case 'playerReadyChanged': {
            /*const idx = this._players.findIndex((p) => p.id === msg.player.id)
          if (idx !== -1) this._players[idx] = msg.player
          this._rebuildPlayerList()
          const label = msg.player.ready ? 'ready' : 'not ready'
          this._appendChat(`  ${msg.player.name} is ${label}`)*/
            break
          }
          case 'matchStart':
            /*this._onMatchStart(msg.players)*/
            break
          case 'error':
            /*this._appendChat(`  [error] ${msg.message}`)*/
            break
        }
      }),
    )
  }

  getInnerLineData(): InnerLineData[] {
    return []
  }

  protected _layoutChildren(): void {
    this._msgBox.w = this.w
    this._msgBox.h = this.h - 2
    this._msgBox.resized()

    this._inputNode.w = this.w
    this._inputNode.y = this.h - 1
    this._inputNode.resized()
  }
}
