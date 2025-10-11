const packageJson = require('../package.json');
const HttpClient = require('./httpClient');
const WebhookServer = require('./webhookServer');

let Service;
let Characteristic;
const instances = [];

class GarageDoorOpener {
    constructor(log, config) {
        this.log = log;
        this.config = config;

        // Destructure config with defaults
        const {
            name,
            openURL,
            closeURL,
            openTime = 10,
            closeTime = 10,
            autoClose = false,
            autoCloseDelay = 20,
            manufacturer = packageJson.author.name,
            serial = packageJson.version,
            model = packageJson.name,
            firmware = packageJson.version,
            username = null,
            password = null,
            timeout = 3000,
            webhookPort = null,
            http_method = 'GET',
            debug = false
        } = config;

        Object.assign(this, {
            name, openURL, closeURL, openTime, closeTime, 
            autoClose, autoCloseDelay, manufacturer, serial, model, firmware,
            username, password, timeout, webhookPort, http_method, 
        });

        this.auth = (username && password) ? { user: username, pass: password } : undefined;
        this.httpClient = new HttpClient(log, { debug, http_method, timeout, auth: this.auth });

        if (webhookPort) {
            this.webhookServer = new WebhookServer(log, webhookPort, debug, () => this.handleWebhook());
        }

        this.service = new Service.GarageDoorOpener(name);
        this.informationService = null;
        this.movementTimeout = null;
        this.isInSimulatedMovement = false;
        this.debug = debug;

        instances.push(this);
    }

    static configure(service, characteristic) {
        Service = service;
        Characteristic = characteristic;
    }

    identify(callback) {
        this.log('Identify requested!');
        callback();
    }

    _httpRequest(url, body, method, callback) {
        this.httpClient.request(url, body, method, callback);
    }

    _getStatus(callback) {
        if (this.isInSimulatedMovement) {
            this._debugLog('Skipping status update during simulated movement');
            return;
        }
        this.httpClient.getStatus(
            this.statusURL,
            this.statusKey,
            {
                open: this.statusValueOpen,
                closed: this.statusValueClosed,
                opening: this.statusValueOpening,
                closing: this.statusValueClosing,
            },
            (error, statusValue) => {
                if (this.isInSimulatedMovement) {
                    this._debugLog('Skipping status response during simulated movement');
                    return;
                }
                if (error) {
                    this.log.error('Error getting status: %s', error.message);
                    this.service.getCharacteristic(Characteristic.CurrentDoorState)
                        .updateValue(new Error('Polling failed'));
                    callback(error);
                } else {
                    this.service.getCharacteristic(Characteristic.CurrentDoorState)
                        .updateValue(statusValue);
                    this.service.getCharacteristic(Characteristic.TargetDoorState)
                        .updateValue(statusValue);
                    this._debugLog('Updated door state to: %s', statusValue);
                    callback();
                }
            }
        );
    }

    setTargetDoorState(value, callback) {
        const isClosing = value === 1;
        const url = isClosing ? this.closeURL : this.openURL;
        this.log('Setting targetDoorState to %s', value);
        this._debugLog('Requesting URL: %s', url);

        this._simulateMovement(isClosing ? 3 : 2, isClosing ? this.closeTime : this.openTime, isClosing ? 'closing' : 'opening');

        this._httpRequest(url, '', this.http_method, (error) => {
            if (error) {
                this.log.warn('Error setting targetDoorState: %s', error.message);
                callback(error);
            } else {
                if (!isClosing) {
                    if (this.switchOff) this._delayedAction(this.switchOffDelay, this.switchOffFunction.bind(this));
                    if (this.autoClose) this._delayedAction(this.autoCloseDelay, this.autoCloseFunction.bind(this));
                }
                callback();
            }
        });
    }

    getCurrentDoorState() {
        return this.service.getCharacteristic(Characteristic.CurrentDoorState).value;
    }

    _simulateMovement(state, duration, action) {
        this._debugLog(`simulate${action.charAt(0).toUpperCase() + action.slice(1)} called`);
        this.isInSimulatedMovement = true;
        if (this.movementTimeout) clearTimeout(this.movementTimeout);
        this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(state);
        this.movementTimeout = setTimeout(() => {
            this.movementTimeout = null;
            this.isInSimulatedMovement = false;
            this._getStatus(() => { });
            this.log(`Finished ${action}`);
        }, duration * 1000);
    }

    autoCloseFunction() {
        this._debugLog('autoCloseFunction called');
        this.log('Waiting %s seconds for autoClose', this.autoCloseDelay);
        setTimeout(() => {
            this.service.setCharacteristic(Characteristic.TargetDoorState, 1);
            this.log('autoCloseing...');
        }, this.autoCloseDelay * 1000);
    }

    _delayedAction(delay, action) {
        setTimeout(action, delay * 1000);
    }

    handleWebhook(query = {}) {
        const currentState = this.getCurrentDoorState();
        const targetState = this.service.getCharacteristic(Characteristic.TargetDoorState).value;
        this._debugLog('Webhook received, currentState: %s, targetState: %s, query: %j', currentState, targetState, query);

        // Check for open=true in the query string
        if (query.open === 'true') {
            this.log('Webhook sensor: open=true detected');
            // You can trigger opening logic here if needed, e.g.:
            this.service.getCharacteristic(Characteristic.TargetDoorState).updateValue(0);
            this._simulateMovement(2, this.openTime, 'opening');
            return;
        }

        if ('open' in query) {
            // 'open' exists in the query object
        }
    }

    startWebhookServer() {
        if (this.webhookServer) this.webhookServer.start();
    }

    stopWebhookServer() {
        if (this.webhookServer) this.webhookServer.stop();
    }

    _debugLog(...args) {
        if (this.debug) this.log(...args);
    }

    getServices() {
        this._debugLog('Initializing services');
        this.informationService = new Service.AccessoryInformation()
            .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.SerialNumber, this.serial)
            .setCharacteristic(Characteristic.FirmwareRevision, this.firmware);

        this.service.getCharacteristic(Characteristic.TargetDoorState)
            .on('set', this.setTargetDoorState.bind(this));

        // Set the initial state to closed??
        //this._debugLog('Polling disabled');
        //this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(1);
        //this.service.getCharacteristic(Characteristic.TargetDoorState).updateValue(1);

        return [this.informationService, this.service];
    }
}

GarageDoorOpener.instances = instances;

module.exports = GarageDoorOpener;
