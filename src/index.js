const optimist = require('optimist');
const CreateServer = require('./server');
const logger = require('./logger');

const argv = optimist
	.usage('Usage: $0 --port [num]')
	.options('secure', {
		default: false,
		describe: 'use this flag to indicate proxy over https'
	})
	.options('port', {
		default: '80',
		describe: 'listen on this port for outside requests'
	})
	.options('address', {
		default: '0.0.0.0',
		describe: 'IP address to bind to'
	})
	.options('domain', {
		describe: 'Specify the base domain name. This is optional if hosting localtunnel from a regular example.com domain. This is required if hosting a localtunnel server from a subdomain (i.e. lt.example.dom where clients will be client-app.lt.example.come)',
	})
	.options('max-sockets', {
		default: 100,
		describe: 'maximum number of tcp sockets each client is allowed to establish at one time (the tunnels)'
	})
	.options('username', {
		describe: 'Basic auth username',
	})
	.options('password', {
		describe: 'Basic auth password',
	})
  .options('multi-agents', {
    default: false,
		describe: 'Multiple agents mode enabled',
	})
	.argv;

if (argv.help) {
	optimist.showHelp();
	process.exit();
}

const server = CreateServer({
	max_tcp_sockets: argv['max-sockets'],
	secure: argv.secure,
	domain: argv.domain,
  auth: (argv.username && argv.password) ? {
    username: argv.username,
    password: argv.password
  } : null,
  multiAgents: argv['multi-agents']
});

server.listen(argv.port, argv.address, () => {
	logger.info(`Server listening on port: ${server.address().port}`);
});

process.on('SIGINT', () => {
	process.exit();
});

process.on('SIGTERM', () => {
	process.exit();
});

process.on('uncaughtException', (err) => {
	logger.error(err);
});

process.on('unhandledRejection', (reason, promise) => {
	logger.error(reason);
});