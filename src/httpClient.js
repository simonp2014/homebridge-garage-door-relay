const request = require('request');
const jp = require('jsonpath');

class HttpClient {
    constructor(log, options = {}) {
        this.log = log;
        this.debug = options.debug;
        this.http_method = options.http_method || 'GET';
        this.timeout = options.timeout || 3000;
        this.auth = options.auth;
    }

    request(url, body, method, callback) {
        const reqMethod = method || this.http_method;
        if (this.debug && this.log) {
            this.log('HTTP request -> method: %s, url: %s, body: %s', reqMethod, url, body);
        }
        request({
            url: url,
            body: body,
            method: reqMethod,
            timeout: this.timeout,
            rejectUnauthorized: false,
            auth: this.auth,
        }, (error, response, responseBody) => {
            if (this.debug && this.log) {
                if (error) {
                    this.log('HTTP request error: %s', error.message);
                }
            }
            if (callback) {
                callback(error, response, responseBody);
            }
        });
    }
}

module.exports = HttpClient;
