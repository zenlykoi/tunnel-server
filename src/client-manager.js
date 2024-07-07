const { hri } = require('human-readable-ids');
const Client = require('./client');
const TunnelAgent = require('./tunnel-agent');
const logger = require('./logger');

// Manage sets of clients
//
// A client is a "user session" established to service a remote localtunnel client
class ClientManager {
  constructor(opt) {
    this.opt = opt || {};

    // id -> client instance
    this.clients = new Map();

    // statistics
    this.stats = {
      tunnels: 0
    };

    // This is totally wrong :facepalm: this needs to be per-client...
    this.graceTimeout = null;

    this.multiAgents = opt.multiAgents;
  }

  // create a new tunnel with `id`
  // if the id is already used, a random id is assigned
  // if the tunnel could not be created, throws an error
  async newClient(id) {
    const clients = this.clients;
    const stats = this.stats;
    const maxSockets = this.opt.max_tcp_sockets;

    if (!this.multiAgents && clients[id]) {
      id = hri.random();
    }

    // can't ask for id already is use
    if (!clients[id]) {
      clients[id] = new Client(id);
      logger.info(`[client-manager] created new client: ${id}`);

      clients[id].once('close', () => {
        this.removeClient(id);
      });
    }

    const agent = new TunnelAgent({
      clientId: id,
      maxSockets: 10,
    });

    clients[id].addAgent(agent);

    // try/catch used here to remove client id
    try {
      const info = await agent.listen();
      ++stats.tunnels;
      return {
        id: id,
        port: info.port,
        max_conn_count: maxSockets,
      };
    }
    catch (err) {
      this.removeClient(id);
      // rethrow error for upstream to handle
      throw err;
    }
  }

  removeClient(id) {
    const client = this.clients[id];
    if (!client) {
      return;
    }
    --this.stats.tunnels;
    delete this.clients[id];
    client.close();
    logger.info(`[client-manager] removed client: ${id}`);
  }

  hasClient(id) {
    return !!this.clients[id];
  }

  getClient(id) {
    return this.clients[id];
  }
}

module.exports = ClientManager;
