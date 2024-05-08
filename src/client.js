const http = require('http');
const Debug = require('debug');
const pump = require('pump');
const EventEmitter = require('events');

// A client encapsulates req/res handling using an agent
//
// If an agent is destroyed, the request handling will error
// The caller is responsible for handling a failed request
class Client extends EventEmitter {
  constructor(id) {
    super();

    this.agents = [];
    this.currentAgentIndex = 0;
    this.id = id;
    this.debug = Debug(`lt:Client[${this.id}]`);
  }

  get agent() {
    const agent = this.agents[this.currentAgentIndex];
    this.currentAgentIndex = (this.currentAgentIndex + 1) % this.agents.length;
    return agent;
  }

  addAgent(agent) {
    let graceTimeout;
    const agentIndex = this.agents.length;

    this.agents.push(agent);

    const close = () => {
      clearTimeout(graceTimeout);
      agent.destroy();
      this.agents.splice(agentIndex, 1);

      if (this.agents.length == 0) {
        this.emit('close');
      }
    };
    // client is given a grace period in which they can connect before they are _removed_
    graceTimeout = setTimeout(() => {
      close();
    }, 1000).unref();

    agent.on('online', () => {
      this.debug('client online %s', this.id);
      clearTimeout(graceTimeout);
    });

    agent.on('offline', () => {
      this.debug('client offline %s', this.id);

      // if there was a previous timeout set, we don't want to double trigger
      clearTimeout(graceTimeout);

      // client is given a grace period in which they can re-connect before they are _removed_
      graceTimeout = setTimeout(() => {
        close();
      }, 1000).unref();
    });

    // TODO(roman): an agent error removes the client, the user needs to re-connect?
    // how does a user realize they need to re-connect vs some random client being assigned same port?
    agent.once('error', (err) => {
      close();
    });
  }

  stats() {
    return this.agents.map(agent => agent.stats());
  }

  close() {
    for (let i=0; i<this.agents.length; i++) {
      this.agent.destroy();
    }
    
    this.emit('close');
  }

  handleRequest(req, res) {
    this.debug('> %s', req.url);
    const opt = {
      path: req.url,
      agent: this.agent,
      method: req.method,
      headers: req.headers
    };

    const clientReq = http.request(opt, (clientRes) => {
      this.debug('< %s', req.url);
      // write response code and headers
      res.writeHead(clientRes.statusCode, clientRes.headers);

      // using pump is deliberate - see the pump docs for why
      pump(clientRes, res);
    });

    // this can happen when underlying agent produces an error
    // in our case we 504 gateway error this?
    // if we have already sent headers?
    clientReq.once('error', (err) => {
      // TODO(roman): if headers not sent - respond with gateway unavailable
    });

    // using pump is deliberate - see the pump docs for why
    pump(req, clientReq);
  }

  handleUpgrade(req, socket) {
    this.debug('> [up] %s', req.url);
    socket.once('error', (err) => {
      // These client side errors can happen if the client dies while we are reading
      // We don't need to surface these in our logs.
      if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') {
        return;
      }
      console.error(err);
    });

    this.agent.createConnection({}, (err, conn) => {
      this.debug('< [up] %s', req.url);
      // any errors getting a connection mean we cannot service this request
      if (err) {
        socket.end();
        return;
      }

      // socket met have disconnected while we waiting for a socket
      if (!socket.readable || !socket.writable) {
        conn.destroy();
        socket.end();
        return;
      }

      // websocket requests are special in that we simply re-create the header info
      // then directly pipe the socket data
      // avoids having to rebuild the request and handle upgrades via the http client
      const arr = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < (req.rawHeaders.length - 1); i += 2) {
        arr.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      }

      arr.push('');
      arr.push('');

      // using pump is deliberate - see the pump docs for why
      pump(conn, socket);
      pump(socket, conn);
      conn.write(arr.join('\r\n'));
    });
  }
}

module.exports = Client;