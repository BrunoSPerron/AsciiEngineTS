import { UIContainerBase, UITextBox, UITextInputNode, type InnerLineData } from 'ascii-game-engine'
import type { ServerConnection } from '../net/ServerConnection'

const MAX_CHAT_LINES = 200

export class UIChatNode extends UIContainerBase {
  private _conn: ServerConnection
  private _inputNode: UITextInputNode
  private _msgBox: UITextBox
  private _chatLines: string[] = []

  constructor(conn: ServerConnection) {
    super()
    this._conn = conn
    this._inputNode = new UITextInputNode('msg', { closeOnSubmit: false })
    this._msgBox = new UITextBox([], 'bottom')
    this.addChild(this._msgBox, {})
    this.addChild(this._inputNode, {})
  }

  loaded(): void {
    this.listen(
      this._inputNode.on('select', (text) => {
        const trimmed = String(text).trim()
        if (!trimmed) return
        this._conn.send({ type: 'message', text: trimmed })
      }),
    )

    this.listen(
      this._conn.on('message', (msg) => {
        switch (msg.type) {
          case 'message':
            this.appendChat(`${msg.player.name}: ${msg.text}`)
            break
          case 'playerJoined':
            this.appendChat(`${msg.player.name} joined`)
            break
          case 'playerLeft':
            this.appendChat(`${msg.player.name} left`)
            break
          case 'playerReadyChanged': {
            const label = msg.player.ready ? 'ready' : 'not ready'
            this.appendChat(`${msg.player.name} is ${label}`)
            break
          }
          case 'error':
            this.appendChat(`  [error] ${msg.message}`)
            break
        }
      }),
    )
  }

  getInnerLineData(): InnerLineData[] {
    return []
  }

  protected _layoutChildren(): void {
    this._msgBox.layout(0, 0, this.w, this.h - 1)
    this._inputNode.layout(0, this.h - 1, this.w, 1)
  }

  appendChat(line: string): void {
    this._chatLines.push(line)
    if (this._chatLines.length > MAX_CHAT_LINES) this._chatLines.shift()
    this._msgBox.content = this._chatLines
  }
}
