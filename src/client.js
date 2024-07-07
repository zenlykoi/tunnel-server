const http = require('http');
const pump = require('pump');
const EventEmitter = require('events');
const logger = require('./logger');

const HEARTBEAT_INTERVAL = 10 * 1000;
const HEARTBEAT_TIMEOUT = 60 * 1000;

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
  }

  get agent() {
    const agent = this.agents[this.currentAgentIndex];
    this.currentAgentIndex = (this.currentAgentIndex + 1) % this.agents.length;
    return agent;
  }

  addAgent(agent) {
    let graceTimeout;

    agent.isAlive = true;
    agent.lastPing = Date.now();

    this.agents.push(agent);

    logger.info(`[client] (${this.id}) added new agent: ${this.agents.length}`);

    const sendPing = () => {
      agent.createConnection({}, (err, conn) => {
        if (err) {
          return;
        }

        conn.write('ping');
        logger.info(`[client] agent (${agent.tcpPort}) ping`);
      });
    }

    const pingInterval = setInterval(() => {
      if (Date.now() - agent.lastPing > HEARTBEAT_TIMEOUT) {
        logger.warn(`[client] agent (${agent.tcpPort}) heartbeat timeout`);
        close();
        clearInterval(pingInterval);
        return;
      }

      sendPing();
    }, HEARTBEAT_INTERVAL);

    agent.on('pong', () => {
      agent.isAlive = true;
      agent.lastPing = Date.now();
      logger.info(`[client] agent (${agent.tcpPort}) received pong`);
    });

    const close = () => {
      if (agent.closed) {
        return;
      }

      clearInterval(pingInterval);
      clearTimeout(graceTimeout);
      agent.destroy();
      const index = this.agents.findIndex(ag => ag.port == agent.tcpPort);

      if (index < 0) {
        logger.error(`[client] (${this.id}) - agent (${agent.tcpPort}) remove error`);
      }

      this.agents.splice(index, 1);

      logger.info(`[client] (${this.id}) removed agent (${agent.tcpPort}), remainning: ${this.agents.length}`);

      if (this.agents.length == 0) {
        this.emit('close');
      }
    };

    // client is given a grace period in which they can connect before they are _removed_
    graceTimeout = setTimeout(() => {
      close();
    }, 1000).unref();

    agent.on('online', () => {
      clearTimeout(graceTimeout);
    });

    agent.on('offline', () => {

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
    logger.info(`[client] (${this.id}) closed`);
  }

  handleRequest(req, res) {
    const opt = {
      path: req.url,
      agent: this.agent,
      method: req.method,
      headers: req.headers
    };

    const clientReq = http.request(opt, (clientRes) => {
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
    socket.once('error', (err) => {
      // These client side errors can happen if the client dies while we are reading
      // We don't need to surface these in our logs.
      if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') {
        return;
      }
      console.error(err);
    });

    this.agent.createConnection({}, (err, conn) => {
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