const winston = require('winston');
const {format} = winston;
const moment = require('moment-timezone');

const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'blue',
    trace: 'white'
  }
};

const logger = winston.createLogger({
  levels: customLevels.levels,
  format: format.combine(
    format(info => {
      info.level = info.level.toUpperCase()
      return info;
    })(),
    format.colorize(),
    format.timestamp({
      format: () => moment().tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY - HH:mm:ss')
    }),
    format.printf(info => {
      const { timestamp, level, message, ...rest } = info;
      const splat = rest[Symbol.for('splat')];
      const objs = splat ? JSON.parse(JSON.stringify(splat)) : [];
      const meta = objs.length > 0 ? objs.map(obj => JSON.stringify(obj)).join(' ') : '';
      return `[${timestamp}] [${level}] ${message} ${meta}`;
    })
  ),
  transports: [
    new winston.transports.Console()
  ]
});

module.exports = logger;
