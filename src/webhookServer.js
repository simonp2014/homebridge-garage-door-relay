const http = require('http');
const { URL } = require('url');

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
                    // Receive updates to sensor states, e.g.
                    // closed=true or closed=false (if it has a closed sensor)
                    // or
                    // open=true or open=false (if it has an open sensor)
                    //
                    // e.g. http://<homebridgehost>:<webport>/?closed=true
                    //
                    // Use background=true if this was a background update
                    // in case a sensor change was missed
                    //
                    // e.g. http://<homebridgehost>:<webport>/?closed=false&background=true
                    const baseHost = req.headers.host || `localhost:${this.port}`;
                    const parsedUrl = new URL(req.url, `http://${baseHost}`);
                    if (parsedUrl.pathname === '/') {
                        // convert URLSearchParams to plain object with single values
                        const queryParams = Object.fromEntries(parsedUrl.searchParams.entries()); // dictionary of name/value pairs
                        if (typeof this.handler === 'function') {
                            this.handler(queryParams);
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
