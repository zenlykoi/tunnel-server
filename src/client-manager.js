const { hri } = require('human-readable-ids');
const Debug = require('debug');

const Client = require('./client');
const TunnelAgent = require('./tunnel-agent');

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

    this.debug = Debug('lt:ClientManager');

    // This is totally wrong :facepalm: this needs to be per-client...
    this.graceTimeout = null;
  }

  // create a new tunnel with `id`
  // if the id is already used, a random id is assigned
  // if the tunnel could not be created, throws an error
  async newClient(id) {
    const clients = this.clients;
    const stats = this.stats;
    const maxSockets = this.opt.max_tcp_sockets;

    // can't ask for id already is use
    if (!clients[id]) {
      clients[id] = new Client(id);

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
    this.debug('removing client: %s', id);
    const client = this.clients[id];
    if (!client) {
      return;
    }
    --this.stats.tunnels;
    delete this.clients[id];
    client.close();
  }

  hasClient(id) {
    return !!this.clients[id];
  }

  getClient(id) {
    return this.clients[id];
  }
}

module.exports = ClientManager;
