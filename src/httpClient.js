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

    getStatus(url, statusKey, values, callback) {
        if (this.debug && this.log) {
            this.log('Getting status: %s', url);
        }
        this.request(url, '', 'GET', (error, response, responseBody) => {
            if (error) {
                callback(error);
                return;
            }
            let statusValue = 0;
            if (statusKey) {
                const originalStatusValue = jp.query(
                    typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody,
                    statusKey,
                    1
                ).pop();
                if (new RegExp(values.open).test(originalStatusValue)) {
                    statusValue = 0;
                } else if (new RegExp(values.closed).test(originalStatusValue)) {
                    statusValue = 1;
                } else if (new RegExp(values.opening).test(originalStatusValue)) {
                    statusValue = 2;
                } else if (new RegExp(values.closing).test(originalStatusValue)) {
                    statusValue = 3;
                }
                if (this.debug && this.log) {
                    this.log('Transformed status value from %s to %s (%s)', originalStatusValue, statusValue, statusKey);
                }
            } else {
                statusValue = responseBody;
            }
            callback(null, statusValue);
        });
    }
}

module.exports = HttpClient;
