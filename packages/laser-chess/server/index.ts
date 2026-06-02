type WebSocketData = {
  createdAt: number
  //authToken: string
}

const server = Bun.serve({
  fetch(req, server) {
    //const cookies = new Bun.CookieMap(req.headers.get('cookie')!)
    const success = server.upgrade(req, {
      data: {
        createdAt: Date.now(),
        //authToken: cookies.get('X-Token') || 'none',
      },
    })
    return success ? undefined : new Response('WebSocket upgrade error', { status: 400 })
  },
  websocket: {
    data: {} as WebSocketData,
    message(ws, message) {
      //const _token = ws.data.authToken

      ws.send(message)
    }, // a message is received
    open(_ws) {}, // a socket is opened
    close(_ws, _code, _message) {}, // a socket is closed
    drain(_ws) {}, // the socket is ready to receive more data
  },
})

console.log(`Listening on ${server.hostname}:${server.port}`)
