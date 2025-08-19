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
            switchOff = false,
            switchOffDelay = 2,
            autoLock = false,
            autoLockDelay = 20,
            manufacturer = packageJson.author.name,
            serial = packageJson.version,
            model = packageJson.name,
            firmware = packageJson.version,
            username = null,
            password = null,
            timeout = 3000,
            webhookPort = null,
            http_method = 'GET',
            polling = false,
            pollInterval = 120,
            statusURL,
            statusKey = '$.inputs[0].input',
            statusValueOpen = '0',
            statusValueClosed = '1',
            statusValueOpening = '2',
            statusValueClosing = '3',
            debug = false
        } = config;

        Object.assign(this, {
            name, openURL, closeURL, openTime, closeTime, switchOff, switchOffDelay,
            autoLock, autoLockDelay, manufacturer, serial, model, firmware,
            username, password, timeout, webhookPort, http_method, polling,
            pollInterval, statusURL, statusKey, statusValueOpen, statusValueClosed,
            statusValueOpening, statusValueClosing
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
                    if (this.autoLock) this._delayedAction(this.autoLockDelay, this.autoLockFunction.bind(this));
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

    autoLockFunction() {
        this._debugLog('autoLockFunction called');
        this.log('Waiting %s seconds for autolock', this.autoLockDelay);
        setTimeout(() => {
            this.service.setCharacteristic(Characteristic.TargetDoorState, 1);
            this.log('Autolocking...');
        }, this.autoLockDelay * 1000);
    }

    switchOffFunction() {
        this._debugLog('switchOffFunction called');
        this.log('Waiting %s seconds for switch off', this.switchOffDelay);
        setTimeout(() => {
            this.log('SwitchOff...');
            this._httpRequest(this.closeURL, '', this.http_method, () => { });
        }, this.switchOffDelay * 1000);
    }

    _delayedAction(delay, action) {
        setTimeout(action, delay * 1000);
    }

    handleWebhook() {
        const currentState = this.getCurrentDoorState();
        const targetState = this.service.getCharacteristic(Characteristic.TargetDoorState).value;
        this._debugLog('Webhook received, currentState: %s, targetState: %s', currentState, targetState);
        try {
            switch (currentState) {
                case 1: // Closed -> start opening
                    this.log('Started opening');
                    this.service.getCharacteristic(Characteristic.TargetDoorState).updateValue(0);
                    this._simulateMovement(2, this.openTime, 'opening');
                    break;
                case 0: // Open -> start closing
                    this.log('Started closing');
                    this.service.getCharacteristic(Characteristic.TargetDoorState).updateValue(1);
                    this._simulateMovement(3, this.closeTime, 'closing');
                    break;
                case 2: // Opening -> stop
                case 3: // Closing -> stop
                    this.log('Stopping movement');
                    if (this.movementTimeout) clearTimeout(this.movementTimeout);
                    this.movementTimeout = null;
                    this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(4);
                    break;
                case 4: // Stopped -> reverse direction
                    if (targetState === 0) {
                        this.log('Reversing to close');
                        this.service.getCharacteristic(Characteristic.TargetDoorState).updateValue(1);
                        this._simulateMovement(3, this.closeTime, 'closing');
                    } else {
                        this.log('Reversing to open');
                        this.service.getCharacteristic(Characteristic.TargetDoorState).updateValue(0);
                        this._simulateMovement(2, this.openTime, 'opening');
                    }
                    break;
            }
        } catch (err) {
            this.log.error('Failed to handle webhook: %s', err.message);
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

        if (this.polling) {
            this._debugLog('Polling enabled with interval %s seconds', this.pollInterval);
            this._getStatus(() => { });
            setInterval(() => this._getStatus(() => { }), this.pollInterval * 1000);
        } else {
            this._debugLog('Polling disabled');
            this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(1);
            this.service.getCharacteristic(Characteristic.TargetDoorState).updateValue(1);
        }

        return [this.informationService, this.service];
    }
}

GarageDoorOpener.instances = instances;

module.exports = GarageDoorOpener;
