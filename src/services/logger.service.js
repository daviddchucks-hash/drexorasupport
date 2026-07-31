/**
 * services/logger.service.js — Application-wide Winston logger.
 *
 * Writes structured JSON logs to the console (Render surfaces these in
 * the log dashboard). In development, pretty-prints with colours.
 */

'use strict';

const { createLogger, format, transports } = require('winston');
const { combine, timestamp, errors, json, colorize, simple } = format;

const isProd = process.env.NODE_ENV === 'production';

const logger = createLogger({
  level: isProd ? 'info' : 'debug',

  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    isProd ? json() : combine(colorize(), simple()),
  ),

  transports: [
    new transports.Console(),
  ],

  exitOnError: false,
});

// Convenience http level used by Morgan
logger.http = (msg) => logger.log('http', msg);

module.exports = logger;
