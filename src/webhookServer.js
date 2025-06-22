const http = require('http');

class WebhookServer {
    constructor(log, port, debug, handler) {
        this.log = log;
        this.port = port;
        this.debug = debug;
        this.handler = handler;
        this.server = null;
    }

    start() {
        if (!this.port) {
            return;
        }
        try {
            if (this.debug) {
                this.log('Starting webhook server on port %s', this.port);
            }
            this.server = http.createServer((req, res) => {
                if (this.debug) {
                    this.log('Webhook request: %s %s', req.method, req.url);
                }
                try {
                    if (req.url === '/garage/update') {
                        if (typeof this.handler === 'function') {
                            this.handler();
                        }
                        res.statusCode = 200;
                        res.end('OK');
                    } else {
                        res.statusCode = 404;
                        res.end();
                    }
                } catch (err) {
                    this.log.error('Webhook handler error: %s', err.message);
                    res.statusCode = 500;
                    res.end();
                }
            });

            this.server.on('error', err => {
                this.log.error('Webhook server error: %s', err.message);
            });

            this.server.listen(this.port, () => {
                this.log('Webhook server listening on port %s', this.port);
            });
        } catch (err) {
            this.log.error('Failed to start webhook server: %s', err.message);
        }
    }

    stop() {
        if (this.server) {
            try {
                if (this.debug) {
                    this.log('Stopping webhook server on port %s', this.port);
                }
                this.server.close();
                this.log('Webhook server on port %s stopped', this.port);
            } catch (err) {
                this.log.error('Error stopping webhook server: %s', err.message);
            }
        }
    }
}

module.exports = WebhookServer;
